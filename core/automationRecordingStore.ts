import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { AutomationScenario, AUTOMATION_PIPELINE_VERSION, AUTOMATION_SCHEMA_VERSION } from './automationContracts';
import { GenerationRequest, MobilePlatform } from './fwkMobileGenerator';
import { RecordedStep, recordedStepContext } from './models';
import { projectPaths } from './projectPaths';

interface RecordingContext {
    squad: string;
    platform: MobilePlatform;
    environment: string;
}

interface RecordingManifest extends RecordingContext {
    schemaVersion: number;
    pipelineVersion: string;
    recordingId: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
    actionCount: number;
}

export interface EmptyRecordingCleanup {
    removed: string[];
    skipped: number;
}

function atomicJson(file: string, value: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
    fs.renameSync(temporary, file);
}

function readJson<T>(file: string): T | undefined {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
    } catch {
        return undefined;
    }
}

function isSensitiveInput(step: RecordedStep): boolean {
    if (step.action !== 'ESCRIBIR') return false;
    const context = [recordedStepContext(step), step.variableName]
        .filter(Boolean)
        .join(' ');
    return /(?:password|contrase(?:n|ñ)a|clave|pin|otp|token|secret|access\s*key|credential)/i.test(context);
}

function safeStep(step: RecordedStep, sequence: number, platform: MobilePlatform): RecordedStep & { sequence: number } {
    const sensitive = isSensitiveInput(step);
    return {
        ...step,
        sequence,
        platform,
        value: sensitive && step.value ? `<${step.variableName || 'valor'}>` : step.value,
        selectorVerified: Boolean(step.selectorVerified || step.selector),
    };
}

export const recordingPrivacy = { isSensitiveInput };

export function scenarioFingerprint(input: {
    squad: string;
    platform: MobilePlatform;
    actions: RecordedStep[];
    objective: string;
    request: Pick<GenerationRequest,
        'caseId' | 'pathType' | 'tag' | 'dataName' |
        'featureName' | 'scenarioName' | 'fileName' | 'locatorModule'>;
}): string {
    const canonical = input.actions.map(step => ({
        action: step.action,
        contextHint: recordedStepContext(step).toLowerCase(),
        selector: String(step.selector || '').trim().replace(/\s+/g, ' '),
    }));
    return crypto.createHash('sha256').update(JSON.stringify({
        squad: input.squad,
        platform: input.platform,
        objective: input.objective.trim().toLowerCase(),
        request: input.request,
        actions: canonical,
    })).digest('hex');
}

export class AutomationRecordingStore {
    private activeDirectory = '';
    private manifest: RecordingManifest | null = null;

    constructor(private readonly recordingsRoot = projectPaths.recordings) {}

    /**
     * Elimina placeholders creados por sesiones que nunca registraron una
     * acción. La comprobación es deliberadamente estricta: una carpeta con
     * scenario, archivos adicionales o estado inconsistente se conserva para
     * no perder evidencia recuperable.
     */
    pruneEmptyRecordings(): EmptyRecordingCleanup {
        if (!fs.existsSync(this.recordingsRoot)) return { removed: [], skipped: 0 };
        const removed: string[] = [];
        let skipped = 0;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(this.recordingsRoot, { withFileTypes: true });
        } catch {
            return { removed, skipped };
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const directory = path.join(this.recordingsRoot, entry.name);
            if (directory === this.activeDirectory) {
                skipped++;
                continue;
            }
            try {
                const manifest = readJson<RecordingManifest>(path.join(directory, 'manifest.json'));
                const actions = readJson<RecordedStep[]>(path.join(directory, 'actions.json'));
                const files = fs.readdirSync(directory).filter(name => name !== '.DS_Store');
                const isPlaceholder = Boolean(
                    manifest?.recordingId
                    && manifest.actionCount === 0
                    && Array.isArray(actions)
                    && actions.length === 0
                    && !files.includes('scenario.json')
                    && files.every(name => name === 'manifest.json' || name === 'actions.json')
                );
                if (!isPlaceholder) {
                    skipped++;
                    continue;
                }
                fs.rmSync(directory, { recursive: true });
                removed.push(entry.name);
            } catch {
                skipped++;
            }
        }
        return { removed, skipped };
    }

    start(context: RecordingContext): RecordingManifest {
        const now = new Date().toISOString();
        const recordingId = `rec-${crypto.randomUUID()}`;
        const directoryName = `${now.replace(/[:.]/g, '-')}-${recordingId.slice(-8)}`;
        this.activeDirectory = path.join(this.recordingsRoot, directoryName);
        this.manifest = {
            schemaVersion: AUTOMATION_SCHEMA_VERSION,
            pipelineVersion: AUTOMATION_PIPELINE_VERSION,
            recordingId,
            revision: 0,
            createdAt: now,
            updatedAt: now,
            actionCount: 0,
            ...context,
        };
        atomicJson(path.join(this.activeDirectory, 'manifest.json'), this.manifest);
        atomicJson(path.join(this.activeDirectory, 'actions.json'), []);
        return this.manifest;
    }

    /**
     * [visual-recorder] Reengancha una grabacion ya existente como grabacion
     * activa, para que el QA pueda seguir grabando encima (por ejemplo, para
     * agregar el Then que falta) sin perder las acciones ya capturadas.
     *
     * A diferencia de `start`, no crea carpeta: reutiliza la del recording, asi
     * `replaceActions` y `buildScenario` sobreescriben ese mismo paquete y la
     * revision sigue avanzando en vez de dejar dos grabaciones sueltas.
     */
    resume(directory: string): {
        manifest: RecordingManifest;
        actions: RecordedStep[];
        scenario?: AutomationScenario;
    } {
        const manifest = readJson<RecordingManifest>(path.join(directory, 'manifest.json'));
        const scenario = readJson<AutomationScenario>(path.join(directory, 'scenario.json'));
        if (!manifest && !scenario) {
            throw new Error('La grabación no tiene manifest ni scenario; no se puede continuar');
        }
        // actions.json es la fuente viva; scenario.json solo existe si el QA ya
        // llego a preparar el paquete al menos una vez.
        const actions = readJson<RecordedStep[]>(path.join(directory, 'actions.json'))
            || scenario?.actions
            || [];
        const recovered: RecordingManifest = manifest || {
            schemaVersion: AUTOMATION_SCHEMA_VERSION,
            pipelineVersion: AUTOMATION_PIPELINE_VERSION,
            recordingId: scenario!.recordingId,
            revision: scenario!.revision,
            createdAt: scenario!.createdAt,
            updatedAt: scenario!.createdAt,
            actionCount: actions.length,
            squad: scenario!.squad,
            platform: scenario!.platform,
            environment: scenario!.environment,
        };
        this.activeDirectory = directory;
        this.manifest = recovered;
        return { manifest: recovered, actions, scenario };
    }

    replaceActions(actions: RecordedStep[], context: RecordingContext): RecordingManifest {
        if (!this.manifest) this.start(context);
        const normalized = actions.map((step, index) => safeStep(step, index + 1, context.platform));
        this.manifest = {
            ...this.manifest!,
            ...context,
            revision: this.manifest!.revision + 1,
            updatedAt: new Date().toISOString(),
            actionCount: normalized.length,
        };
        atomicJson(path.join(this.activeDirectory, 'actions.json'), normalized);
        atomicJson(path.join(this.activeDirectory, 'manifest.json'), this.manifest);
        return this.manifest;
    }

    buildScenario(input: {
        request: GenerationRequest;
        actions: RecordedStep[];
        objective: string;
        acceptanceCriteria: string;
        environment: string;
    }): { scenario: AutomationScenario; directory: string } {
        const context = {
            squad: input.request.squad,
            platform: input.request.platform,
            environment: input.environment,
        };
        const manifest = this.replaceActions(input.actions, context);
        const actions = input.actions.map((step, index) => safeStep(step, index + 1, input.request.platform));
        const createdAt = new Date().toISOString();
        const request = { ...input.request, createdAt };
        const scenario: AutomationScenario = {
            schemaVersion: AUTOMATION_SCHEMA_VERSION,
            pipelineVersion: AUTOMATION_PIPELINE_VERSION,
            recordingId: manifest.recordingId,
            revision: manifest.revision,
            fingerprint: scenarioFingerprint({
                squad: input.request.squad,
                platform: input.request.platform,
                actions,
                objective: input.objective,
                request,
            }),
            createdAt,
            squad: input.request.squad,
            platform: input.request.platform,
            environment: input.environment,
            objective: input.objective.trim(),
            acceptanceCriteria: input.acceptanceCriteria.trim(),
            request,
            actions,
        };
        atomicJson(path.join(this.activeDirectory, 'scenario.json'), scenario);
        return { scenario, directory: this.activeDirectory };
    }

    getActiveDirectory(): string {
        if (!this.activeDirectory) throw new Error('No existe un recording activo');
        return this.activeDirectory;
    }

    reset(): void {
        this.activeDirectory = '';
        this.manifest = null;
    }
}
