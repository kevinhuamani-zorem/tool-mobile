import fs from 'fs';
import path from 'path';
import {
    normalizeAgentOperationalBudgets,
    AutomationAgentResponse,
    GenerationPlan,
} from '../contracts';
import {
    GenerationAgentRole,
    LAYERED_GENERATION_AGENTS,
    LayeredAgentResult,
    LayeredGenerationHandoff,
    LayeredGenerationRunReport,
    LayeredGenerationStageReport,
    layeredResultSchema,
    sha256Text,
    validateLayeredAgentResult,
} from '../domain/layeredGenerationContracts';
import type { AgentProvider } from '../ports/agentProvider';
import { readJsonUtf8, readUtf8File, writeJsonUtf8 } from '../../shared';
import { DeterministicDraftBuilder } from '../../generation';
import { resolveAgentHangStopMs } from './agentRuntimeGuards';

const INPUT_FILES = [
    'scenario.json',
    'generation-plan.json',
    'gaps.json',
    'hints.json',
    'query-results.json',
    'reuse-context.json',
    'resolved-context.json',
    'unresolved-context.json',
    'framework-api.json',
    'english-vocabulary.json',
    'validation-contract.json',
    'screen-object-contract.js',
    'deterministic-draft.json',
];

const ROLE_INPUT_FILES: Record<AuthorRole, string[]> = {
    'behavior-author': [
        'scenario.json',
        'generation-plan.json',
        'gaps.json',
        'hints.json',
        'query-results.json',
        'reuse-context.json',
        'english-vocabulary.json',
        'validation-contract.json',
        'deterministic-draft.json',
    ],
    'interaction-author': [
        'scenario.json',
        'generation-plan.json',
        'gaps.json',
        'query-results.json',
        'reuse-context.json',
        'framework-api.json',
        'english-vocabulary.json',
        'validation-contract.json',
        'screen-object-contract.js',
        'deterministic-draft.json',
    ],
};

const INTEGRATION_INPUT_FILES = [
    'scenario.json',
    'generation-plan.json',
    'gaps.json',
    'query-results.json',
    'reuse-context.json',
    'validation-contract.json',
    'agent-response.schema.json',
];

const ROLE_LAYERS = {
    'behavior-author': ['feature', 'steps'] as const,
    'interaction-author': ['screen', 'locators'] as const,
    'integration-reviewer': ['feature', 'steps', 'screen', 'locators'] as const,
};

const ROLE_OUTPUTS = {
    'behavior-author': 'behavior-result.json',
    'interaction-author': 'interaction-result.json',
    'integration-reviewer': 'agent-response.json',
} as const;

const DELEGATES = [
    { name: LAYERED_GENERATION_AGENTS['behavior-author'].name, role: 'behavior-author' as const },
    { name: LAYERED_GENERATION_AGENTS['interaction-author'].name, role: 'interaction-author' as const },
    { name: LAYERED_GENERATION_AGENTS['integration-reviewer'].name, role: 'integration-reviewer' as const },
];

const MAX_LAYERED_REPAIR_ATTEMPTS = 1;
const MAX_LIVE_FEEDBACK_ROUNDS = 2;
const LAYERED_CACHE_SCHEMA_VERSION = 2;

type AuthorRole = LayeredAgentResult['role'];

interface LayeredRepairFeedback {
    all: string[];
    behavior: string[];
    interaction: string[];
    integration: string[];
}

interface AuthorCacheTarget {
    file?: string;
}

class LayeredValidationError extends Error {
    constructor(
        readonly feedback: LayeredRepairFeedback,
    ) {
        super(feedback.all.join(' | '));
        this.name = 'LayeredValidationError';
    }
}

export interface LayeredGenerationOptions {
    model?: string;
    timeoutMs?: number;
    forceRegenerate?: boolean;
    onStageChange?: (stage: LayeredGenerationStageReport) => void;
}

export interface LayeredGenerationResult {
    success: boolean;
    responseFile?: string;
    reportFile: string;
    error?: string;
}

export type LayeredResponseValidator = (
    packageDirectory: string,
    response: AutomationAgentResponse,
) => { valid: boolean; errors: Array<{ code?: string; message: string }> };

function ensureInside(root: string, candidate: string): string {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(candidate);
    const relative = path.relative(resolvedRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Ruta fuera del workspace de agentes: ${candidate}`);
    }
    return resolved;
}

function copyIfPresent(
    sourceRoot: string,
    targetRoot: string,
    relativePath: string,
    judgment?: GapJudgment,
): void {
    const source = ensureInside(sourceRoot, path.join(sourceRoot, relativePath));
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return;
    const target = ensureInside(targetRoot, path.join(targetRoot, relativePath));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!judgment || !relativePath.endsWith('.json')) {
        fs.copyFileSync(source, target);
        return;
    }
    writeJsonUtf8(target, projectIntegrationJson(
        relativePath,
        projectSharedJson(relativePath, readJsonUtf8<any>(source), judgment),
    ));
}

/**
 * Codigos del validador por capa responsable. Son la misma tabla con la que se
 * proyecta `validation-contract.json` a cada autor y con la que Derek dirige el
 * feedback de reparacion: un error llega solo al agente que puede corregirlo.
 */
const BEHAVIOR_RULE_CODES = new Set([
    'assertion', 'duplicate-step-definition', 'framework-scenario-collision',
    'framework-step-collision', 'generic-template-gherkin', 'imperative-gherkin',
    'missing-examples', 'reused-step-rewritten', 'ungrouped-technical-action',
    'verbatim-context-hint', 'platform-tag', 'behavior-path',
]);
const INTERACTION_RULE_CODES = new Set([
    'completion-duplicate', 'completion-file', 'completion-key', 'completion-occupied',
    'completion-platform', 'completion-sequence', 'completion-shape',
    'completion-unauthorized', 'create-locator-contract', 'destructive-update',
    'duplicate-screen-method', 'framework-locator-collision', 'invalid-locator-access',
    'invented-selector', 'locator-type-mismatch', 'platform-coverage',
    'screen-alias-usage', 'screen-import-alias', 'trace-locator', 'trace-screen-method',
    'framework-symbol', 'framework-import-alias', 'missing-update-target', 'interaction-path',
]);
const INTEGRATION_RULE_CODES = new Set([
    'schema', 'recording-id', 'plan-id', 'resolution-shape', 'resolution-needs-shape',
    'resolution-needs-query', 'resolution-needs-args', 'trace-shape', 'trace',
    'missing-gap-resolution', 'gap-resolution-decision', 'unresolved-gap-without-reason',
    'existing-automation', 'duplicate-layer', 'missing-layer', 'extra-layer',
]);

function projectRoleJson(relativePath: string, value: any, role: AuthorRole): any {
    if (relativePath === 'deterministic-draft.json') {
        const layers = new Set(ROLE_LAYERS[role]);
        return {
            ...value,
            files: (value.files || []).filter((file: any) => layers.has(file.layer)),
            actionTrace: value.actionTrace || [],
            assumptions: [
                'Referencia generada localmente. Puedes corregirla o reemplazar APIs provisionales por reutilización autorizada.',
            ],
        };
    }
    if (relativePath === 'validation-contract.json') {
        // Los autores no emiten resoluciones: las reglas de integracion son de
        // Derek y Sumrak.
        const rules = (value.rules || []).filter((rule: any) =>
            !INTEGRATION_RULE_CODES.has(rule.code)
            && (role === 'behavior-author'
                ? !INTERACTION_RULE_CODES.has(rule.code)
                : !BEHAVIOR_RULE_CODES.has(rule.code))
        );
        return {
            ...value,
            totalRules: rules.length,
            expressibleWithMinimalExampleCount: rules.filter((rule: any) => rule.minimalExample).length,
            explanationOnlyCount: rules.filter((rule: any) => rule.needsExplanation).length,
            rules,
        };
    }
    if (relativePath === 'reuse-context.json') {
        if (role === 'behavior-author') {
            return {
                schemaVersion: value.schemaVersion,
                recordingId: value.recordingId,
                decision: value.decision,
                reuseTarget: value.reuseTarget,
                candidates: value.candidates || [],
                updateBaselines: (value.updateBaselines || []).filter((item: any) =>
                    item?.layer === 'feature' || item?.layer === 'steps'
                ),
            };
        }
        return {
            schemaVersion: value.schemaVersion,
            recordingId: value.recordingId,
            decision: value.decision,
            reuseTarget: value.reuseTarget,
            // El codigo de cada getter ya viaja integro en `baselines/`; aqui
            // solo hace falta la identidad del elemento y sus locators.
            elements: (value.elements || []).map((module: any) => ({
                ...module,
                elements: (module?.elements || []).map((element: any) => {
                    const { getter, ...rest } = element || {};
                    void getter;
                    return rest;
                }),
            })),
            updateBaselines: (value.updateBaselines || []).filter((item: any) =>
                item?.layer === 'screen' || item?.layer === 'locators'
            ),
        };
    }
    if (relativePath === 'hints.json') {
        const behaviorTypes = new Set(['existing_step', 'existing_scenario', 'builtin_action']);
        const interactionTypes = new Set(['existing_locator', 'existing_screen', 'builtin_action']);
        const allowed = role === 'behavior-author' ? behaviorTypes : interactionTypes;
        return {
            ...value,
            hints: (value.hints || []).filter((hint: any) =>
                !hint?.type || allowed.has(hint.type)
            ),
        };
    }
    if (relativePath === 'query-results.json') {
        const behaviorTypes = new Set(['feature', 'scenario', 'stepDefinition', 'example']);
        const interactionTypes = new Set(['screenObject', 'screenMethod', 'locator', 'helper', 'contract', 'import']);
        const allowed = role === 'behavior-author' ? behaviorTypes : interactionTypes;
        return {
            ...value,
            results: (value.results || []).map((result: any) => ({
                ...result,
                data: result?.data && Array.isArray(result.data.items)
                    ? {
                        ...result.data,
                        items: result.data.items.filter((item: any) =>
                            !item?.type || allowed.has(item.type)
                        ),
                    }
                    : result?.data,
            })),
        };
    }
    return value;
}

function copyRoleInput(
    sourceRoot: string,
    targetRoot: string,
    relativePath: string,
    role: AuthorRole,
    judgment: GapJudgment,
): void {
    const source = ensureInside(sourceRoot, path.join(sourceRoot, relativePath));
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return;
    const target = ensureInside(targetRoot, path.join(targetRoot, relativePath));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!relativePath.endsWith('.json')) {
        fs.copyFileSync(source, target);
        return;
    }
    writeJsonUtf8(target, projectRoleJson(
        relativePath,
        projectSharedJson(relativePath, readJsonUtf8<any>(source), judgment),
        role,
    ));
}

function copyRoleBaselines(
    sourceRoot: string,
    targetRoot: string,
    role: AuthorRole,
): void {
    const sourceDirectory = path.join(sourceRoot, 'baselines');
    if (!fs.existsSync(sourceDirectory)) return;
    const allowedPrefixes = role === 'behavior-author'
        ? ['feature-', 'steps-']
        : ['screen-', 'locators-'];
    for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || !allowedPrefixes.some(prefix => entry.name.startsWith(prefix))) continue;
        copyIfPresent(sourceRoot, targetRoot, path.join('baselines', entry.name));
    }
}

function artifact(file: string, root: string) {
    const content = readUtf8File(file);
    return {
        path: path.relative(root, file).replace(/\\/g, '/'),
        sha256: sha256Text(content),
        bytes: Buffer.byteLength(content, 'utf8'),
    };
}

function filesInside(directory: string): string[] {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const candidate = path.join(directory, entry.name);
        return entry.isDirectory() ? filesInside(candidate) : entry.isFile() ? [candidate] : [];
    });
}

function stableFingerprint(value: unknown): string {
    return sha256Text(JSON.stringify(value));
}

function agentCacheRoot(packageDirectory: string): string {
    return path.join(
        path.dirname(packageDirectory),
        '.agent-cache',
        sha256Text(path.resolve(packageDirectory)).slice(0, 16),
    );
}

function normalizeCucumberStepDefinitions(content: string): string {
    let previousKeyword: 'Given' | 'When' | 'Then' = 'Then';
    return content.split('\n').map(line => {
        let normalized = line.replace(
            /import\s*\{([^}]*)\}\s*from\s*(['"])(@cucumber\/cucumber|@wdio\/cucumber-framework)\2;?/g,
            (_match, names: string, quote: string, source: string) => {
                const supported = names
                    .split(',')
                    .map(item => item.trim())
                    .filter(Boolean)
                    .filter(item => !/^(?:And|But)(?:\s+as\s+\w+)?$/.test(item));
                return `import { ${supported.join(', ')} } from ${quote}${source}${quote};`;
            },
        );
        const declaration = normalized.match(/^(\s*)(Given|When|Then|And|But)(\s*\()/);
        if (!declaration) return normalized;
        const keyword = declaration[2];
        if (keyword === 'Given' || keyword === 'When' || keyword === 'Then') {
            previousKeyword = keyword;
            return normalized;
        }
        normalized = normalized.replace(
            /^(\s*)(?:And|But)(\s*\()/,
            `$1${previousKeyword}$2`,
        );
        return normalized;
    }).join('\n');
}

function normalizeBehaviorResult(result: LayeredAgentResult): boolean {
    if (result.role !== 'behavior-author') return false;
    let changed = false;
    for (const file of result.files) {
        if (file.layer !== 'steps') continue;
        const normalized = normalizeCucumberStepDefinitions(file.content);
        if (normalized !== file.content) {
            file.content = normalized;
            changed = true;
        }
    }
    return changed;
}

function normalizeAutomationResponse(response: AutomationAgentResponse): boolean {
    let changed = false;
    for (const file of response.files || []) {
        if (file.layer !== 'steps') continue;
        const normalized = normalizeCucumberStepDefinitions(file.content);
        if (normalized !== file.content) {
            file.content = normalized;
            changed = true;
        }
    }
    return changed;
}

interface PipelineCacheEntry {
    schemaVersion: 1;
    fingerprint: string;
    response: AutomationAgentResponse;
    testDesignReview?: unknown;
}

function actionInterfaceFingerprint(resultFile: string): string {
    const result = readJsonUtf8<LayeredAgentResult>(resultFile);
    return stableFingerprint((result.actionTrace || []).map(trace => ({
        sequence: trace.sequence,
        screenMethod: trace.screenMethod || '',
        locatorName: trace.locatorName || '',
    })));
}

function pipelineFingerprint(packageDirectory: string, model: string): string {
    const files = [
        ...INPUT_FILES.map(file => path.join(packageDirectory, file)),
        ...filesInside(path.join(packageDirectory, 'baselines')),
    ]
        .filter(file => fs.existsSync(file) && fs.statSync(file).isFile())
        .sort()
        .map(file => artifact(file, packageDirectory))
        .map(item => ({ path: item.path, sha256: item.sha256 }));
    return stableFingerprint({
        schemaVersion: LAYERED_CACHE_SCHEMA_VERSION,
        model,
        files,
        prompts: {
            behavior: partialPrompt('behavior-author', ROLE_OUTPUTS['behavior-author'], false),
            interaction: partialPrompt('interaction-author', ROLE_OUTPUTS['interaction-author'], false),
            integration: integrationPrompt(false),
        },
    });
}

function pipelineCacheFile(packageDirectory: string, fingerprint: string): string {
    return path.join(agentCacheRoot(packageDirectory), 'pipeline', `${fingerprint}.json`);
}

function promoteAuthorCache(outputFile: string, target: AuthorCacheTarget): void {
    if (!target.file) return;
    fs.mkdirSync(path.dirname(target.file), { recursive: true });
    fs.copyFileSync(outputFile, target.file);
}

function writeHandoff(
    file: string,
    input: Omit<LayeredGenerationHandoff, 'schemaVersion' | 'createdAt'>,
): void {
    writeJsonUtf8(file, {
        schemaVersion: 1,
        ...input,
        createdAt: new Date().toISOString(),
    });
}

/**
 * Presupuesto de una etapa: referencia de coste, nunca recorte.
 *
 * La reutilizacion completa la garantiza el resolver, que indexa todo el
 * framework antes de que exista un agente. Lo que llega a cada rol es la
 * decision ya tomada mas la evidencia para escribir codigo; quitar evidencia
 * para cumplir un numero produciria una automatizacion incompleta. Por eso el
 * presupuesto se mide y se reporta, y la sesion solo la corta el hang stop.
 */
function stageBudget(plan: GenerationPlan, options: LayeredGenerationOptions) {
    const budgets = normalizeAgentOperationalBudgets(plan.budgets);
    return {
        maxDurationMs: budgets.maxDurationMs,
        maxContextBytes: budgets.maxContextBytes,
        hangStopMs: options.timeoutMs || resolveAgentHangStopMs(),
    };
}

function budgetWarnings(
    agentName: string,
    budget: ReturnType<typeof stageBudget>,
    contextBytes: number,
    durationMs?: number,
): string[] {
    const warnings: string[] = [];
    if (contextBytes > budget.maxContextBytes) {
        warnings.push(
            `${agentName} recibió ${contextBytes} bytes de contexto; el objetivo es ${budget.maxContextBytes}. `
            + 'No se recortó evidencia: costará más tokens.',
        );
    }
    if (durationMs !== undefined && durationMs > budget.maxDurationMs) {
        warnings.push(
            `${agentName} tardó ${Math.round(durationMs)} ms; el objetivo es ${budget.maxDurationMs} ms. `
            + `La sesión solo se corta al hang stop de ${budget.hangStopMs} ms.`,
        );
    }
    return warnings;
}

/** Todo lo que el agente puede leer en su carpeta al arrancar, protocolo incluido. */
function stageContextBytes(stageDirectory: string): number {
    return filesInside(stageDirectory).reduce((total, file) => total + fs.statSync(file).size, 0);
}

function sessionName(recordingId: string, role: GenerationAgentRole, attempt = 0): string {
    const base = `${LAYERED_GENERATION_AGENTS.owner.name}/${recordingId}/${LAYERED_GENERATION_AGENTS[role].name}`;
    return attempt > 0 ? `${base}/repair-${attempt}` : base;
}

function writeAgentProfile(
    stageDirectory: string,
    role: GenerationAgentRole,
    prompt: string,
): void {
    const identity = LAYERED_GENERATION_AGENTS[role];
    const agentsDirectory = path.join(stageDirectory, '.github', 'agents');
    fs.mkdirSync(agentsDirectory, { recursive: true });
    const profile = [
        '---',
        `name: ${identity.name}`,
        `description: ${role} de Appium Recorder; trabaja solo en su paquete aislado.`,
        'tools: [read, edit, search, execute]',
        'disable-model-invocation: true',
        'user-invocable: true',
        '---',
        '',
        prompt,
        '',
        'No delegues en otros agentes. No escribas fuera del directorio actual.',
        '',
    ].join('\n');
    fs.writeFileSync(
        path.join(agentsDirectory, `${identity.name}.agent.md`),
        profile,
        'utf8',
    );
}

function writeOwnerManifest(
    agentsRoot: string,
    plan: GenerationPlan,
    state: 'running' | 'completed' | 'failed',
): void {
    const ownerDirectory = path.join(agentsRoot, LAYERED_GENERATION_AGENTS.owner.directory);
    fs.mkdirSync(ownerDirectory, { recursive: true });
    writeJsonUtf8(path.join(ownerDirectory, 'orchestration.json'), {
        schemaVersion: 1,
        owner: LAYERED_GENERATION_AGENTS.owner,
        recordingId: plan.recordingId,
        planId: plan.planId,
        state,
        delegates: DELEGATES,
        sequence: DELEGATES.map(delegate => delegate.name),
        updatedAt: new Date().toISOString(),
    });
}

function verifyOutputHandoff(outputFile: string): void {
    const handoffFile = path.join(path.dirname(outputFile), 'output-handoff.json');
    const handoff = readJsonUtf8<LayeredGenerationHandoff>(handoffFile);
    const expected = handoff.artifacts.find(entry => entry.path === path.basename(outputFile));
    if (!expected) throw new Error(`Handoff sin referencia a ${path.basename(outputFile)}.`);
    const actual = artifact(outputFile, path.dirname(outputFile));
    if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) {
        throw new Error(`El resultado ${path.basename(outputFile)} cambió después de su handoff.`);
    }
}

function partialPrompt(role: AuthorRole, outputFile: string, repair = false): string {
    const identity = LAYERED_GENERATION_AGENTS[role];
    const ownership = role === 'behavior-author'
        ? [
            'Genera únicamente Feature y Steps.',
            'Usa deterministic-draft.json como punto de partida rápido, no como restricción: mejora su Gherkin y reutilización cuando el plan lo autorice.',
            'El Gherkin debe ser declarativo, conservar tags y formato del framework y cada acción grabada debe quedar trazada.',
            'En el archivo Feature puedes usar And/But; en TypeScript importa e invoca únicamente Given, When y Then porque Cucumber no exporta And/But como funciones.',
            'Steps solo puede invocar métodos del Screen Object: prohíbe XPath, UiSelector, accessibility id y selectores literales.',
            'Declara en actionTrace el screenMethod requerido para que Zorem implemente exactamente esa interfaz.',
            'Evalúa el diseño funcional como pass o suggestion; una sugerencia nunca bloquea la generación.',
        ].join(' ')
        : [
            'Genera únicamente Screen Object y Locators.',
            'Usa deterministic-draft.json como referencia de forma y trazabilidad, no como autoridad sobre reuse; el plan y los candidatos autorizados mandan.',
            'Lee behavior-result.json y lorem-handoff.json: implementa exactamente los screenMethod requeridos por Lorem.',
            'Para operation update parte de baselines y preserva byte a byte toda API, import y locator no afectado.',
            'La operación y decisión del plan mandan: si indica create, crea la key y getter homónimos con el primary exacto aunque exista un elemento semánticamente parecido; reutiliza solo cuando el plan lo autorice.',
            'No construyas locators dentro de métodos de acción: cada screenMethod debe consumir un único getter y ningún selector literal.',
            'Conserva exactamente el nombre de clase, singleton exportado, APIs e imports del baseline salvo el cambio explícitamente requerido.',
            'Reutiliza solo candidatos autorizados. No inventes selectores ni copies selectores Android al bloque iOS.',
            'Cada getter debe usar el TypeLocator y valor primary de la plataforma grabada; la otra plataforma conserva su valor existente o una clave vacía.',
            'Usa aliases del framework y nunca imports relativos.',
        ].join(' ');
    return [
        `Eres ${identity.name}, responsable de ${role} bajo la coordinación de Derek.`,
        'Lee primero agent-memory.json: respeta su ownership y usa solo los archivos enumerados en input-manifest.json.',
        ...(repair ? ['Lee repair-feedback.json y corrige únicamente los errores asignados a tu capa.'] : []),
        ownership,
        `Escribe solo ${outputFile} y cumple result.schema.json.`,
        ...(repair ? [
            'Después de escribir el resultado, vuelve a leer repair-feedback.json: Derek puede actualizarlo con status correction-required.',
            'Si aparecen errores nuevos, corrígelos y vuelve a escribir el mismo resultado; termina solo cuando el status sea accepted.',
        ] : []),
        'No explores el framework ni escribas fuera de esta carpeta.',
    ].join(' ');
}

function authorContractErrors(
    result: unknown,
    role: AuthorRole,
    plan: GenerationPlan,
): string[] {
    const errors = validateLayeredAgentResult(result, role, plan.recordingId, plan.planId);
    if (errors.length) return errors;
    const typed = result as LayeredAgentResult;
    const expectedLayers = role === 'behavior-author'
        ? new Set(['feature', 'steps'])
        : new Set(['screen', 'locators']);
    const expectedPaths = new Map(
        plan.files
            .filter(file => expectedLayers.has(file.layer))
            .map(file => [file.layer, file.path]),
    );
    const actualPaths = new Map(typed.files.map(file => [file.layer, file.path]));
    for (const [layer, expectedPath] of expectedPaths) {
        if (actualPaths.get(layer) !== expectedPath) {
            errors.push(`${role} debe conservar la ruta ${expectedPath} para ${layer}.`);
        }
    }
    if (actualPaths.size !== expectedPaths.size) {
        errors.push(`${role} debe producir exactamente sus ${expectedPaths.size} capas del plan.`);
    }
    return errors;
}

function integrationPrompt(repair = false): string {
    return [
        'Eres Sumrak, integration-reviewer bajo la coordinación de Derek.',
        'Lee primero agent-memory.json y luego behavior-result.json, interaction-result.json y sus handoffs.',
        ...(repair ? ['Lee integration-feedback.json y corrige la integración solicitada.'] : []),
        'Integra ambos resultados sin cambiar recordingId, planId, rutas ni el contenido de los cuatro archivos.',
        'Copia byte por byte files[].content desde los resultados de los autores; el recorder los impondrá como fuente de verdad.',
        'Incluye exactamente una resolución por cada gap de generation-plan.json.unresolvedGapIds; no omitas ni inventes gapId.',
        'Las resoluciones deterministas por secuencia del plan son autoridad: no cambies create a reuse por similitud de nombre.',
        'Reuse exige coincidencia simultánea de TypeLocator y selector normalizado, además de selectedCandidate autorizado.',
        'Copia actionTrace desde behavior-result.json; no inventes otros screenMethod ni locatorName.',
        'Comprueba trazabilidad cruzada entre Gherkin, Steps, Screen Object y Locators.',
        'Escribe solo agent-response.json cumpliendo agent-response.schema.json.',
        'Esta es la salida visible que el QA podrá revisar y corregir.',
    ].join(' ');
}

function expectedGapDecisions(
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

function alignResolutionsWithPlan(
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

interface GapJudgment {
    /** Resoluciones que Derek firma: el plan ya fijo la decision. */
    fixed: AutomationAgentResponse['resolutions'];
    /** Gaps que siguen exigiendo juicio; solo estos viajan a los agentes. */
    open: string[];
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
function gapJudgment(packageDirectory: string, plan: GenerationPlan): GapJudgment {
    const gapsFile = path.join(packageDirectory, 'gaps.json');
    const gaps = fs.existsSync(gapsFile)
        ? readJsonUtf8<{ gaps?: Array<{ id?: string; sequence?: number }> }>(gapsFile).gaps || []
        : [];
    const gapById = new Map(gaps.filter(gap => gap.id).map(gap => [gap.id!, gap]));
    const expected = expectedGapDecisions(packageDirectory, plan);
    const judgment: GapJudgment = { fixed: [], open: [] };
    for (const gapId of plan.unresolvedGapIds || []) {
        const gap = gapById.get(gapId);
        if (!gap) {
            judgment.open.push(gapId);
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

/** Campos del protocolo de queries: en el pipeline por capas no hay ronda de consultas. */
const GAP_QUERY_FIELDS = ['allowedQueries', 'allowedQueryArgsSchemas', 'maxQueries', 'expectedAnswerSchema'];

/**
 * Sumrak decide resoluciones y trazabilidad; no escribe codigo. Recibe el
 * catalogo de reglas de integracion y la reutilizacion sin el codigo de los
 * elementos, que solo necesitan los autores.
 */
function projectIntegrationJson(relativePath: string, value: any): any {
    if (relativePath === 'validation-contract.json') {
        const rules = (value.rules || []).filter((rule: any) => INTEGRATION_RULE_CODES.has(rule.code));
        return {
            ...value,
            totalRules: rules.length,
            expressibleWithMinimalExampleCount: rules.filter((rule: any) => rule.minimalExample).length,
            explanationOnlyCount: rules.filter((rule: any) => rule.needsExplanation).length,
            rules,
        };
    }
    if (relativePath === 'reuse-context.json') {
        return {
            schemaVersion: value.schemaVersion,
            recordingId: value.recordingId,
            decision: value.decision,
            reuseTarget: value.reuseTarget,
            candidates: value.candidates || [],
            updateBaselines: value.updateBaselines || [],
        };
    }
    return value;
}

/**
 * Proyeccion comun a todos los roles: los agentes reciben unicamente los gaps
 * que requieren juicio y sin el protocolo de queries que no pueden ejercer.
 */
function projectSharedJson(relativePath: string, value: any, judgment: GapJudgment): any {
    if (relativePath === 'gaps.json') {
        const open = new Set(judgment.open);
        return {
            ...value,
            gaps: (value.gaps || [])
                .filter((gap: any) => open.has(gap?.id))
                .map((gap: any) => Object.fromEntries(
                    Object.entries(gap).filter(([key]) => !GAP_QUERY_FIELDS.includes(key))
                )),
        };
    }
    if (relativePath === 'generation-plan.json') {
        return {
            ...value,
            unresolvedGapIds: judgment.open,
            fixedGapResolutions: judgment.fixed,
        };
    }
    return value;
}

export interface RepairIssue {
    code?: string;
    message: string;
}

/**
 * Dirige cada error al agente que puede corregirlo.
 *
 * El `code` del validador es la fuente: cada regla vive en una familia con
 * capa responsable. Solo los errores sin codigo (contratos del propio
 * orquestador o mensajes de `output`/`preview`) se clasifican por su texto, y
 * un error que nadie reconoce llega a los tres para no perderse.
 */
function classifyValidationErrors(issues: Array<RepairIssue | string>): LayeredRepairFeedback {
    const normalized = issues.map(issue => typeof issue === 'string' ? { message: issue } : issue);
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
        if (issue.code && BEHAVIOR_RULE_CODES.has(issue.code)) behavior = true;
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

export class LayeredGenerationOrchestrator {
    constructor(
        private readonly controlledProvider: AgentProvider,
        private readonly reviewProvider: AgentProvider = controlledProvider,
        private readonly responseValidator?: LayeredResponseValidator,
        private readonly draftBuilder = new DeterministicDraftBuilder(),
    ) {}

    async run(packageDirectory: string, options: LayeredGenerationOptions = {}): Promise<LayeredGenerationResult> {
        const root = path.resolve(packageDirectory);
        const plan = readJsonUtf8<GenerationPlan>(path.join(root, 'generation-plan.json'));
        const startedAt = new Date().toISOString();
        const stages: LayeredGenerationStageReport[] = [];
        const agentsRoot = path.join(root, 'agents');
        fs.mkdirSync(agentsRoot, { recursive: true });
        const reportFile = path.join(root, 'layered-generation-run.json');
        const ownerDirectory = path.join(agentsRoot, LAYERED_GENERATION_AGENTS.owner.directory);
        fs.rmSync(ownerDirectory, { recursive: true, force: true });
        writeOwnerManifest(agentsRoot, plan, 'running');

        // El borrador acelera la comprensión del caso, pero nunca bloquea la
        // generación: paquetes históricos o incompletos siguen por el flujo
        // de agentes sin conservar un draft obsoleto de otra ejecución.
        const draftFile = path.join(root, 'deterministic-draft.json');
        try {
            this.draftBuilder.build(root);
        } catch {
            fs.rmSync(draftFile, { force: true });
        }

        let repairAttempts = 0;
        try {
            const completeFingerprint = pipelineFingerprint(root, options.model || 'auto');
            const completeCacheFile = pipelineCacheFile(root, completeFingerprint);
            if (!options.forceRegenerate) {
                let cachedEntry: PipelineCacheEntry | undefined;
                if (fs.existsSync(completeCacheFile)) {
                    cachedEntry = readJsonUtf8<PipelineCacheEntry>(completeCacheFile);
                } else {
                    // Migración transparente: una respuesta oficial existente y
                    // válida pertenece al mismo plan y puede sembrar el caché.
                    const existingResponseFile = path.join(root, 'agent-response.json');
                    if (fs.existsSync(existingResponseFile)) {
                        const response = readJsonUtf8<AutomationAgentResponse>(existingResponseFile);
                        if (normalizeAutomationResponse(response)) {
                            writeJsonUtf8(existingResponseFile, response);
                        }
                        const reviewFile = path.join(root, 'test-design-review.json');
                        cachedEntry = {
                            schemaVersion: 1,
                            fingerprint: completeFingerprint,
                            response,
                            testDesignReview: fs.existsSync(reviewFile)
                                ? readJsonUtf8<unknown>(reviewFile)
                                : undefined,
                        };
                    }
                }
                if (cachedEntry) normalizeAutomationResponse(cachedEntry.response);
                if (cachedEntry
                    && cachedEntry.fingerprint === completeFingerprint
                    && this.isReusableResponse(root, plan, cachedEntry.response)) {
                    const responseFile = path.join(root, 'agent-response.json');
                    writeJsonUtf8(responseFile, cachedEntry.response);
                    if (cachedEntry.testDesignReview) {
                        writeJsonUtf8(path.join(root, 'test-design-review.json'), cachedEntry.testDesignReview);
                    }
                    fs.mkdirSync(path.dirname(completeCacheFile), { recursive: true });
                    writeJsonUtf8(completeCacheFile, cachedEntry);
                    for (const role of ['behavior-author', 'interaction-author', 'integration-reviewer'] as const) {
                        const stage: LayeredGenerationStageReport = {
                            role,
                            agentName: LAYERED_GENERATION_AGENTS[role].name,
                            sessionName: `${sessionName(plan.recordingId, role)}/pipeline-cache`,
                            attempt: 0,
                            state: 'completed',
                            durationMs: 0,
                            outputFile: 'agent-response.json',
                            execution: 'cache',
                            fingerprint: completeFingerprint,
                            cacheHit: true,
                            contextBytes: 0,
                            contextFiles: 0,
                            assignedLayers: [...ROLE_LAYERS[role]],
                        };
                        stages.push(stage);
                        options.onStageChange?.({ ...stage });
                    }
                    writeOwnerManifest(agentsRoot, plan, 'completed');
                    this.writeReport(reportFile, plan, startedAt, 'completed', stages, 0);
                    return { success: true, responseFile, reportFile };
                }
            }
            const behaviorCache: AuthorCacheTarget = {};
            const interactionCache: AuthorCacheTarget = {};
            let behavior = await this.runAuthor(
                root, agentsRoot, plan, 'behavior-author', options, stages, 0,
                undefined, [], behaviorCache,
            );
            let interaction = await this.runAuthor(
                root, agentsRoot, plan, 'interaction-author', options, stages, 0, behavior,
                [], interactionCache,
            );
            let integrationFeedback: LayeredRepairFeedback | undefined;
            while (true) {
                try {
                    const responseFile = await this.runIntegration(
                        root,
                        agentsRoot,
                        plan,
                        behavior,
                        interaction,
                        options,
                        stages,
                        repairAttempts,
                        integrationFeedback,
                        repairAttempts < MAX_LAYERED_REPAIR_ATTEMPTS,
                    );
                    // Solo una respuesta completa validada promueve sus capas.
                    // Si hubo reparación, estas rutas apuntan al resultado final.
                    promoteAuthorCache(behavior, behaviorCache);
                    promoteAuthorCache(interaction, interactionCache);
                    const response = readJsonUtf8<AutomationAgentResponse>(responseFile);
                    const reviewFile = path.join(root, 'test-design-review.json');
                    const completeEntry: PipelineCacheEntry = {
                        schemaVersion: 1,
                        fingerprint: completeFingerprint,
                        response,
                        testDesignReview: fs.existsSync(reviewFile)
                            ? readJsonUtf8<unknown>(reviewFile)
                            : undefined,
                    };
                    fs.mkdirSync(path.dirname(completeCacheFile), { recursive: true });
                    writeJsonUtf8(completeCacheFile, completeEntry);
                    writeOwnerManifest(agentsRoot, plan, 'completed');
                    this.writeReport(reportFile, plan, startedAt, 'completed', stages, repairAttempts);
                    return { success: true, responseFile, reportFile };
                } catch (error) {
                    if (!(error instanceof LayeredValidationError)
                        || repairAttempts >= MAX_LAYERED_REPAIR_ATTEMPTS) {
                        throw error;
                    }
                    repairAttempts += 1;
                    const feedback = error.feedback;
                    integrationFeedback = feedback;
                    const previousBehaviorInterface = feedback.behavior.length
                        ? actionInterfaceFingerprint(behavior)
                        : undefined;
                    if (feedback.behavior.length) {
                        behavior = await this.runAuthor(
                            root,
                            agentsRoot,
                            plan,
                            'behavior-author',
                            options,
                            stages,
                            repairAttempts,
                            undefined,
                            feedback.behavior,
                            behaviorCache,
                        );
                    }
                    const behaviorInterfaceChanged = previousBehaviorInterface !== undefined
                        && previousBehaviorInterface !== actionInterfaceFingerprint(behavior);
                    // Un ajuste de redacción Gherkin no invalida Screen/Locators.
                    // Zorem se relanza solo con feedback propio o si Lorem cambió
                    // el contrato screenMethod/locatorName que debe implementar.
                    if (feedback.interaction.length || behaviorInterfaceChanged) {
                        interaction = await this.runAuthor(
                            root,
                            agentsRoot,
                            plan,
                            'interaction-author',
                            options,
                            stages,
                            repairAttempts,
                            behavior,
                            feedback.interaction.length
                                ? feedback.interaction
                                : ['Lorem cambió la interfaz actionTrace; sincroniza únicamente los métodos afectados.'],
                            interactionCache,
                        );
                    }
                }
            }
        } catch (error: any) {
            writeOwnerManifest(agentsRoot, plan, 'failed');
            this.writeReport(reportFile, plan, startedAt, 'failed', stages, repairAttempts);
            return { success: false, reportFile, error: error?.message || String(error) };
        }
    }

    private isReusableResponse(
        packageDirectory: string,
        plan: GenerationPlan,
        response: AutomationAgentResponse,
    ): boolean {
        if (response.recordingId !== plan.recordingId || response.planId !== plan.planId) return false;
        const expected = new Map(plan.files.map(file => [file.layer, file.path]));
        const actual = new Map((response.files || []).map(file => [file.layer, file.path]));
        if (actual.size !== expected.size) return false;
        if ([...expected].some(([layer, file]) => actual.get(layer) !== file)) return false;
        const resolved = new Set((response.resolutions || []).map(item => item.gapId));
        if ((plan.unresolvedGapIds || []).some(gapId => !resolved.has(gapId))) return false;
        const validation = this.responseValidator?.(packageDirectory, response);
        return validation ? validation.valid : true;
    }

    private async runAuthor(
        packageDirectory: string,
        agentsRoot: string,
        plan: GenerationPlan,
        role: AuthorRole,
        options: LayeredGenerationOptions,
        stages: LayeredGenerationStageReport[],
        attempt = 0,
        dependencyFile?: string,
        repairErrors: string[] = [],
        cacheTarget: AuthorCacheTarget = {},
    ): Promise<string> {
        const identity = LAYERED_GENERATION_AGENTS[role];
        const stageDirectory = path.join(agentsRoot, identity.directory);
        fs.rmSync(stageDirectory, { recursive: true, force: true });
        fs.mkdirSync(stageDirectory, { recursive: true });
        const judgment = gapJudgment(packageDirectory, plan);
        for (const file of ROLE_INPUT_FILES[role]) {
            copyRoleInput(packageDirectory, stageDirectory, file, role, judgment);
        }
        copyRoleBaselines(packageDirectory, stageDirectory, role);
        if (dependencyFile) {
            verifyOutputHandoff(dependencyFile);
            const dependencyCopy = path.join(stageDirectory, path.basename(dependencyFile));
            fs.copyFileSync(dependencyFile, dependencyCopy);
            writeHandoff(path.join(stageDirectory, 'lorem-handoff.json'), {
                from: 'behavior-author',
                to: 'interaction-author',
                fromAgent: LAYERED_GENERATION_AGENTS['behavior-author'].name,
                toAgent: identity.name,
                recordingId: plan.recordingId,
                planId: plan.planId,
                stage: 'behavior-to-interaction',
                status: 'ready',
                artifacts: [artifact(dependencyCopy, stageDirectory)],
                instructions: ['Implementar exactamente los screenMethod requeridos por Lorem.'],
            });
        }
        if (repairErrors.length) {
            writeJsonUtf8(path.join(stageDirectory, 'repair-feedback.json'), {
                schemaVersion: 1,
                owner: LAYERED_GENERATION_AGENTS.owner.name,
                assignee: identity.name,
                attempt,
                status: 'awaiting-output',
                errors: repairErrors,
            });
        }
        const inputArtifacts = [
            ...ROLE_INPUT_FILES[role]
            .map(file => path.join(stageDirectory, file))
            .filter(file => fs.existsSync(file)),
            ...filesInside(path.join(stageDirectory, 'baselines')),
            ...(dependencyFile ? [path.join(stageDirectory, path.basename(dependencyFile))] : []),
            ...(dependencyFile ? [path.join(stageDirectory, 'lorem-handoff.json')] : []),
            ...(repairErrors.length ? [path.join(stageDirectory, 'repair-feedback.json')] : []),
        ]
            .map(file => artifact(file, stageDirectory));
        const contextBytes = inputArtifacts.reduce((total, item) => total + item.bytes, 0);
        const originalContextBytes = INPUT_FILES
            .map(file => path.join(packageDirectory, file))
            .filter(file => fs.existsSync(file) && fs.statSync(file).isFile())
            .reduce((total, file) => total + fs.statSync(file).size, 0)
            + filesInside(path.join(packageDirectory, 'baselines'))
                .reduce((total, file) => total + fs.statSync(file).size, 0);
        writeJsonUtf8(path.join(stageDirectory, 'agent-memory.json'), {
            schemaVersion: 1,
            recordingId: plan.recordingId,
            planId: plan.planId,
            agent: LAYERED_GENERATION_AGENTS[role].name,
            role,
            ownership: {
                layers: ROLE_LAYERS[role],
                mayReadOtherAgentOutput: role === 'interaction-author',
                mayWriteOutsideOwnedLayers: false,
            },
            context: {
                files: inputArtifacts.length,
                bytes: contextBytes,
                sourceBytes: originalContextBytes,
                savedBytes: Math.max(0, originalContextBytes - contextBytes),
            },
            artifacts: inputArtifacts.map(item => ({ path: item.path, sha256: item.sha256, bytes: item.bytes })),
        });
        writeJsonUtf8(path.join(stageDirectory, 'input-manifest.json'), {
            schemaVersion: 1,
            recordingId: plan.recordingId,
            planId: plan.planId,
            role,
            artifacts: inputArtifacts,
        });
        writeJsonUtf8(path.join(stageDirectory, 'result.schema.json'), layeredResultSchema(role));
        const prompt = partialPrompt(role, ROLE_OUTPUTS[role], repairErrors.length > 0);
        fs.writeFileSync(path.join(stageDirectory, 'agent-task.md'), prompt, 'utf8');
        writeAgentProfile(stageDirectory, role, prompt);
        writeHandoff(path.join(stageDirectory, 'input-handoff.json'), {
            from: 'recorder',
            to: role,
            fromAgent: LAYERED_GENERATION_AGENTS.owner.name,
            toAgent: identity.name,
            recordingId: plan.recordingId,
            planId: plan.planId,
            stage: role,
            status: 'ready',
            artifacts: inputArtifacts,
            instructions: [`Produce ${ROLE_OUTPUTS[role]} sin salir de esta carpeta.`],
        });
        const outputFile = path.join(stageDirectory, ROLE_OUTPUTS[role]);
        const namedSession = sessionName(plan.recordingId, role, attempt);
        const cacheFingerprint = stableFingerprint({
            schemaVersion: LAYERED_CACHE_SCHEMA_VERSION,
            role,
            model: options.model || 'auto',
            prompt,
            artifacts: inputArtifacts
                // Los handoffs contienen createdAt; su identidad real ya está
                // representada por el hash del resultado al que apuntan.
                .filter(item => !item.path.endsWith('-handoff.json'))
                .map(item => ({ path: item.path, sha256: item.sha256 })),
        });
        // automation/ se reconstruye al volver a preparar el caso. El caché
        // vive como hermano para sobrevivir esa limpieza, pero queda aislado
        // por la ruta del paquete y por el fingerprint completo de inputs.
        const cacheRoot = path.join(
            path.dirname(packageDirectory),
            '.agent-cache',
            sha256Text(path.resolve(packageDirectory)).slice(0, 16),
        );
        const cacheFile = path.join(cacheRoot, role, `${cacheFingerprint}.json`);
        if (attempt === 0 && repairErrors.length === 0) cacheTarget.file = cacheFile;
        const budget = stageBudget(plan, options);
        const report: LayeredGenerationStageReport = {
            role,
            agentName: identity.name,
            sessionName: namedSession,
            attempt,
            state: 'running',
            durationMs: 0,
            outputFile: path.relative(packageDirectory, outputFile).replace(/\\/g, '/'),
            execution: 'agent',
            fingerprint: cacheFingerprint,
            cacheHit: false,
            contextBytes: stageContextBytes(stageDirectory),
            contextFiles: inputArtifacts.length,
            evidenceBytes: contextBytes,
            assignedLayers: [...ROLE_LAYERS[role]],
            budget,
        };
        report.budgetWarnings = budgetWarnings(identity.name, budget, report.contextBytes!);
        stages.push(report);
        options.onStageChange?.({ ...report });
        if (attempt === 0 && repairErrors.length === 0 && fs.existsSync(cacheFile)) {
            try {
                fs.copyFileSync(cacheFile, outputFile);
                const cached = readJsonUtf8<unknown>(outputFile);
                if (role === 'behavior-author'
                    && typeof cached === 'object'
                    && cached !== null
                    && normalizeBehaviorResult(cached as LayeredAgentResult)) {
                    writeJsonUtf8(outputFile, cached);
                }
                const cacheErrors = authorContractErrors(cached, role, plan);
                if (!cacheErrors.length) {
                    const typedCached = cached as LayeredAgentResult;
                    if (role === 'behavior-author' && typedCached.testDesignReview) {
                        writeJsonUtf8(path.join(packageDirectory, 'test-design-review.json'), typedCached.testDesignReview);
                    }
                    report.state = 'completed';
                    report.execution = 'cache';
                    report.cacheHit = true;
                    options.onStageChange?.({ ...report });
                    writeHandoff(path.join(stageDirectory, 'output-handoff.json'), {
                        from: role,
                        to: 'integration-reviewer',
                        fromAgent: identity.name,
                        toAgent: LAYERED_GENERATION_AGENTS['integration-reviewer'].name,
                        recordingId: plan.recordingId,
                        planId: plan.planId,
                        stage: role,
                        status: 'completed',
                        artifacts: [artifact(outputFile, stageDirectory)],
                        instructions: ['Resultado incremental reutilizado por fingerprint verificado.'],
                    });
                    return outputFile;
                }
                fs.unlinkSync(outputFile);
            } catch {
                try { fs.unlinkSync(outputFile); } catch {}
            }
        }
        const repairFeedbackFile = path.join(stageDirectory, 'repair-feedback.json');
        const acceptOutput = repairErrors.length > 0
            && this.responseValidator
            ? (output: unknown): boolean => {
                const candidateErrors = authorContractErrors(output, role, plan);
                if (!candidateErrors.length) {
                    try {
                        const priorResponseFile = path.join(packageDirectory, 'agent-response.json');
                        if (fs.existsSync(priorResponseFile)) {
                            const priorResponse = readJsonUtf8<AutomationAgentResponse>(priorResponseFile);
                            const candidate = output as LayeredAgentResult;
                            const behaviorLayers = new Set(['feature', 'steps']);
                            const interactionLayers = new Set(['screen', 'locators']);
                            const files = role === 'behavior-author'
                                ? [
                                    ...candidate.files,
                                    ...priorResponse.files.filter(file => interactionLayers.has(file.layer)),
                                ]
                                : [
                                    ...(dependencyFile
                                        ? readJsonUtf8<LayeredAgentResult>(dependencyFile).files
                                        : priorResponse.files.filter(file => behaviorLayers.has(file.layer))),
                                    ...candidate.files,
                                ];
                            const provisionalResponse: AutomationAgentResponse = {
                                ...priorResponse,
                                resolutions: alignResolutionsWithPlan(
                                    packageDirectory,
                                    plan,
                                    priorResponse.resolutions,
                                ),
                                actionTrace: role === 'behavior-author'
                                    ? candidate.actionTrace
                                    : (dependencyFile
                                        ? readJsonUtf8<LayeredAgentResult>(dependencyFile).actionTrace
                                        : priorResponse.actionTrace),
                                files,
                            };
                            const validation = this.responseValidator!(packageDirectory, provisionalResponse);
                            if (!validation.valid) {
                                const classified = classifyValidationErrors(validation.errors);
                                candidateErrors.push(...classified[role === 'behavior-author'
                                    ? 'behavior'
                                    : 'interaction']);
                            }
                        }
                    } catch (error: any) {
                        candidateErrors.push(error?.message || String(error));
                    }
                }
                const errors = [...new Set(candidateErrors.filter(Boolean))];
                writeJsonUtf8(repairFeedbackFile, {
                    schemaVersion: 1,
                    owner: LAYERED_GENERATION_AGENTS.owner.name,
                    assignee: identity.name,
                    attempt,
                    status: errors.length ? 'correction-required' : 'accepted',
                    errors,
                });
                return errors.length === 0;
            }
            : undefined;
        let feedbackRound = 0;
        let totalDurationMs = 0;
        let run: Awaited<ReturnType<AgentProvider['execute']>>;
        const actualModels = new Set<string>();
        do {
            if (feedbackRound > 0 && fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
            run = await this.controlledProvider.execute({
                cwd: stageDirectory,
                prompt,
                timeoutMs: budget.hangStopMs,
                model: options.model,
                agentName: identity.name,
                // Solo Zorem tiene algo que ejecutar (screen-object-contract.js
                // contra su Screen Object). Un shell abierto para Lorem seria
                // la unica via que le queda para explorar el framework.
                allowValidationScripts: role === 'interaction-author',
                sessionName: feedbackRound > 0
                    ? `${namedSession}/feedback-${feedbackRound}`
                    : namedSession,
                traceFile: './agent-execution.log',
                traceLabel: feedbackRound > 0 ? `${role}-feedback-${feedbackRound}` : role,
                stopOnValidatedOutput: {
                    outputFile: `./${ROLE_OUTPUTS[role]}`,
                    schemaFile: './result.schema.json',
                    acceptOutput,
                },
            });
            totalDurationMs += run.durationMs;
            for (const model of run.modelUsage?.actualModels || []) actualModels.add(model);
            if (!run.success || !fs.existsSync(outputFile) || !acceptOutput) break;
            const accepted = acceptOutput(readJsonUtf8<unknown>(outputFile));
            if (accepted) break;
            feedbackRound += 1;
        } while (feedbackRound <= MAX_LIVE_FEEDBACK_ROUNDS);
        report.durationMs = totalDurationMs;
        report.model = [...actualModels][0] || run.modelUsage?.requestedModel;
        report.requestedModel = run.modelUsage?.requestedModel;
        report.actualModels = [...actualModels];
        report.timedOut = Boolean(run.timedOut);
        report.budgetWarnings = budgetWarnings(identity.name, budget, report.contextBytes!, totalDurationMs);
        if (!run.success || !fs.existsSync(outputFile)) {
            report.state = 'failed';
            report.error = run.errorMessage || `No se generó ${ROLE_OUTPUTS[role]}.`;
            options.onStageChange?.({ ...report });
            throw new Error(report.error);
        }
        if (acceptOutput && !acceptOutput(readJsonUtf8<unknown>(outputFile))) {
            const latestFeedback = fs.existsSync(repairFeedbackFile)
                ? readJsonUtf8<{ errors?: string[] }>(repairFeedbackFile)
                : undefined;
            report.state = 'failed';
            report.error = [
                `${identity.name} no corrigió su capa tras ${MAX_LIVE_FEEDBACK_ROUNDS + 1} rondas de feedback dirigido.`,
                ...(latestFeedback?.errors || []),
            ].join(' | ');
            options.onStageChange?.({ ...report });
            throw new Error(report.error);
        }
        const result = readJsonUtf8<unknown>(outputFile);
        if (role === 'behavior-author'
            && typeof result === 'object'
            && result !== null
            && normalizeBehaviorResult(result as LayeredAgentResult)) {
            writeJsonUtf8(outputFile, result);
        }
        const errors = authorContractErrors(result, role, plan);
        if (errors.length) {
            report.state = 'failed';
            report.error = errors.join(' | ');
            options.onStageChange?.({ ...report });
            throw new Error(report.error);
        }
        const typedResult = result as LayeredAgentResult;
        if (role === 'behavior-author' && typedResult.testDesignReview) {
            writeJsonUtf8(
                path.join(packageDirectory, 'test-design-review.json'),
                typedResult.testDesignReview,
            );
        }
        report.state = 'completed';
        options.onStageChange?.({ ...report });
        writeHandoff(path.join(stageDirectory, 'output-handoff.json'), {
            from: role,
            to: 'integration-reviewer',
            fromAgent: identity.name,
            toAgent: LAYERED_GENERATION_AGENTS['integration-reviewer'].name,
            recordingId: plan.recordingId,
            planId: plan.planId,
            stage: role,
            status: 'completed',
            artifacts: [artifact(outputFile, stageDirectory)],
            instructions: ['Consumir el resultado por referencia y verificar su hash antes de integrarlo.'],
        });
        return outputFile;
    }

    private async runIntegration(
        packageDirectory: string,
        agentsRoot: string,
        plan: GenerationPlan,
        behaviorFile: string,
        interactionFile: string,
        options: LayeredGenerationOptions,
        stages: LayeredGenerationStageReport[],
        attempt = 0,
        repairFeedback?: LayeredRepairFeedback,
        allowRepair = false,
    ): Promise<string> {
        const role: GenerationAgentRole = 'integration-reviewer';
        const identity = LAYERED_GENERATION_AGENTS[role];
        const stageDirectory = path.join(agentsRoot, identity.directory);
        fs.rmSync(stageDirectory, { recursive: true, force: true });
        fs.mkdirSync(stageDirectory, { recursive: true });
        verifyOutputHandoff(behaviorFile);
        verifyOutputHandoff(interactionFile);
        const judgment = gapJudgment(packageDirectory, plan);
        for (const file of INTEGRATION_INPUT_FILES) {
            copyIfPresent(packageDirectory, stageDirectory, file, judgment);
        }
        for (const source of [behaviorFile, interactionFile]) {
            fs.copyFileSync(source, path.join(stageDirectory, path.basename(source)));
            fs.copyFileSync(
                path.join(path.dirname(source), 'output-handoff.json'),
                path.join(stageDirectory, `${path.basename(path.dirname(source))}-handoff.json`),
            );
        }
        if (repairFeedback) {
            writeJsonUtf8(path.join(stageDirectory, 'integration-feedback.json'), {
                schemaVersion: 1,
                owner: LAYERED_GENERATION_AGENTS.owner.name,
                assignee: identity.name,
                attempt,
                errors: repairFeedback.integration,
                allErrors: repairFeedback.all,
            });
        }
        const prompt = integrationPrompt(Boolean(repairFeedback));
        fs.writeFileSync(path.join(stageDirectory, 'agent-task.md'), prompt, 'utf8');
        writeAgentProfile(stageDirectory, role, prompt);
        const integrationArtifacts = [
            ...INTEGRATION_INPUT_FILES.map(file => path.join(stageDirectory, file)),
            path.join(stageDirectory, path.basename(behaviorFile)),
            path.join(stageDirectory, path.basename(interactionFile)),
            ...(repairFeedback ? [path.join(stageDirectory, 'integration-feedback.json')] : []),
        ].filter(file => fs.existsSync(file)).map(file => artifact(file, stageDirectory));
        const contextBytes = integrationArtifacts.reduce((total, item) => total + item.bytes, 0);
        writeJsonUtf8(path.join(stageDirectory, 'agent-memory.json'), {
            schemaVersion: 1,
            recordingId: plan.recordingId,
            planId: plan.planId,
            agent: identity.name,
            role,
            ownership: {
                layers: ROLE_LAYERS[role],
                mayReadOtherAgentOutput: true,
                mayWriteOutsideOwnedLayers: false,
                mayRewriteAuthorFiles: false,
            },
            context: { files: integrationArtifacts.length, bytes: contextBytes },
            artifacts: integrationArtifacts,
        });
        const outputFile = path.join(stageDirectory, ROLE_OUTPUTS[role]);
        const namedSession = sessionName(plan.recordingId, role, attempt);
        const budget = stageBudget(plan, options);
        const report: LayeredGenerationStageReport = {
            role,
            agentName: identity.name,
            sessionName: namedSession,
            attempt,
            state: 'running',
            durationMs: 0,
            outputFile: path.relative(packageDirectory, outputFile).replace(/\\/g, '/'),
            execution: 'agent',
            cacheHit: false,
            contextBytes: stageContextBytes(stageDirectory),
            contextFiles: integrationArtifacts.length,
            evidenceBytes: contextBytes,
            assignedLayers: [...ROLE_LAYERS[role]],
            budget,
        };
        stages.push(report);
        options.onStageChange?.({ ...report });
        if (judgment.open.length === 0) {
            const behavior = readJsonUtf8<LayeredAgentResult>(behaviorFile);
            const interaction = readJsonUtf8<LayeredAgentResult>(interactionFile);
            writeJsonUtf8(outputFile, {
                schemaVersion: 1,
                recordingId: plan.recordingId,
                planId: plan.planId,
                resolutions: judgment.fixed,
                actionTrace: behavior.actionTrace,
                files: [...behavior.files, ...interaction.files],
                assumptions: [
                    'Integración ensamblada por Derek: todas las decisiones abiertas estaban fijadas por el plan.',
                ],
            } satisfies AutomationAgentResponse);
            report.execution = 'deterministic';
            report.sessionName = `${namedSession}/deterministic`;
        } else {
            report.budgetWarnings = budgetWarnings(identity.name, budget, report.contextBytes!);
            const run = await this.reviewProvider.execute({
                cwd: stageDirectory,
                prompt,
                timeoutMs: budget.hangStopMs,
                model: options.model,
                agentName: identity.name,
                allowValidationScripts: false,
                sessionName: namedSession,
                traceFile: './agent-execution.log',
                traceLabel: role,
                stopOnValidatedOutput: {
                    outputFile: './agent-response.json',
                    schemaFile: './agent-response.schema.json',
                },
            });
            report.durationMs = run.durationMs;
            report.model = run.modelUsage?.actualModels?.[0] || run.modelUsage?.requestedModel;
            report.requestedModel = run.modelUsage?.requestedModel;
            report.actualModels = run.modelUsage?.actualModels || [];
            report.timedOut = Boolean(run.timedOut);
            report.budgetWarnings = budgetWarnings(identity.name, budget, report.contextBytes!, run.durationMs);
            if (!run.success || !fs.existsSync(outputFile)) {
                report.state = 'failed';
                report.error = run.errorMessage || 'El integrador no generó agent-response.json.';
                options.onStageChange?.({ ...report });
                throw new Error(report.error);
            }
        }
        const proposedResponse = readJsonUtf8<AutomationAgentResponse>(outputFile);
        const behavior = readJsonUtf8<LayeredAgentResult>(behaviorFile);
        const interaction = readJsonUtf8<LayeredAgentResult>(interactionFile);
        // Los autores son propietarios exclusivos del código. El integrador
        // decide resoluciones y trazabilidad, pero no puede reescribir una capa
        // ya entregada y protegida por handoff. Las resoluciones que el plan ya
        // fijó las firma Derek: Sumrak solo aporta las de los gaps abiertos.
        const fixedGapIds = new Set(judgment.fixed.map(resolution => resolution.gapId));
        const response: AutomationAgentResponse = {
            ...proposedResponse,
            resolutions: [
                ...judgment.fixed,
                ...(proposedResponse.resolutions || []).filter(resolution => !fixedGapIds.has(resolution.gapId)),
            ],
            files: [...behavior.files, ...interaction.files],
        };
        writeJsonUtf8(outputFile, response);
        if (response.recordingId !== plan.recordingId || response.planId !== plan.planId) {
            report.state = 'failed';
            report.error = 'La respuesta integrada no corresponde al recording/plan actual.';
            options.onStageChange?.({ ...report });
            throw new Error(report.error);
        }
        // Conserva el borrador del integrador aunque la validación posterior
        // encuentre observaciones. El importador oficial decide si puede
        // aplicarse; el QA siempre puede verlo y corregirlo.
        const finalResponse = path.join(packageDirectory, 'agent-response.json');
        fs.copyFileSync(outputFile, finalResponse);
        const expectedFiles = new Map(plan.files.map(file => [file.layer, file.path]));
        const integratedFiles = new Map(response.files.map(file => [file.layer, file.path]));
        const fileContractErrors: RepairIssue[] = [...expectedFiles].flatMap(([layer, expectedPath]) =>
            integratedFiles.get(layer) === expectedPath
                ? []
                : [{
                    code: layer === 'feature' || layer === 'steps' ? 'behavior-path' : 'interaction-path',
                    message: `La capa ${layer} debe conservar la ruta ${expectedPath}.`,
                }]
        );
        if (response.files.length !== integratedFiles.size) {
            fileContractErrors.push({ code: 'duplicate-layer', message: 'La respuesta integrada contiene capas duplicadas.' });
        }
        if (integratedFiles.size !== expectedFiles.size) {
            fileContractErrors.push({ code: 'missing-layer', message: 'La respuesta integrada debe contener exactamente las capas del plan.' });
        }
        const resolvedGapIds = new Set((response.resolutions || []).map(resolution => resolution.gapId));
        for (const gapId of plan.unresolvedGapIds || []) {
            if (!resolvedGapIds.has(gapId)) {
                fileContractErrors.push({ code: 'missing-gap-resolution', message: `Falta resolución para gap abierto: ${gapId}` });
            }
        }
        for (const gapId of resolvedGapIds) {
            if (!(plan.unresolvedGapIds || []).includes(gapId)) {
                fileContractErrors.push({ code: 'missing-gap-resolution', message: `Resolución no autorizada para gap inexistente: ${gapId}` });
            }
        }
        const expectedDecisions = expectedGapDecisions(packageDirectory, plan);
        for (const resolution of response.resolutions || []) {
            const expected = expectedDecisions.get(resolution.gapId);
            if (expected && resolution.decision !== expected) {
                fileContractErrors.push({
                    code: 'gap-resolution-decision',
                    message: `La resolución ${resolution.gapId} debe conservar decision ${expected} del plan; recibió ${resolution.decision}.`,
                });
            }
        }
        const officialValidation = this.responseValidator?.(packageDirectory, response);
        if (officialValidation && !officialValidation.valid) {
            fileContractErrors.push(...officialValidation.errors.map(error => ({ code: error.code, message: error.message })));
        }
        if (fileContractErrors.length) {
            report.state = allowRepair ? 'repairing' : 'failed';
            report.error = fileContractErrors.map(issue => issue.message).join(' | ');
            options.onStageChange?.({ ...report });
            throw new LayeredValidationError(classifyValidationErrors(fileContractErrors));
        }
        report.state = 'completed';
        options.onStageChange?.({ ...report });
        return finalResponse;
    }

    private writeReport(
        reportFile: string,
        plan: GenerationPlan,
        startedAt: string,
        state: LayeredGenerationRunReport['state'],
        stages: LayeredGenerationStageReport[],
        repairAttempts: number,
    ): void {
        writeJsonUtf8(reportFile, {
            schemaVersion: 1,
            recordingId: plan.recordingId,
            planId: plan.planId,
            state,
            owner: {
                name: LAYERED_GENERATION_AGENTS.owner.name,
                role: LAYERED_GENERATION_AGENTS.owner.role,
                state: state === 'completed' ? 'completed' : 'failed',
                delegates: DELEGATES,
            },
            stages,
            repairAttempts,
            startedAt,
            completedAt: new Date().toISOString(),
        } satisfies LayeredGenerationRunReport);
    }
}
