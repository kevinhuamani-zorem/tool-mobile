import crypto from 'crypto';
import type { AutomationScenario, GenerationPlan } from './automationContracts';
import type { PackagedAutomationScenario } from './automationScenarioPackage';

export const AUTOMATION_PACKAGE_PROVENANCE_SCHEMA_VERSION = 1;

export interface AutomationPackageProvenance {
    schemaVersion: 1;
    recordingId: string;
    recordingRevision: number;
    platform: AutomationScenario['platform'];
    planId: string;
    recordingInputHash: string;
    packagedScenarioHash: string;
    generationPlanHash: string;
    preparedAt: string;
}

/** JSON canónico: el hash no depende del orden accidental de las propiedades. */
export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right));
        return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}

export function automationArtifactHash(value: unknown): string {
    return crypto.createHash('sha256').update(canonicalJson(value), 'utf-8').digest('hex');
}

export function createAutomationPackageProvenance(
    recording: AutomationScenario,
    packagedScenario: PackagedAutomationScenario,
    plan: GenerationPlan,
): AutomationPackageProvenance {
    return {
        schemaVersion: AUTOMATION_PACKAGE_PROVENANCE_SCHEMA_VERSION,
        recordingId: recording.recordingId,
        recordingRevision: recording.revision,
        platform: recording.platform,
        planId: plan.planId,
        recordingInputHash: automationArtifactHash(recording),
        packagedScenarioHash: automationArtifactHash(packagedScenario),
        generationPlanHash: automationArtifactHash(plan),
        preparedAt: new Date().toISOString(),
    };
}

function stale(message: string): never {
    throw new Error(
        `El paquete ya no corresponde a la grabación: ${message}. ` +
        'Vuelve a preparar el paquete; la corrección de Copilot solo puede modificar agent-response.json.'
    );
}

/**
 * Valida una corrección contra la instantánea que realmente recibió el agente.
 * No vuelve a resolver contra un framework que la primera aplicación ya mutó.
 */
export function requireTrustedAutomationPackageSnapshot(
    recording: AutomationScenario,
    packagedScenario: PackagedAutomationScenario,
    plan: GenerationPlan,
    provenance: AutomationPackageProvenance,
): AutomationScenario {
    if (provenance.schemaVersion !== AUTOMATION_PACKAGE_PROVENANCE_SCHEMA_VERSION) {
        stale(`versión de procedencia no soportada (${provenance.schemaVersion})`);
    }
    if (recording.recordingId !== provenance.recordingId || packagedScenario.recordingId !== provenance.recordingId) {
        stale('el recordingId cambió');
    }
    if (recording.platform !== provenance.platform || packagedScenario.platform !== provenance.platform) {
        stale('la plataforma cambió');
    }
    if (plan.planId !== provenance.planId || plan.recordingId !== provenance.recordingId) {
        stale('el planId cambió');
    }
    if (automationArtifactHash(recording) !== provenance.recordingInputHash) {
        stale('la grabación original continuó o fue editada');
    }
    if (automationArtifactHash(packagedScenario) !== provenance.packagedScenarioHash) {
        stale('scenario.json fue modificado');
    }
    if (automationArtifactHash(plan) !== provenance.generationPlanHash) {
        stale('generation-plan.json fue modificado');
    }

    const actions = packagedScenario.actions;
    const bySequence = new Map(actions.map(action => [action.sequence, action]));
    const rows = packagedScenario.request.scenarioRows?.map(row => ({
        ...row,
        actions: row.actions.map(reference => {
            const sequence = reference.sequence;
            if (typeof sequence !== 'number' || !Number.isInteger(sequence)) {
                stale('scenarioRows contiene una referencia sin sequence válida');
            }
            const action = bySequence.get(sequence);
            if (!action) stale(`scenarioRows referencia la acción inexistente ${sequence}`);
            return action;
        }),
    }));
    return {
        ...packagedScenario,
        request: {
            ...packagedScenario.request,
            ...(rows ? { scenarioRows: rows } : {}),
        },
    } as AutomationScenario;
}
