import { createHash } from 'crypto';
import type { AgentGeneratedFile, TestDesignReview } from '../contracts';

export const LAYERED_GENERATION_SCHEMA_VERSION = 1;

export type GenerationAgentRole =
    | 'behavior-author'
    | 'interaction-author'
    | 'integration-reviewer';

export type GenerationAgentName = 'Derek' | 'Lorem' | 'Zorem' | 'Sumrak';

export const LAYERED_GENERATION_AGENTS = {
    owner: { name: 'Derek', role: 'orchestrator', directory: 'derek' },
    'behavior-author': { name: 'Lorem', role: 'behavior-author', directory: 'lorem' },
    'interaction-author': { name: 'Zorem', role: 'interaction-author', directory: 'zorem' },
    'integration-reviewer': { name: 'Sumrak', role: 'integration-reviewer', directory: 'sumrak' },
} as const;

export type LayeredGenerationStageState =
    | 'pending'
    | 'running'
    | 'repairing'
    | 'completed'
    | 'failed';

export interface LayeredGenerationArtifact {
    path: string;
    sha256: string;
    bytes: number;
}

/**
 * Handoff pequeño: referencia artefactos por ruta y hash; nunca duplica su
 * contenido. Esto mantiene el contexto acotado y detecta resultados obsoletos.
 */
export interface LayeredGenerationHandoff {
    schemaVersion: 1;
    from: GenerationAgentRole | 'recorder';
    to: GenerationAgentRole;
    fromAgent: GenerationAgentName;
    toAgent: GenerationAgentName;
    recordingId: string;
    planId: string;
    stage: string;
    status: 'ready' | 'completed' | 'failed';
    artifacts: LayeredGenerationArtifact[];
    instructions: string[];
    createdAt: string;
}

export interface LayeredAgentResult {
    schemaVersion: 1;
    role: 'behavior-author' | 'interaction-author';
    recordingId: string;
    planId: string;
    files: AgentGeneratedFile[];
    actionTrace: Array<{
        sequence: number;
        gherkinStep: string;
        screenMethod?: string;
        locatorName?: string;
    }>;
    /** Solo Behavior Author puede proponer observaciones; nunca bloquean código. */
    testDesignReview?: TestDesignReview;
    assumptions?: string[];
}

export interface LayeredGenerationStageReport {
    role: GenerationAgentRole;
    agentName: Exclude<GenerationAgentName, 'Derek'>;
    sessionName: string;
    attempt: number;
    state: LayeredGenerationStageState;
    durationMs: number;
    outputFile: string;
    model?: string;
    requestedModel?: string;
    actualModels?: string[];
    error?: string;
}

export interface LayeredGenerationOwnerReport {
    name: 'Derek';
    role: 'orchestrator';
    state: 'running' | 'completed' | 'failed';
    delegates: Array<{
        name: 'Lorem' | 'Zorem' | 'Sumrak';
        role: GenerationAgentRole;
    }>;
}

export interface LayeredGenerationRunReport {
    schemaVersion: 1;
    recordingId: string;
    planId: string;
    state: 'completed' | 'failed';
    owner: LayeredGenerationOwnerReport;
    stages: LayeredGenerationStageReport[];
    repairAttempts: number;
    startedAt: string;
    completedAt: string;
}

const ROLE_LAYERS: Record<LayeredAgentResult['role'], Set<AgentGeneratedFile['layer']>> = {
    'behavior-author': new Set(['feature', 'steps']),
    'interaction-author': new Set(['screen', 'locators']),
};

export function sha256Text(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function validateLayeredAgentResult(
    value: unknown,
    expectedRole: LayeredAgentResult['role'],
    recordingId: string,
    planId: string,
): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return ['La salida debe ser un objeto JSON.'];
    }
    const candidate = value as Partial<LayeredAgentResult>;
    const errors: string[] = [];
    if (candidate.schemaVersion !== LAYERED_GENERATION_SCHEMA_VERSION) {
        errors.push('schemaVersion debe ser 1.');
    }
    if (candidate.role !== expectedRole) errors.push(`role debe ser ${expectedRole}.`);
    if (candidate.recordingId !== recordingId) errors.push('recordingId no corresponde al paquete.');
    if (candidate.planId !== planId) errors.push('planId no corresponde al plan.');
    if (!Array.isArray(candidate.files)) {
        errors.push('files debe ser un arreglo.');
    } else {
        const allowed = ROLE_LAYERS[expectedRole];
        for (const file of candidate.files) {
            if (!file || typeof file !== 'object') {
                errors.push('Cada archivo debe ser un objeto.');
                continue;
            }
            if (!allowed.has(file.layer)) {
                errors.push(`${expectedRole} no puede producir la capa ${String(file.layer)}.`);
            }
            if (typeof file.path !== 'string' || !file.path.trim()) errors.push('Cada archivo necesita path.');
            if (typeof file.content !== 'string') errors.push('Cada archivo necesita content textual.');
        }
    }
    if (!Array.isArray(candidate.actionTrace)) errors.push('actionTrace debe ser un arreglo.');
    if (candidate.testDesignReview) {
        if (expectedRole !== 'behavior-author') {
            errors.push('Solo behavior-author puede emitir testDesignReview.');
        } else if (!['pass', 'suggestion'].includes(candidate.testDesignReview.status)) {
            errors.push('testDesignReview.status debe ser pass o suggestion.');
        }
    }
    return errors;
}

export function layeredResultSchema(role: LayeredAgentResult['role']): Record<string, unknown> {
    const layers = role === 'behavior-author' ? ['feature', 'steps'] : ['screen', 'locators'];
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        additionalProperties: false,
        required: ['schemaVersion', 'role', 'recordingId', 'planId', 'files', 'actionTrace'],
        properties: {
            schemaVersion: { const: 1 },
            role: { const: role },
            recordingId: { type: 'string' },
            planId: { type: 'string' },
            files: {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['layer', 'path', 'content'],
                    properties: {
                        layer: { enum: layers },
                        path: { type: 'string' },
                        content: { type: 'string' },
                    },
                },
            },
            actionTrace: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['sequence', 'gherkinStep'],
                    properties: {
                        sequence: { type: 'integer' },
                        gherkinStep: { type: 'string' },
                        screenMethod: { type: 'string' },
                        locatorName: { type: 'string' },
                    },
                },
            },
            assumptions: { type: 'array', items: { type: 'string' } },
            ...(role === 'behavior-author' ? {
                testDesignReview: {
                    type: 'object',
                    required: ['status', 'summary', 'issues'],
                    properties: {
                        status: { enum: ['pass', 'suggestion'] },
                        summary: { type: 'string' },
                        issues: { type: 'array', maxItems: 8 },
                    },
                },
            } : {}),
        },
    };
}
