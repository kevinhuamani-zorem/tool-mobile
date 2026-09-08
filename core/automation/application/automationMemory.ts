import type { AutomationAgentResponse, AutomationScenario, AutomationValidation, GenerationPlan, UnresolvedGap } from '../contracts';
import type { GapFragment, InteractionRecall, MemoryFragments } from '../domain/memoryFragments';
import { emptyMemoryFragments } from '../domain/memoryFragments';
import type { MemoryFragmentsPort } from '../ports/memoryFragmentsPort';
import { projectPaths } from '../../workspace';

interface MemoryEntry {
    fingerprint: string;
    version: number;
    qualityScore: number;
    promotedAt: string;
    directory: string;
}

/**
 * Compatibility boundary while the approved-golden index is implemented.
 * Old score-100 cases are archival evidence, never a source for generation.
 * Reads are deliberately empty; there is no fallback that rebuilds old fragments.
 */
export class AutomationMemory implements MemoryFragmentsPort {
    constructor(_root = projectPaths.automationMemory) {}

    fragments(): MemoryFragments { return emptyMemoryFragments(); }
    recallInteractions(_squad: string, _identities: string[], _usedTexts?: Set<string>): InteractionRecall[] | undefined { return undefined; }
    recallGap(_squad: string, _type: UnresolvedGap['type'], _identity: string): GapFragment | undefined { return undefined; }
    learnedVocabulary(): Record<string, string> { return {}; }
    loadLearnedVocabulary(): Record<string, string> { return {}; }
    find(_fingerprint: string): { entry: MemoryEntry; response: AutomationAgentResponse } | null { return null; }

    /** Kept to reject old scripts/callers explicitly instead of silently learning. */
    promote(
        _scenario: AutomationScenario, _plan: GenerationPlan,
        _response: AutomationAgentResponse, _validation: AutomationValidation,
        _gaps?: UnresolvedGap[], _onPromoted?: (entry: MemoryEntry) => void,
    ): MemoryEntry {
        throw new Error('La promoción por score está retirada. Solo los golden aprobados por QA podrán alimentar el nuevo índice.');
    }

    stats(): { successfulCases: number; versions: number; interactions: number; gapDecisions: number } {
        return { successfulCases: 0, versions: 0, interactions: 0, gapDecisions: 0 };
    }

}
