/**
 * Qué autores hacen falta cuando el borrador ya viene de memoria.
 *
 * Cuando todas las filas del escenario son `reused` (step existente del
 * framework) o `wording: memory` (step que otro caso validó a score 100 para
 * la misma secuencia de elementos) y no queda ningún gap abierto, no hay nada
 * nuevo que escribir en Screen/Locators: Zorem no corre y el borrador
 * determinista es su resultado. Lorem tampoco redacta —el Gherkin ya está
 * validado— pero la revisión de diseño es del CASO (objetivo y criterio
 * contra lo grabado), no de las interacciones, así que por defecto Lorem
 * corre en modo revisión, con contexto mínimo y sin escribir capas. Solo si
 * el QA lo pide explícitamente (`inheritDesignReview`) se hereda la revisión
 * de los casos de origen y ningún autor corre.
 */
import fs from 'fs';
import path from 'path';
import {
    AgentGeneratedFile,
    AutomationScenario,
    GenerationPlan,
    TestDesignReview,
} from '../../contracts';
import {
    LAYERED_GENERATION_AGENTS,
    LayeredAgentResult,
} from '../../domain/layeredGenerationContracts';
import { readJsonUtf8, writeJsonUtf8 } from '../../../shared';
import { AuthorRole, ROLE_LAYERS, ROLE_OUTPUTS } from './roles';
import { artifact, writeHandoff } from './artifacts';

export type BehaviorAuthoring = 'agent' | 'design-review' | 'deterministic';
export type InteractionAuthoring = 'agent' | 'deterministic';

export interface AuthoringNeeds {
    behavior: BehaviorAuthoring;
    interaction: InteractionAuthoring;
    /** Casos de los que se heredó wording (para la traza del QA). */
    memoryCases: string[];
    reason: string;
}

interface Draft {
    files?: AgentGeneratedFile[];
    actionTrace?: LayeredAgentResult['actionTrace'];
}

function readDraft(packageDirectory: string): Draft | undefined {
    const file = path.join(packageDirectory, 'deterministic-draft.json');
    if (!fs.existsSync(file)) return undefined;
    try {
        return readJsonUtf8<Draft>(file);
    } catch {
        return undefined;
    }
}

export function authoringNeeds(
    packageDirectory: string,
    plan: GenerationPlan,
    options: { inheritDesignReview?: boolean } = {},
): AuthoringNeeds {
    const agents: AuthoringNeeds = { behavior: 'agent', interaction: 'agent', memoryCases: [], reason: '' };
    const scenarioFile = path.join(packageDirectory, 'scenario.json');
    if (!fs.existsSync(scenarioFile)) return { ...agents, reason: 'sin scenario.json' };
    const scenario = readJsonUtf8<AutomationScenario>(scenarioFile);
    const rows = scenario.request?.scenarioRows || [];
    const draft = readDraft(packageDirectory);
    const layers = new Set((draft?.files || []).map(file => file.layer));
    if (!rows.length || !draft?.actionTrace?.length || layers.size < 4) {
        return { ...agents, reason: 'sin borrador completo' };
    }
    if ((plan.unresolvedGapIds || []).length) {
        return { ...agents, reason: `${plan.unresolvedGapIds.length} gap(s) abiertos` };
    }
    const fresh = rows.filter(row => row.status !== 'reused' && row.wording !== 'memory');
    if (fresh.length) {
        return { ...agents, reason: `${fresh.length} step(s) nuevos por redactar` };
    }
    const memoryCases = [...new Set(rows.map(row => row.memory?.caseId || '').filter(Boolean))];
    return {
        behavior: options.inheritDesignReview ? 'deterministic' : 'design-review',
        interaction: 'deterministic',
        memoryCases,
        reason: 'todas las filas vienen del framework o de memoria y no hay gaps abiertos',
    };
}

/**
 * Resultado de un autor tomado del borrador determinista, con su handoff
 * verificado como si lo hubiera escrito el agente.
 */
export function writeDeterministicAuthorResult(
    packageDirectory: string,
    agentsRoot: string,
    plan: GenerationPlan,
    role: AuthorRole,
    memoryCases: string[],
): string {
    const draft = readDraft(packageDirectory);
    if (!draft?.actionTrace?.length) throw new Error('No hay borrador determinista para materializar al autor.');
    const identity = LAYERED_GENERATION_AGENTS[role];
    const stageDirectory = path.join(agentsRoot, identity.directory);
    fs.rmSync(stageDirectory, { recursive: true, force: true });
    fs.mkdirSync(stageDirectory, { recursive: true });
    const layers = new Set<string>(ROLE_LAYERS[role]);
    const outputFile = path.join(stageDirectory, ROLE_OUTPUTS[role]);
    const result: LayeredAgentResult = {
        schemaVersion: 1,
        role,
        recordingId: plan.recordingId,
        planId: plan.planId,
        files: (draft.files || []).filter(file => layers.has(file.layer)),
        actionTrace: draft.actionTrace,
        assumptions: [
            `Resultado materializado por Derek desde el borrador determinista: todas las interacciones ya fueron validadas` +
            (memoryCases.length ? ` en ${memoryCases.join(', ')}` : ' en el framework') + '.',
        ],
    };
    writeJsonUtf8(outputFile, result);
    writeHandoff(path.join(stageDirectory, 'output-handoff.json'), {
        from: role,
        to: 'integration-reviewer',
        fromAgent: LAYERED_GENERATION_AGENTS.owner.name,
        toAgent: LAYERED_GENERATION_AGENTS['integration-reviewer'].name,
        recordingId: plan.recordingId,
        planId: plan.planId,
        stage: role,
        status: 'completed',
        artifacts: [artifact(outputFile, stageDirectory)],
        instructions: ['Resultado determinista desde memoria validada; verificar hash antes de integrar.'],
    });
    return outputFile;
}

export function inheritedDesignReview(memoryCases: string[]): TestDesignReview {
    return {
        status: 'pass',
        summary: 'Revisión de diseño heredada por decisión del QA: todas las interacciones y verificaciones ' +
            'de este caso ya fueron validadas a score 100' +
            (memoryCases.length ? ` en ${memoryCases.join(', ')}` : ' en el framework') +
            '. Nadie revisó el objetivo y el resultado esperado de ESTE caso.',
        issues: [],
        source: 'memory',
    };
}

/** Prompt de Lorem en modo revisión: no redacta, solo evalúa el diseño del caso. */
export function designReviewPrompt(memoryCases: string[]): string {
    return [
        'Eres Lorem, behavior-author bajo la coordinación de Derek, en modo revisión de diseño.',
        'behavior-result.json ya está escrito por Derek con Feature y Steps que otros casos validaron a score 100' +
        (memoryCases.length ? ` (${memoryCases.join(', ')})` : '') + '. No lo modifiques ni lo reescribas.',
        'Lee scenario.json (objective, acceptanceCriteria, actions), generation-plan.json y behavior-result.json.',
        'Evalúa únicamente el diseño funcional de ESTE caso: contrasta objective y acceptanceCriteria con las acciones y verificaciones grabadas.',
        'Usa status "suggestion" si observas oportunidades de mejorar el diseño; son recomendaciones no bloqueantes: no exijas una aserción tras cada interacción, acepta una validación consolidada al final y no inventes requisitos fuera de acceptanceCriteria.',
        'Usa status "pass" cuando no tengas recomendaciones útiles.',
        'Los issue.code permitidos son missing-business-assertion, control-existence-only, acceptance-criteria-mismatch, missing-test-oracle, dependent-variants y ambiguous-objective. actionSequences solo puede referenciar acciones reales. Da al QA una recomendación concreta para volver a grabar.',
        'No incluyas roast ni contenido humorístico.',
        'Escribe solo test-design-review.json y cumple result.schema.json. No explores el framework ni escribas fuera de esta carpeta.',
    ].join(' ');
}

export function designReviewSchema(): object {
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        required: ['status', 'summary', 'issues'],
        properties: {
            status: { enum: ['pass', 'suggestion'] },
            summary: { type: 'string', minLength: 8, maxLength: 500 },
            issues: {
                type: 'array',
                maxItems: 8,
                items: {
                    type: 'object',
                    required: ['code', 'severity', 'message', 'actionSequences', 'recommendation'],
                    properties: {
                        code: { type: 'string' },
                        severity: { enum: ['warning', 'blocking'] },
                        message: { type: 'string' },
                        actionSequences: { type: 'array', items: { type: 'integer' } },
                        recommendation: { type: 'string' },
                    },
                },
            },
        },
        additionalProperties: false,
    };
}

export function designReviewErrors(value: unknown): string[] {
    const errors: string[] = [];
    if (!value || typeof value !== 'object') return ['test-design-review.json debe ser un objeto.'];
    const review = value as Record<string, unknown>;
    if (review.status !== 'pass' && review.status !== 'suggestion') errors.push('status debe ser pass o suggestion.');
    if (typeof review.summary !== 'string' || review.summary.trim().length < 8) errors.push('summary debe tener al menos 8 caracteres.');
    if (!Array.isArray(review.issues) || review.issues.length > 8) errors.push('issues debe ser un array de hasta 8 hallazgos.');
    return errors;
}
