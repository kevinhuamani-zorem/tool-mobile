import path from 'path';
import {
    AutomationAgentResponse,
    AutomationScenario,
    AutomationValidation,
    GenerationPlan,
} from '../contracts';
import { projectPaths } from '../../workspace';
import {
    extendTranslations,
    learnTranslationsFromRenames,
    readJsonUtf8,
    writeJsonUtf8,
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

export class AutomationMemory {
    constructor(private readonly root = projectPaths.automationMemory) {}

    private indexFile(): string { return path.join(this.root, 'index.json'); }
    private vocabularyFile(): string { return path.join(this.root, 'vocabulary.json'); }

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
        extendTranslations(learned);
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
        validation: AutomationValidation
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
        writeJsonAtomic(path.join(absolute, 'scenario.json'), scenario);
        writeJsonAtomic(path.join(absolute, 'generation-plan.json'), plan);
        writeJsonAtomic(path.join(absolute, 'agent-response.json'), response);
        writeJsonAtomic(path.join(absolute, 'validation.json'), validation);
        this.learnVocabulary(plan, response);
        const entry: MemoryEntry = {
            fingerprint: scenario.fingerprint,
            version,
            qualityScore: validation.qualityScore,
            promotedAt: new Date().toISOString(),
            directory,
        };
        index.entries.push(entry);
        writeJsonAtomic(this.indexFile(), index);
        return entry;
    }

    stats(): { successfulCases: number; versions: number } {
        const entries = this.readIndex().entries.filter(entry => entry.qualityScore === 100);
        return {
            successfulCases: new Set(entries.map(entry => entry.fingerprint)).size,
            versions: entries.length,
        };
    }
}
