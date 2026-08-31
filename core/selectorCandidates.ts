import type { AutomationScenario } from './automationContracts';
import { MobilePlatform, roundTrip } from './locatorStrategy';
import type { LocatorTypeName } from './locatorStrategy';
import type { RecordedStep, SelectorCandidate, SelectorCandidateStability } from './models';

export const MAX_PERSISTED_SELECTOR_CANDIDATES = 4;
export const SELECTOR_CANDIDATE_PROTOCOL_VERSION = 3;

const STABILITY_ORDER: Record<SelectorCandidateStability, number> = {
    stable: 0,
    contextual: 1,
    structural: 2,
    manual: 3,
};

function candidateIdentity(candidate: Pick<SelectorCandidate, 'locatorType' | 'locatorValue'>): string {
    return `${candidate.locatorType}\u0000${candidate.locatorValue}`;
}

export function rankSelectorCandidates(candidates: SelectorCandidate[]): SelectorCandidate[] {
    return [...candidates].sort((left, right) =>
        Number(right.primary) - Number(left.primary)
        || STABILITY_ORDER[left.stability] - STABILITY_ORDER[right.stability]
        || left.priority - right.priority
        || left.candidateId.localeCompare(right.candidateId)
    );
}

export function compactSelectorCandidates(
    candidates: SelectorCandidate[],
    primarySelector: string,
    platform: MobilePlatform,
): SelectorCandidate[] {
    const ids = new Set<string>();
    const identities = new Set<string>();
    const normalized = candidates.flatMap(candidate => {
        if (
            !candidate
            || typeof candidate.candidateId !== 'string'
            || typeof candidate.selector !== 'string'
            || typeof candidate.inspectorStrategy !== 'string'
            || typeof candidate.sourceReason !== 'string'
            || !Number.isInteger(candidate.priority)
            || candidate.priority < 0
            || !Object.prototype.hasOwnProperty.call(STABILITY_ORDER, candidate.stability)
            || candidate.verification?.protocolVersion !== SELECTOR_CANDIDATE_PROTOCOL_VERSION
            || candidate.verification.matchCount !== 1
            || candidate.verification.sameElement !== true
        ) {
            return [];
        }
        const selector = candidate.selector.trim();
        const check = roundTrip(selector, platform);
        if (!selector || !check.ok || check.type !== candidate.locatorType || check.value !== candidate.locatorValue) {
            return [];
        }
        const compact: SelectorCandidate = {
            candidateId: candidate.candidateId.trim().slice(0, 128),
            selector,
            inspectorStrategy: candidate.inspectorStrategy.trim().slice(0, 64),
            locatorType: check.type,
            locatorValue: check.value,
            priority: candidate.priority,
            stability: candidate.stability,
            sourceReason: candidate.sourceReason.trim().slice(0, 256),
            primary: selector === primarySelector.trim() && candidate.primary === true,
            verification: {
                protocolVersion: SELECTOR_CANDIDATE_PROTOCOL_VERSION,
                verifiedAt: candidate.verification.verifiedAt,
                matchCount: 1,
                sameElement: true,
            },
        };
        if (!compact.candidateId || !compact.inspectorStrategy || !compact.sourceReason) return [];
        const identity = candidateIdentity(compact);
        if (ids.has(compact.candidateId) || identities.has(identity)) return [];
        ids.add(compact.candidateId);
        identities.add(identity);
        return [compact];
    });
    const ranked = rankSelectorCandidates(normalized).slice(0, MAX_PERSISTED_SELECTOR_CANDIDATES);
    if (ranked.length && !ranked.some(candidate => candidate.primary)) {
        return [];
    }
    return ranked;
}

export function candidateAllowlist(step: RecordedStep, platform: MobilePlatform): Array<{
    candidateId: string;
    selector: string;
    locatorType: LocatorTypeName;
    locatorValue: string;
    primary: boolean;
    stability: SelectorCandidateStability;
    priority: number;
}> {
    // `undefined` pertenece a recordings v1, cuyo store marcaba cualquier
    // selector ejecutado como verificado. Los clientes nuevos envían false de
    // forma explícita, por lo que un texto no verificado ya no se promociona.
    if (!step.selector || step.selectorVerified === false) return [];
    const check = roundTrip(step.selector, platform);
    return [{
        candidateId: `legacy-primary-${step.sequence || 0}`,
        selector: step.selector.trim(),
        locatorType: check.type,
        locatorValue: check.value,
        primary: true,
        stability: 'manual',
        priority: 0,
    }];
}

export interface LocatorCandidatePackage {
    schemaVersion: 1;
    recordingId: string;
    platform: MobilePlatform;
    actions: Array<{
        sequence: number;
        primaryCandidateId: string;
        candidates: SelectorCandidate[];
    }>;
}

export function locatorCandidatePackage(scenario: AutomationScenario): LocatorCandidatePackage {
    return {
        schemaVersion: 1,
        recordingId: scenario.recordingId,
        platform: scenario.platform,
        actions: [],
    };
}

export function requireTrustedLocatorCandidatePackage(
    recordingScenario: AutomationScenario,
    packaged: LocatorCandidatePackage | undefined,
): LocatorCandidatePackage {
    const trusted = locatorCandidatePackage(recordingScenario);
    if (!packaged || JSON.stringify(packaged) !== JSON.stringify(trusted)) {
        throw new Error(
            'locator-candidates.json fue modificado o no coincide con la grabación verificada'
        );
    }
    return trusted;
}

export function attachLocatorCandidatePackage(
    scenario: AutomationScenario,
    packaged: LocatorCandidatePackage | undefined,
): AutomationScenario {
    if (
        packaged
        && (
            packaged.schemaVersion !== 1
            || packaged.recordingId !== scenario.recordingId
            || packaged.platform !== scenario.platform
            || !Array.isArray(packaged.actions)
        )
    ) {
        throw new Error('locator-candidates.json no coincide con la grabación');
    }
    return scenario;
}
