import { roundTrip } from './locatorStrategy';
import type { MobilePlatform } from './locatorStrategy';
import type { SelectorCandidate, SelectorCandidateStability } from './models';
import {
    compactSelectorCandidates,
    SELECTOR_CANDIDATE_PROTOCOL_VERSION,
} from './selectorCandidates';

export interface ReceivedVerifiedLocatorCandidate {
    candidateId: string;
    strategy: string;
    selector: string;
    priority: number;
    stability: SelectorCandidateStability;
    sourceReason: string;
}

export interface VerifiedSelectorCandidateResult {
    primarySelector: string;
    candidates: SelectorCandidate[];
    warnings: string[];
}

export async function independentlyVerifySelectorCandidates(input: {
    candidates: ReceivedVerifiedLocatorCandidate[];
    selectedElementId: string;
    platform: MobilePlatform;
    verifiedAt?: string;
    recorderSelector: (candidate: { strategy: string; selector: string }) => string;
    findElementIds: (selector: string) => Promise<string[]>;
}): Promise<VerifiedSelectorCandidateResult> {
    if (!input.selectedElementId) {
        throw new Error('Inspector no entregó la identidad WebDriver del elemento seleccionado');
    }
    if (!input.candidates.length) throw new Error('Inspector no entregó candidatos verificados');
    const verifiedAt = input.verifiedAt || new Date().toISOString();
    const warnings: string[] = [];
    const validated: SelectorCandidate[] = [];

    for (const [index, candidate] of input.candidates.entries()) {
        const canonicalSelector = input.recorderSelector(candidate);
        try {
            const check = roundTrip(canonicalSelector, input.platform);
            if (!check.ok || !check.composed) {
                throw new Error(check.reason || 'el framework no puede representar el selector');
            }
            const matches = await input.findElementIds(canonicalSelector);
            if (matches.length !== 1) {
                throw new Error(`encontró ${matches.length} elementos en la segunda validación`);
            }
            if (matches[0] !== input.selectedElementId) {
                throw new Error('resolvió un elemento WebDriver distinto al seleccionado');
            }
            if (check.composed !== canonicalSelector) {
                const roundTripMatches = await input.findElementIds(check.composed);
                if (roundTripMatches.length !== 1 || roundTripMatches[0] !== input.selectedElementId) {
                    throw new Error(
                        `TypeLocator.${check.type} no reconstruye el mismo elemento seleccionado`,
                    );
                }
            }
            validated.push({
                candidateId: candidate.candidateId,
                selector: canonicalSelector,
                inspectorStrategy: candidate.strategy,
                locatorType: check.type,
                locatorValue: check.value,
                priority: candidate.priority,
                stability: candidate.stability,
                sourceReason: candidate.sourceReason,
                primary: index === 0,
                verification: {
                    protocolVersion: SELECTOR_CANDIDATE_PROTOCOL_VERSION,
                    verifiedAt,
                    matchCount: 1,
                    sameElement: true,
                },
            });
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            if (index === 0) throw new Error(`Selector primario rechazado: ${reason}`);
            warnings.push(`${candidate.candidateId}: ${reason}`);
        }
    }
    const primarySelector = input.recorderSelector(input.candidates[0]);
    const candidates = compactSelectorCandidates(validated, primarySelector, input.platform);
    if (!candidates.length || !candidates[0].primary) {
        throw new Error('El selector primario no superó la validación compacta del recorder');
    }
    return { primarySelector, candidates, warnings };
}
