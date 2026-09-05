import path from 'path';
import {
    AutomationAgentResponse,
    AutomationScenario,
    AutomationValidation,
    GenerationPlan,
    UnresolvedGap,
} from '../contracts';
import {
    GapFragment,
    InteractionRecall,
    MemoryFragments,
    emptyMemoryFragments,
    fragmentsFromValidatedCase,
    mergeMemoryFragments,
    recallGap,
    recallInteractions,
} from '../domain/memoryFragments';
import { MemoryFragmentsPort } from '../ports/memoryFragmentsPort';
import { projectPaths } from '../../workspace';
import {
    extendTranslations,
    learnTranslationsFromRenames,
    readJsonUtf8,
    writeJsonUtf8,
    withFileRollback,
} from '../../shared';

interface MemoryEntry {
    fingerprint: string;
    version: number;
    qualityScore: number;
    promotedAt: string;
    directory: string;
}

interface MemoryIndex {
    schemaVersion: 1;
    entries: MemoryEntry[];
}

function writeJsonAtomic(file: string, value: unknown): void {
    writeJsonUtf8(file, value);
}

export class AutomationMemory implements MemoryFragmentsPort {
    constructor(private readonly root = projectPaths.automationMemory) {}

    private indexFile(): string { return path.join(this.root, 'index.json'); }
    private vocabularyFile(): string { return path.join(this.root, 'vocabulary.json'); }
    private fragmentsFile(): string { return path.join(this.root, 'fragments.json'); }

    /**
     * Fragmentos reutilizables entre recordings (interacciones redactadas y
     * gaps por elemento ya decididos). Ver `domain/memoryFragments`.
     */
    fragments(): MemoryFragments {
        try {
            const document = readJsonUtf8<MemoryFragments>(this.fragmentsFile());
            return {
                schemaVersion: 1,
                interactions: Array.isArray(document.interactions) ? document.interactions : [],
                gaps: Array.isArray(document.gaps) ? document.gaps : [],
            };
        } catch {
            return this.rebuildFragmentsFromCases();
        }
    }

    /**
     * Los casos promocionados antes de que existiera la memoria de fragmentos
     * ya son evidencia validada a 100: la primera lectura los indexa (solo
     * interacciones; sus gaps no se guardaron). Si no hay casos, no escribe.
     */
    private rebuildFragmentsFromCases(): MemoryFragments {
        let merged = emptyMemoryFragments();
        for (const entry of this.readIndex().entries.filter(item => item.qualityScore === 100)) {
            try {
                const directory = path.join(this.root, entry.directory);
                const scenario = readJsonUtf8<AutomationScenario>(path.join(directory, 'scenario.json'));
                const response = readJsonUtf8<AutomationAgentResponse>(path.join(directory, 'agent-response.json'));
                merged = mergeMemoryFragments(merged, fragmentsFromValidatedCase({
                    scenario, response, promotedAt: entry.promotedAt,
                }));
            } catch {
                continue;
            }
        }
        if (merged.interactions.length) writeJsonAtomic(this.fragmentsFile(), merged);
        return merged;
    }

    recallInteractions(squad: string, identities: string[], usedTexts?: Set<string>): InteractionRecall[] | undefined {
        return recallInteractions(this.fragments().interactions, squad, identities, usedTexts);
    }

    recallGap(squad: string, type: UnresolvedGap['type'], identity: string): GapFragment | undefined {
        return recallGap(this.fragments().gaps, squad, type, identity);
    }

    private learnFragments(
        scenario: AutomationScenario,
        response: AutomationAgentResponse,
        gaps: UnresolvedGap[] | undefined,
        promotedAt: string,
    ): MemoryFragments {
        const learned = fragmentsFromValidatedCase({ scenario, response, gaps, promotedAt });
        const merged = mergeMemoryFragments(this.fragments(), learned);
        writeJsonAtomic(this.fragmentsFile(), merged);
        return learned;
    }

    /** Vocabulario ES->EN aprendido de automatizaciones validadas al 100%. */
    learnedVocabulary(): Record<string, string> {
        try {
            const document = readJsonUtf8<{ schemaVersion: 1; translations?: Record<string, string> }>(this.vocabularyFile());
            return { ...(document.translations || {}) };
        } catch {
            return {};
        }
    }

    /** Carga el vocabulario aprendido en el diccionario del proceso. */
    loadLearnedVocabulary(): Record<string, string> {
        const learned = this.learnedVocabulary();
        return learned;
    }

    /**
     * Aprende de los renombres que el agente hizo sobre los nombres que el
     * recorder propuso. Solo se llama con una respuesta validada al 100%, la
     * misma condicion que promociona el caso: la memoria no aprende de fallos.
     */
    private learnVocabulary(plan: GenerationPlan, response: AutomationAgentResponse): Record<string, string> {
        const finalNames = new Map(
            (response.actionTrace || [])
                .filter(trace => trace.locatorName)
                .map(trace => [trace.sequence, trace.locatorName as string]),
        );
        const renames = (plan.resolutions || [])
            .filter(item => item.resolution === 'create' && item.locatorName && finalNames.has(item.sequence))
            .map(item => ({ before: item.locatorName as string, after: finalNames.get(item.sequence)! }))
            .filter(pair => pair.before !== pair.after);
        const learned = learnTranslationsFromRenames(renames);
        if (!Object.keys(learned).length) return {};
        const merged = { ...this.learnedVocabulary(), ...learned };
        writeJsonAtomic(this.vocabularyFile(), { schemaVersion: 1, translations: merged });
        extendTranslations(learned);
        return learned;
    }

    private readIndex(): MemoryIndex {
        try {
            return readJsonUtf8<MemoryIndex>(this.indexFile());
        } catch {
            return { schemaVersion: 1, entries: [] };
        }
    }

    find(fingerprint: string): { entry: MemoryEntry; response: AutomationAgentResponse } | null {
        const entry = this.readIndex().entries
            .filter(candidate => candidate.fingerprint === fingerprint && candidate.qualityScore === 100)
            .sort((left, right) => right.version - left.version)[0];
        if (!entry) return null;
        try {
            const response = readJsonUtf8<AutomationAgentResponse>(
                path.join(this.root, entry.directory, 'agent-response.json')
            );
            return { entry, response };
        } catch {
            return null;
        }
    }

    promote(
        scenario: AutomationScenario,
        plan: GenerationPlan,
        response: AutomationAgentResponse,
        validation: AutomationValidation,
        gaps?: UnresolvedGap[],
        onPromoted?: (entry: MemoryEntry) => void,
    ): MemoryEntry {
        if (!validation.valid || validation.qualityScore !== 100) {
            throw new Error('Solo se versionan automatizaciones validadas al 100%');
        }
        const index = this.readIndex();
        const version = Math.max(0, ...index.entries
            .filter(entry => entry.fingerprint === scenario.fingerprint)
            .map(entry => entry.version)) + 1;
        const directory = path.join('cases', scenario.fingerprint, `v${version}`);
        const absolute = path.join(this.root, directory);
        const files = ['scenario.json', 'generation-plan.json', 'agent-response.json', 'validation.json']
            .map(file => path.join(absolute, file))
            .concat([this.indexFile(), this.vocabularyFile(), this.fragmentsFile()]);
        return withFileRollback(files, () => {
        writeJsonAtomic(path.join(absolute, 'scenario.json'), scenario);
        writeJsonAtomic(path.join(absolute, 'generation-plan.json'), plan);
        writeJsonAtomic(path.join(absolute, 'agent-response.json'), response);
        writeJsonAtomic(path.join(absolute, 'validation.json'), validation);
        const learned = this.learnVocabulary(plan, response);
        const promotedAt = new Date().toISOString();
        this.learnFragments(scenario, response, gaps, promotedAt);
        const entry: MemoryEntry = {
            fingerprint: scenario.fingerprint,
            version,
            qualityScore: validation.qualityScore,
            promotedAt,
            directory,
        };
        index.entries.push(entry);
        writeJsonAtomic(this.indexFile(), index);
        onPromoted?.(entry);
        extendTranslations(learned);
        return entry;
        });
    }

    stats(): { successfulCases: number; versions: number; interactions: number; gapDecisions: number } {
        const entries = this.readIndex().entries.filter(entry => entry.qualityScore === 100);
        const fragments = this.fragments();
        return {
            successfulCases: new Set(entries.map(entry => entry.fingerprint)).size,
            versions: entries.length,
            interactions: fragments.interactions.length,
            gapDecisions: fragments.gaps.length,
        };
    }
}
