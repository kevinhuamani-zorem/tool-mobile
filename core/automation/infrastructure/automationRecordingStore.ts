import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { AutomationScenario, AUTOMATION_PIPELINE_VERSION, AUTOMATION_SCHEMA_VERSION } from '../contracts';
import { GenerationRequest, MobilePlatform } from '../contracts';
import { RecordedStep, recordedStepContext } from '../contracts';
import { projectPaths } from '../../workspace';
import { frameworkLocator, roundTrip } from '../../indexing';
import {
    readJsonUtf8,
    readUtf8File,
    normalizeJsonUnicode,
    utf8TextProblems,
    writeJsonUtf8,
    writeUtf8FileAtomic,
} from '../../shared';

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

function atomicText(file: string, content: string): void {
    writeUtf8FileAtomic(file, content);
}

function atomicJson(file: string, value: unknown): void {
    writeJsonUtf8(file, value);
}

function readJson<T>(file: string): T | undefined {
    try {
        return readJsonUtf8<T>(file);
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

function containsSensitiveValue(
    value: string,
    candidate: string,
    platform: MobilePlatform,
): boolean {
    const secret = value.trim();
    if (!secret) return false;
    if (
        candidate.trim() === secret
        || frameworkLocator(candidate, platform).value.trim() === secret
    ) return true;
    if (secret.length >= 4) return candidate.includes(secret);
    return candidate.includes(`"${secret}"`) || candidate.includes(`'${secret}'`);
}

/**
 * Estrategia y valor con los que el framework reconstruira el selector.
 *
 * Se resuelve al guardar y no al generar porque la grabacion es la evidencia:
 * si el par no reconstruye el selector, el aviso tiene que quedar escrito junto
 * a la accion que lo produjo, no aparecer tres capas mas tarde.
 */
function locatorFields(step: RecordedStep, platform: MobilePlatform): Partial<RecordedStep> {
    if (!step.selector) return {};
    let check;
    try {
        check = roundTrip(step.selector, platform);
    } catch {
        // Sin framework legible se guarda el selector tal cual; el resolver
        // vuelve a intentarlo con el contrato ya resuelto.
        return {};
    }
    return {
        locatorType: check.type,
        locatorValue: check.value,
        locatorWarning: check.ok ? undefined : check.reason,
    };
}

export function prepareRecordedStep(
    step: RecordedStep,
    sequence: number,
    platform: MobilePlatform,
    redactSensitiveValue = true,
): RecordedStep & { sequence: number } {
    step = normalizeJsonUnicode(step);
    for (const value of [
        step.selector,
        step.value,
        step.contextHint,
        step.elementIntent,
        step.description,
        step.variableName,
    ]) {
        if (typeof value !== 'string') continue;
        const corrupted = utf8TextProblems(value).filter(problem => problem.code !== 'non-nfc');
        if (corrupted.length) {
            throw new Error(
                `La acción ${sequence} contiene texto Unicode dañado (${corrupted[0].code}). `
                + 'Vuelve a capturar el valor en UTF-8; el recorder no corrige mojibake automáticamente.'
            );
        }
    }
    const sensitive = isSensitiveInput(step);
    const selectorVerified = step.selectorVerified === undefined
        ? Boolean(step.selector)
        : step.selectorVerified === true;
    if (
        sensitive
        && step.value
        && step.selector
        && containsSensitiveValue(step.value, step.selector, platform)
    ) {
        throw new Error(
            `La acción ${sequence} usa un selector que contiene el valor sensible capturado; ` +
            'selecciona un locator que no dependa de la credencial.'
        );
    }
    return {
        action: step.action,
        sequence,
        platform,
        variableName: step.variableName,
        contextHint: step.contextHint,
        elementIntent: step.elementIntent,
        selector: step.selector,
        value: redactSensitiveValue && sensitive && step.value
            ? `<${step.variableName || 'valor'}>`
            : step.value,
        description: step.description,
        locatorSource: step.locatorSource ? {
            file: step.locatorSource.file,
            module: step.locatorSource.module,
            scope: step.locatorSource.scope,
        } : undefined,
        ...locatorFields(step, platform),
        selectorVerified,
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
        const normalized = actions.map((step, index) =>
            prepareRecordedStep(step, index + 1, context.platform)
        );
        const nextManifest = {
            ...this.manifest!,
            ...context,
            revision: this.manifest!.revision + 1,
            updatedAt: new Date().toISOString(),
            actionCount: normalized.length,
        };
        const actionsFile = path.join(this.activeDirectory, 'actions.json');
        const manifestFile = path.join(this.activeDirectory, 'manifest.json');
        const previousActions = fs.existsSync(actionsFile) ? readUtf8File(actionsFile) : undefined;
        const previousManifest = fs.existsSync(manifestFile) ? readUtf8File(manifestFile) : undefined;
        try {
            atomicJson(actionsFile, normalized);
            atomicJson(manifestFile, nextManifest);
            this.manifest = nextManifest;
            return nextManifest;
        } catch (error) {
            const restore = (file: string, content: string | undefined): void => {
                if (content === undefined) {
                    fs.rmSync(file, { force: true });
                } else {
                    atomicText(file, content);
                }
            };
            try {
                restore(actionsFile, previousActions);
                restore(manifestFile, previousManifest);
            } catch (rollbackError) {
                throw new Error(
                    `Falló la persistencia (${error instanceof Error ? error.message : String(error)}) `
                    + `y también el rollback (${rollbackError instanceof Error
                        ? rollbackError.message
                        : String(rollbackError)}).`
                );
            }
            throw error;
        }
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
        const actions = input.actions.map((step, index) =>
            prepareRecordedStep(step, index + 1, input.request.platform)
        );
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
