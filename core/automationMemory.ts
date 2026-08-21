import fs from 'fs';
import path from 'path';
import {
    AutomationAgentResponse,
    AutomationScenario,
    AutomationValidation,
    GenerationPlan,
} from './automationContracts';
import { projectPaths } from './projectPaths';

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
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
    fs.renameSync(temporary, file);
}

export class AutomationMemory {
    constructor(private readonly root = projectPaths.automationMemory) {}

    private indexFile(): string { return path.join(this.root, 'index.json'); }

    private readIndex(): MemoryIndex {
        try {
            return JSON.parse(fs.readFileSync(this.indexFile(), 'utf-8')) as MemoryIndex;
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
            const response = JSON.parse(fs.readFileSync(
                path.join(this.root, entry.directory, 'agent-response.json'), 'utf-8'
            )) as AutomationAgentResponse;
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
