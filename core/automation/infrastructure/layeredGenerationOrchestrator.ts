import fs from 'fs';
import path from 'path';
import {
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
];

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

type AuthorRole = LayeredAgentResult['role'];

interface LayeredRepairFeedback {
    all: string[];
    behavior: string[];
    interaction: string[];
    integration: string[];
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
) => { valid: boolean; errors: Array<{ message: string }> };

function ensureInside(root: string, candidate: string): string {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(candidate);
    const relative = path.relative(resolvedRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Ruta fuera del workspace de agentes: ${candidate}`);
    }
    return resolved;
}

function copyIfPresent(sourceRoot: string, targetRoot: string, relativePath: string): void {
    const source = ensureInside(sourceRoot, path.join(sourceRoot, relativePath));
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return;
    const target = ensureInside(targetRoot, path.join(targetRoot, relativePath));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

function copyDirectoryIfPresent(sourceRoot: string, targetRoot: string, relativePath: string): void {
    const source = ensureInside(sourceRoot, path.join(sourceRoot, relativePath));
    if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) return;
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const childRelative = path.join(relativePath, entry.name);
        if (entry.isDirectory()) copyDirectoryIfPresent(sourceRoot, targetRoot, childRelative);
        else if (entry.isFile()) copyIfPresent(sourceRoot, targetRoot, childRelative);
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
            'El Gherkin debe ser declarativo, conservar tags y formato del framework y cada acción grabada debe quedar trazada.',
            'Steps solo puede invocar métodos del Screen Object: prohíbe XPath, UiSelector, accessibility id y selectores literales.',
            'Declara en actionTrace el screenMethod requerido para que Zorem implemente exactamente esa interfaz.',
            'Evalúa el diseño funcional como pass o suggestion; una sugerencia nunca bloquea la generación.',
        ].join(' ')
        : [
            'Genera únicamente Screen Object y Locators.',
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
        'Lee agent-task.md y los archivos enumerados en input-manifest.json.',
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
        'Lee agent-task.md, behavior-result.json, interaction-result.json y sus handoffs.',
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

function classifyValidationErrors(errors: string[]): LayeredRepairFeedback {
    const feedback: LayeredRepairFeedback = {
        all: [...new Set(errors.filter(Boolean))],
        behavior: [],
        interaction: [],
        integration: [],
    };
    for (const error of feedback.all) {
        const lower = error.toLowerCase();
        const behavior = /(feature|scenario|gherkin|step definition|steps\b|tag\b|@android|@ios)/.test(lower);
        const interaction = /(screenobject|screen object|screenmethod|locator|getter|typelocator|selector|import|api existente|apis existentes)/.test(lower);
        const integration = /(resoluci[oó]n|gap abierto|gap-|recordingid|planid|trazabilidad)/.test(lower);
        if (behavior) feedback.behavior.push(error);
        if (interaction) feedback.interaction.push(error);
        if (integration) feedback.integration.push(error);
        if (!behavior && !interaction && !integration) {
            feedback.behavior.push(error);
            feedback.interaction.push(error);
            feedback.integration.push(error);
        }
    }
    return feedback;
}

export class LayeredGenerationOrchestrator {
    constructor(
        private readonly controlledProvider: AgentProvider,
        private readonly reviewProvider: AgentProvider = controlledProvider,
        private readonly responseValidator?: LayeredResponseValidator,
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

        let repairAttempts = 0;
        try {
            let behavior = await this.runAuthor(
                root, agentsRoot, plan, 'behavior-author', options, stages, 0,
            );
            let interaction = await this.runAuthor(
                root, agentsRoot, plan, 'interaction-author', options, stages, 0, behavior,
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
                        );
                    }
                    // Si Lorem cambia su interfaz, Zorem siempre debe reconstruir
                    // su capa aunque la observación original fuera solo behavior.
                    if (feedback.interaction.length || feedback.behavior.length) {
                        interaction = await this.runAuthor(
                            root,
                            agentsRoot,
                            plan,
                            'interaction-author',
                            options,
                            stages,
                            repairAttempts,
                            behavior,
                            feedback.interaction.length ? feedback.interaction : feedback.behavior,
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
    ): Promise<string> {
        const identity = LAYERED_GENERATION_AGENTS[role];
        const stageDirectory = path.join(agentsRoot, identity.directory);
        fs.rmSync(stageDirectory, { recursive: true, force: true });
        fs.mkdirSync(stageDirectory, { recursive: true });
        for (const file of INPUT_FILES) copyIfPresent(packageDirectory, stageDirectory, file);
        copyDirectoryIfPresent(packageDirectory, stageDirectory, 'baselines');
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
            ...INPUT_FILES
            .map(file => path.join(stageDirectory, file))
            .filter(file => fs.existsSync(file)),
            ...filesInside(path.join(stageDirectory, 'baselines')),
            ...(dependencyFile ? [path.join(stageDirectory, path.basename(dependencyFile))] : []),
            ...(dependencyFile ? [path.join(stageDirectory, 'lorem-handoff.json')] : []),
            ...(repairErrors.length ? [path.join(stageDirectory, 'repair-feedback.json')] : []),
        ]
            .map(file => artifact(file, stageDirectory));
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
        const report: LayeredGenerationStageReport = {
            role,
            agentName: identity.name,
            sessionName: namedSession,
            attempt,
            state: 'running',
            durationMs: 0,
            outputFile: path.relative(packageDirectory, outputFile).replace(/\\/g, '/'),
        };
        stages.push(report);
        options.onStageChange?.({ ...report });
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
                                const classified = classifyValidationErrors(
                                    validation.errors.map(error => error.message),
                                );
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
                timeoutMs: options.timeoutMs || 300_000,
                model: options.model,
                agentName: identity.name,
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
        for (const file of [...INPUT_FILES, 'agent-response.schema.json']) {
            copyIfPresent(packageDirectory, stageDirectory, file);
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
        const outputFile = path.join(stageDirectory, ROLE_OUTPUTS[role]);
        const namedSession = sessionName(plan.recordingId, role, attempt);
        const report: LayeredGenerationStageReport = {
            role,
            agentName: identity.name,
            sessionName: namedSession,
            attempt,
            state: 'running',
            durationMs: 0,
            outputFile: path.relative(packageDirectory, outputFile).replace(/\\/g, '/'),
        };
        stages.push(report);
        options.onStageChange?.({ ...report });
        const run = await this.reviewProvider.execute({
            cwd: stageDirectory,
            prompt,
            timeoutMs: options.timeoutMs || 300_000,
            model: options.model,
            agentName: identity.name,
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
        if (!run.success || !fs.existsSync(outputFile)) {
            report.state = 'failed';
            report.error = run.errorMessage || 'El integrador no generó agent-response.json.';
            options.onStageChange?.({ ...report });
            throw new Error(report.error);
        }
        const proposedResponse = readJsonUtf8<AutomationAgentResponse>(outputFile);
        const behavior = readJsonUtf8<LayeredAgentResult>(behaviorFile);
        const interaction = readJsonUtf8<LayeredAgentResult>(interactionFile);
        // Los autores son propietarios exclusivos del código. El integrador
        // decide resoluciones y trazabilidad, pero no puede reescribir una capa
        // ya entregada y protegida por handoff.
        const response: AutomationAgentResponse = {
            ...proposedResponse,
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
        const fileContractErrors = [...expectedFiles].flatMap(([layer, expectedPath]) =>
            integratedFiles.get(layer) === expectedPath
                ? []
                : [`La capa ${layer} debe conservar la ruta ${expectedPath}.`]
        );
        if (response.files.length !== integratedFiles.size) {
            fileContractErrors.push('La respuesta integrada contiene capas duplicadas.');
        }
        if (integratedFiles.size !== expectedFiles.size) {
            fileContractErrors.push('La respuesta integrada debe contener exactamente las capas del plan.');
        }
        const resolvedGapIds = new Set((response.resolutions || []).map(resolution => resolution.gapId));
        for (const gapId of plan.unresolvedGapIds || []) {
            if (!resolvedGapIds.has(gapId)) {
                fileContractErrors.push(`Falta resolución para gap abierto: ${gapId}`);
            }
        }
        for (const gapId of resolvedGapIds) {
            if (!(plan.unresolvedGapIds || []).includes(gapId)) {
                fileContractErrors.push(`Resolución no autorizada para gap inexistente: ${gapId}`);
            }
        }
        const expectedDecisions = expectedGapDecisions(packageDirectory, plan);
        for (const resolution of response.resolutions || []) {
            const expected = expectedDecisions.get(resolution.gapId);
            if (expected && resolution.decision !== expected) {
                fileContractErrors.push(
                    `La resolución ${resolution.gapId} debe conservar decision ${expected} del plan; recibió ${resolution.decision}.`,
                );
            }
        }
        const officialValidation = this.responseValidator?.(packageDirectory, response);
        if (officialValidation && !officialValidation.valid) {
            fileContractErrors.push(...officialValidation.errors.map(error => error.message));
        }
        if (fileContractErrors.length) {
            report.state = allowRepair ? 'repairing' : 'failed';
            report.error = fileContractErrors.join(' | ');
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
