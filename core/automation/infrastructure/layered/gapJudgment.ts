/**
 * Decisiones sobre gaps: cuales fijo el plan (Derek las firma), cuales son informativas para los autores y cuales exigen juicio de Sumrak; y el enrutado del feedback de reparacion por codigo de regla.
 */
import fs from 'fs';
import path from 'path';
import {
    AutomationAgentResponse,
    GenerationPlan,
} from '../../contracts';
import {
    readJsonUtf8,
} from '../../../shared';
import {
    AuthorRole,
    LayeredRepairFeedback,
    RepairIssue,
} from './roles';

export function expectedGapDecisions(
    packageDirectory: string,
    plan: GenerationPlan,
): Map<string, 'create' | 'reuse'> {
    const expected = new Map<string, 'create' | 'reuse'>();
    const bySequence = new Map<number, 'create' | 'reuse'>();
    for (const resolution of plan.resolutions || []) {
        const decision = resolution.resolution === 'create'
            || resolution.resolution === 'reuse'
            ? resolution.resolution
            : undefined;
        if (!decision) continue;
        if (resolution.gapId) expected.set(resolution.gapId, decision);
        if (Number.isInteger(resolution.sequence)) bySequence.set(resolution.sequence, decision);
    }
    const gapsFile = path.join(packageDirectory, 'gaps.json');
    if (fs.existsSync(gapsFile)) {
        const gaps = readJsonUtf8<{ gaps?: Array<{ id?: string; sequence?: number }> }>(gapsFile).gaps || [];
        for (const gap of gaps) {
            const decision = Number.isInteger(gap.sequence) ? bySequence.get(gap.sequence!) : undefined;
            if (gap.id && decision) expected.set(gap.id, decision);
        }
    }
    return expected;
}

export function alignResolutionsWithPlan(
    packageDirectory: string,
    plan: GenerationPlan,
    resolutions: AutomationAgentResponse['resolutions'],
): AutomationAgentResponse['resolutions'] {
    const expected = expectedGapDecisions(packageDirectory, plan);
    return resolutions.map(resolution => {
        const decision = expected.get(resolution.gapId);
        if (!decision || decision === resolution.decision) return resolution;
        const aligned: any = { ...resolution, decision };
        if (decision === 'create') {
            delete aligned.selectedCandidate;
            delete aligned.replacement;
            delete aligned.symbol;
        }
        return aligned;
    });
}

export interface GapJudgment {
    /** Resoluciones que Derek firma: el plan ya fijo la decision. */
    fixed: AutomationAgentResponse['resolutions'];
    /** Gaps que siguen exigiendo juicio; solo estos viajan a los agentes. */
    open: string[];
    /**
     * Gaps que no piden una decision sino trabajo de los autores (renombrar a
     * ingles): viajan a Lorem y Zorem, Derek los firma y Sumrak no los juzga.
     */
    informational: string[];
}

/** Gaps que los autores atienden al escribir; nunca requieren una decision de Sumrak. */
export function isAuthorInformationalGap(gapId: string): boolean {
    return gapId === 'gap-english-naming' || /^gap-weak-assertion-\d+$/.test(gapId);
}

/**
 * Separa los gaps abiertos entre los que el plan ya decidio y los que no.
 *
 * La respuesta integrada solo lleva `{ gapId, decision, reason }`, y el
 * integrador rechaza cualquier decision distinta de la que el plan fijo por
 * secuencia (`expectedGapDecisions`). Enviarle esos gaps a un agente es pagar
 * contexto y una sesion para que repita lo que ya esta escrito: Derek los
 * firma, los agentes solo ven los que requieren juicio y, si no queda
 * ninguno, Sumrak no abre sesion.
 */
export function gapJudgment(packageDirectory: string, plan: GenerationPlan): GapJudgment {
    const gapsFile = path.join(packageDirectory, 'gaps.json');
    const gaps = fs.existsSync(gapsFile)
        ? readJsonUtf8<{ gaps?: Array<{ id?: string; sequence?: number }> }>(gapsFile).gaps || []
        : [];
    const gapById = new Map(gaps.filter(gap => gap.id).map(gap => [gap.id!, gap]));
    const expected = expectedGapDecisions(packageDirectory, plan);
    const judgment: GapJudgment = { fixed: [], open: [], informational: [] };
    for (const gapId of plan.unresolvedGapIds || []) {
        const gap = gapById.get(gapId);
        if (!gap) {
            judgment.open.push(gapId);
            continue;
        }
        if (isAuthorInformationalGap(gapId)) {
            judgment.informational.push(gapId);
            const fixedDecision = expected.get(gapId);
            judgment.fixed.push({
                gapId,
                decision: fixedDecision || 'renamed-by-authors',
                reason: gapId === 'gap-english-naming'
                    ? 'Los autores nombran en inglés al escribir su capa; el normalizador aplica el diccionario y el validador advierte lo que quede en español.'
                    : `Aviso para los autores: la verificación usa un selector genérico que se conserva tal cual; Derek mantiene la decisión ${fixedDecision || 'del plan'}.`,
            });
            continue;
        }
        if (gapId === 'gap-extend-existing-artifacts') {
            judgment.fixed.push({
                gapId,
                decision: 'extend-existing',
                reason: 'Derek conserva las rutas update fijadas por el plan y extiende los artefactos existentes.',
            });
            continue;
        }
        const decision = expected.get(gapId);
        if (!decision) {
            judgment.open.push(gapId);
            continue;
        }
        judgment.fixed.push({
            gapId,
            decision,
            reason: Number.isInteger(gap.sequence)
                ? `Derek conserva la decisión determinista ${decision} que el plan fijó para la acción ${gap.sequence}.`
                : `Derek conserva la decisión determinista ${decision} fijada por el plan.`,
        });
    }
    return judgment;
}

/**
 * Codigos del validador por capa responsable. Son la misma tabla con la que se
 * proyecta `validation-contract.json` a cada autor y con la que Derek dirige el
 * feedback de reparacion: un error llega solo al agente que puede corregirlo.
 */
export const BEHAVIOR_RULE_CODES = new Set([
    'assertion', 'duplicate-step-definition', 'framework-scenario-collision',
    'framework-step-collision', 'generic-template-gherkin', 'imperative-gherkin',
    'missing-examples', 'reused-step-rewritten', 'ungrouped-technical-action',
    'verbatim-context-hint', 'platform-tag', 'behavior-path',
    // El import del Screen Object y su alias viven en Steps: los escribe
    // Lorem. Zorem no puede corregirlos y encadenaba rondas de feedback (15
    // min en TC-10239) por un import sin `.ts` que no era suyo.
    'screen-import-alias', 'screen-alias', 'screen-alias-usage',
]);

export const INTERACTION_RULE_CODES = new Set([
    'completion-duplicate', 'completion-file', 'completion-key', 'completion-occupied',
    'completion-platform', 'completion-sequence', 'completion-shape',
    'completion-unauthorized', 'create-locator-contract', 'destructive-update',
    'duplicate-screen-method', 'framework-locator-collision', 'invalid-locator-access',
    'invented-selector', 'locator-type-mismatch', 'platform-coverage',
    'trace-locator', 'trace-screen-method',
    'framework-symbol', 'framework-import-alias', 'missing-update-target', 'interaction-path',
]);

export const INTEGRATION_RULE_CODES = new Set([
    'schema', 'recording-id', 'plan-id', 'resolution-shape', 'resolution-needs-shape',
    'resolution-needs-query', 'resolution-needs-args', 'trace-shape', 'trace',
    'missing-gap-resolution', 'gap-resolution-decision', 'unresolved-gap-without-reason',
    'existing-automation', 'duplicate-layer', 'missing-layer', 'extra-layer',
]);

/**
 * Dirige cada error al agente que puede corregirlo.
 *
 * El `code` del validador es la fuente: cada regla vive en una familia con
 * capa responsable. Solo los errores sin codigo (contratos del propio
 * orquestador o mensajes de `output`/`preview`) se clasifican por su texto, y
 * un error que nadie reconoce llega a los tres para no perderse.
 */
/** Capa dueña de cada archivo del plan, para enrutar por el archivo del error. */
export function layerOwnersOf(plan?: Pick<GenerationPlan, 'files'>): Map<string, AuthorRole | 'integration-reviewer'> {
    const owners = new Map<string, AuthorRole | 'integration-reviewer'>();
    for (const file of plan?.files || []) {
        const normalized = String(file.path || '').replace(/\\/g, '/');
        owners.set(normalized, file.layer === 'feature' || file.layer === 'steps'
            ? 'behavior-author'
            : 'interaction-author');
    }
    return owners;
}

export function classifyValidationErrors(
    issues: Array<RepairIssue | string>,
    plan?: Pick<GenerationPlan, 'files'>,
): LayeredRepairFeedback {
    const normalized = issues.map(issue => typeof issue === 'string' ? { message: issue } : issue);
    const owners = layerOwnersOf(plan);
    const feedback: LayeredRepairFeedback = {
        all: [...new Set(normalized.map(issue => issue.message).filter(Boolean))],
        behavior: [],
        interaction: [],
        integration: [],
    };
    const seen = new Set<string>();
    for (const issue of normalized) {
        if (!issue.message || seen.has(issue.message)) continue;
        seen.add(issue.message);
        let behavior = false;
        let interaction = false;
        let integration = false;
        // El archivo al que apunta el error decide antes que cualquier tabla:
        // un error sobre Steps es de Lorem aunque hable de Screen Object, y
        // una regla nueva o mal clasificada no puede mandar a un autor a
        // corregir una capa que no es suya.
        const owner = issue.file ? owners.get(String(issue.file).replace(/\\/g, '/')) : undefined;
        if (owner === 'behavior-author') behavior = true;
        else if (owner === 'interaction-author') interaction = true;
        else if (issue.code && BEHAVIOR_RULE_CODES.has(issue.code)) behavior = true;
        else if (issue.code && INTERACTION_RULE_CODES.has(issue.code)) interaction = true;
        else if (issue.code && INTEGRATION_RULE_CODES.has(issue.code)) integration = true;
        else {
            const lower = issue.message.toLowerCase();
            behavior = /(feature|scenario|gherkin|step definition|steps\b|tag\b|@android|@ios)/.test(lower);
            interaction = /(screenobject|screen object|screenmethod|locator|getter|typelocator|selector|import|api existente|apis existentes)/.test(lower);
            integration = /(resoluci[oó]n|gap abierto|gap-|recordingid|planid|trazabilidad)/.test(lower);
        }
        if (behavior) feedback.behavior.push(issue.message);
        if (interaction) feedback.interaction.push(issue.message);
        if (integration) feedback.integration.push(issue.message);
        if (!behavior && !interaction && !integration) {
            feedback.behavior.push(issue.message);
            feedback.interaction.push(issue.message);
            feedback.integration.push(issue.message);
        }
    }
    return feedback;
}
