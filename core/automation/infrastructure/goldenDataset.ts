/**
 * Golden dataset: casos de referencia que el QA aprueba al terminar un flujo.
 *
 * Un caso golden congela lo que hace falta para volver a juzgar al recorder
 * sin depender del framework vivo ni de la memoria de una maquina: la
 * grabacion (`scenario.json`), el plan que el resolver produjo, el catalogo
 * del framework tal como lo vio el resolver (`catalog.json`), los baselines
 * de los archivos que el caso amplio y los cuatro archivos ACEPTADOS por el
 * QA (que pueden diferir de los que el agente entrego, si el QA corrigio un
 * step tras ejecutar el caso). Con eso `tests/goldenDataset.test.js`
 * reproduce el plan, el borrador y la validacion; y `memory:seed` puede
 * sembrar la memoria de otra maquina con los mismos casos.
 *
 * Vive en `automation/infrastructure` porque lee y escribe el filesystem;
 * no conoce Electron ni la UI. El handler IPC solo orquesta: valida,
 * aplica al framework las correcciones del QA y llama a `saveGoldenCase`.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import type {
    AutomationAgentResponse,
    AutomationScenario,
    AutomationValidation,
    GenerationPlan,
    PlannedFile,
    UnresolvedGap,
} from '../contracts';
import type { SquadReuseCatalog } from '../../indexing';
import type { BaselineSnapshotPort } from '../ports/baselineSnapshotPort';
import { readJsonUtf8, readUtf8File, slug, writeJsonUtf8, writeUtf8FileAtomic } from '../../shared';
import { projectPaths } from '../../workspace';

export const GOLDEN_MANIFEST_SCHEMA_VERSION = 1 as const;
export const GOLDEN_DATASET_DIRECTORY = path.join('tests', 'golden');
export type GoldenExecutionStatus = 'passed' | 'failed' | 'not-run';

/**
 * Archivos del paquete que viajan con el caso. Son los que consumen el
 * resolver, el borrador determinista y el validador; lo que no esta aqui
 * (instrucciones, schemas, workspaces de agentes) es ruido para el replay.
 */
export const GOLDEN_PACKAGE_FILES = [
    'scenario.json',
    'generation-plan.json',
    'effective-generation-plan.json',
    'resolved-context.json',
    'unresolved-context.json',
    'gap-resolutions.json',
    'query-results.json',
    'gaps.json',
    'hints.json',
    'reuse-context.json',
    'collision-report.json',
    'validation.json',
    'application-receipt.json',
    'agent-run.json',
] as const;

export interface GoldenCaseFile {
    layer: PlannedFile['layer'];
    path: string;
    operation: PlannedFile['operation'];
    /** Copia legible bajo `expected/`, para revisarla en un PR sin abrir JSON. */
    expected: string;
    sha256: string;
}

export interface GoldenValidationProfile {
    valid: boolean;
    qualityScore: number;
    errorCounts: Record<string, number>;
    /** `apply`: la validacion con que se aplico; `golden`: recalculada al guardar tras una correccion. */
    source: 'apply' | 'golden';
}

export interface GoldenCaseManifest {
    schemaVersion: typeof GOLDEN_MANIFEST_SCHEMA_VERSION;
    caseId: string;
    recordingId: string;
    squad: string;
    platform: AutomationScenario['platform'];
    objective: string;
    savedAt: string;
    savedBy?: string;
    executed: GoldenExecutionStatus;
    notes?: string;
    /** true cuando el QA corrigio algun archivo despues de que el recorder lo aplicara. */
    edited: boolean;
    files: GoldenCaseFile[];
    validation: GoldenValidationProfile;
    framework?: { head?: string };
    package: string[];
}

export interface AcceptedGoldenFiles {
    /** La respuesta aplicada, con el contenido que el QA acepto en cada capa. */
    response: AutomationAgentResponse;
    edited: boolean;
    /** Capas cuyo contenido aceptado difiere del aplicado por el recorder. */
    editedLayers: PlannedFile['layer'][];
}

export interface SaveGoldenCaseInput {
    root: string;
    packageDirectory: string;
    frameworkRoot: string;
    catalog: SquadReuseCatalog;
    accepted: AcceptedGoldenFiles;
    validation: AutomationValidation;
    validationSource: GoldenValidationProfile['source'];
    executed: GoldenExecutionStatus;
    notes?: string;
    savedBy?: string;
}

export interface GoldenCase {
    directory: string;
    manifest: GoldenCaseManifest;
    scenario: AutomationScenario;
    plan: GenerationPlan;
    effectivePlan: GenerationPlan;
    gaps: UnresolvedGap[];
    catalog: SquadReuseCatalog;
    response: AutomationAgentResponse;
    /** Contenido previo de los archivos `update`, por ruta relativa al framework. */
    baselines: Map<string, string>;
}

const sha256 = (content: string | Buffer) => crypto.createHash('sha256').update(content).digest('hex');

/**
 * Donde vive el dataset: dentro del checkout (`tests/golden`) cuando el
 * recorder corre desde codigo, y bajo `runtime/golden` cuando corre
 * empaquetado (los recursos de la app no se escriben).
 */
export function goldenDatasetRoot(paths: { toolRoot: string; runtimeRoot: string } = projectPaths): string {
    const checkout = path.join(paths.toolRoot, GOLDEN_DATASET_DIRECTORY);
    if (fs.existsSync(path.join(paths.toolRoot, 'tests')) && fs.existsSync(path.join(paths.toolRoot, 'package.json'))) {
        return checkout;
    }
    return path.join(paths.runtimeRoot, 'runtime', 'golden');
}

/** `TC-10240-85a9110f`: legible para el QA y unico por grabacion. */
export function goldenCaseDirectoryName(scenario: Pick<AutomationScenario, 'recordingId' | 'request'>): string {
    const caseId = slug(String(scenario.request?.caseId || ''), 'caso').replace(/-+$/, '');
    const suffix = String(scenario.recordingId || '').replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase() || 'rec';
    return `${caseId}-${suffix}`;
}

function planOf(packageDirectory: string): { plan: GenerationPlan; effectivePlan: GenerationPlan } {
    const plan = readJsonUtf8<GenerationPlan>(path.join(packageDirectory, 'generation-plan.json'));
    const effectiveFile = path.join(packageDirectory, 'effective-generation-plan.json');
    const effectivePlan = fs.existsSync(effectiveFile) ? readJsonUtf8<GenerationPlan>(effectiveFile) : plan;
    return { plan, effectivePlan };
}

function normalizeContentKey(frameworkRoot: string, key: string): string {
    const absolute = path.isAbsolute(key) ? key : path.join(frameworkRoot, key);
    return path.relative(frameworkRoot, absolute).replace(/\\/g, '/');
}

/**
 * Lo que el QA acepta: por cada capa del plan, el contenido que entrego el
 * editor de la revision (`contents`, indexado por ruta absoluta o relativa)
 * o, si no lo hay, el archivo tal como esta hoy en el framework — que puede
 * incluir una correccion hecha fuera del recorder tras ejecutar el caso.
 * `edited` marca si difiere de lo que el recorder aplico (agent-response).
 */
export function acceptedGoldenFiles(
    packageDirectory: string,
    frameworkRoot: string,
    contents: Record<string, string> = {},
): AcceptedGoldenFiles {
    const response = readJsonUtf8<AutomationAgentResponse>(path.join(packageDirectory, 'agent-response.json'));
    const { effectivePlan } = planOf(packageDirectory);
    const byPath = new Map(Object.entries(contents).map(([key, value]) => [normalizeContentKey(frameworkRoot, key), value]));
    const editedLayers: PlannedFile['layer'][] = [];
    const files = response.files.map(file => {
        const planned = effectivePlan.files.find(item => item.layer === file.layer) || { path: file.path };
        const relative = planned.path.replace(/\\/g, '/');
        const absolute = path.join(frameworkRoot, relative);
        const accepted = byPath.get(relative)
            ?? (fs.existsSync(absolute) ? readUtf8File(absolute) : file.content);
        if (accepted !== file.content) editedLayers.push(file.layer);
        return { ...file, path: relative, content: accepted };
    });
    return {
        response: { ...response, files },
        edited: editedLayers.length > 0,
        editedLayers,
    };
}

export function validationProfile(
    validation: AutomationValidation,
    source: GoldenValidationProfile['source'],
): GoldenValidationProfile {
    const errorCounts: Record<string, number> = {};
    for (const error of validation.errors || []) errorCounts[error.code] = (errorCounts[error.code] || 0) + 1;
    return { valid: Boolean(validation.valid), qualityScore: Number(validation.qualityScore || 0), errorCounts, source };
}

function frameworkHead(frameworkRoot: string): string | undefined {
    try {
        return execFileSync('git', ['-C', frameworkRoot, 'rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString('utf8').trim() || undefined;
    } catch {
        return undefined;
    }
}

function copyDirectory(source: string, target: string): string[] {
    if (!fs.existsSync(source)) return [];
    const copied: string[] = [];
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const from = path.join(source, entry.name);
        const to = path.join(target, entry.name);
        if (entry.isDirectory()) {
            fs.mkdirSync(to, { recursive: true });
            copied.push(...copyDirectory(from, to).map(item => path.join(entry.name, item)));
        } else if (entry.isFile()) {
            fs.mkdirSync(path.dirname(to), { recursive: true });
            fs.copyFileSync(from, to);
            copied.push(entry.name);
        }
    }
    return copied;
}

function expectedFileName(file: { layer: string; path: string }): string {
    return `${file.layer}-${path.basename(file.path)}`;
}

/**
 * Escribe el caso bajo `<root>/<TC>-<rec>/`. Reescribir un caso existente
 * reemplaza su contenido: el dataset refleja la ultima aprobacion del QA y
 * el historial queda en git.
 */
export function saveGoldenCase(input: SaveGoldenCaseInput): { directory: string; manifest: GoldenCaseManifest } {
    const scenario = readJsonUtf8<AutomationScenario>(path.join(input.packageDirectory, 'scenario.json'));
    const { effectivePlan } = planOf(input.packageDirectory);
    const directory = path.join(input.root, goldenCaseDirectoryName(scenario));
    fs.rmSync(directory, { recursive: true, force: true });
    fs.mkdirSync(path.join(directory, 'package'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'expected'), { recursive: true });

    const copiedPackageFiles: string[] = [];
    for (const name of GOLDEN_PACKAGE_FILES) {
        const source = path.join(input.packageDirectory, name);
        if (!fs.existsSync(source)) continue;
        fs.copyFileSync(source, path.join(directory, 'package', name));
        copiedPackageFiles.push(name);
    }
    copiedPackageFiles.push(...copyDirectory(
        path.join(input.packageDirectory, 'baselines'),
        path.join(directory, 'baselines'),
    ).map(item => path.join('baselines', item).replace(/\\/g, '/')));

    const { frameworkMetrics, ...catalog } = input.catalog;
    void frameworkMetrics;
    writeJsonUtf8(path.join(directory, 'catalog.json'), catalog);
    writeJsonUtf8(path.join(directory, 'agent-response.json'), input.accepted.response);

    const files: GoldenCaseFile[] = input.accepted.response.files.map(file => {
        const planned = effectivePlan.files.find(item => item.layer === file.layer);
        const expected = expectedFileName(file);
        writeUtf8FileAtomic(path.join(directory, 'expected', expected), file.content);
        return {
            layer: file.layer,
            path: file.path,
            operation: planned?.operation || 'create',
            expected,
            sha256: sha256(file.content),
        };
    });

    const manifest: GoldenCaseManifest = {
        schemaVersion: GOLDEN_MANIFEST_SCHEMA_VERSION,
        caseId: String(scenario.request?.caseId || ''),
        recordingId: scenario.recordingId,
        squad: scenario.squad,
        platform: scenario.platform,
        objective: scenario.objective,
        savedAt: new Date().toISOString(),
        ...(input.savedBy ? { savedBy: input.savedBy } : {}),
        executed: input.executed,
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
        edited: input.accepted.edited,
        files,
        validation: validationProfile(input.validation, input.validationSource),
        ...(frameworkHead(input.frameworkRoot) ? { framework: { head: frameworkHead(input.frameworkRoot) } } : {}),
        package: copiedPackageFiles,
    };
    writeJsonUtf8(path.join(directory, 'manifest.json'), manifest);
    return { directory, manifest };
}

export function listGoldenCases(root: string): string[] {
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'manifest.json')))
        .map(entry => path.join(root, entry.name))
        .sort();
}

export function readGoldenCase(directory: string): GoldenCase {
    const manifest = readJsonUtf8<GoldenCaseManifest>(path.join(directory, 'manifest.json'));
    if (manifest.schemaVersion !== GOLDEN_MANIFEST_SCHEMA_VERSION) {
        throw new Error(`Caso golden con schemaVersion ${manifest.schemaVersion} no soportado: ${directory}`);
    }
    const packageDirectory = path.join(directory, 'package');
    const { plan, effectivePlan } = planOf(packageDirectory);
    const unresolvedFile = path.join(packageDirectory, 'unresolved-context.json');
    const gaps = fs.existsSync(unresolvedFile)
        ? (readJsonUtf8<{ gaps?: UnresolvedGap[] }>(unresolvedFile).gaps || [])
        : [];
    const baselines = new Map<string, string>();
    const baselinesDirectory = path.join(directory, 'baselines');
    for (const file of effectivePlan.files.filter(item => item.operation === 'update')) {
        const baseline = path.join(baselinesDirectory, `${file.layer}-${path.basename(file.path)}`);
        if (fs.existsSync(baseline)) baselines.set(file.path, readUtf8File(baseline));
    }
    return {
        directory,
        manifest,
        scenario: readJsonUtf8<AutomationScenario>(path.join(packageDirectory, 'scenario.json')),
        plan,
        effectivePlan,
        gaps,
        catalog: readJsonUtf8<SquadReuseCatalog>(path.join(directory, 'catalog.json')),
        response: readJsonUtf8<AutomationAgentResponse>(path.join(directory, 'agent-response.json')),
        baselines,
    };
}

/**
 * Snapshot de baselines para el replay del resolver: un archivo `update`
 * existia con el hash de su baseline; uno `create` no existia. Sin esto el
 * resolver miraria el framework vivo, donde el caso ya esta aplicado.
 */
export function goldenBaselineSnapshotPort(goldenCase: GoldenCase): BaselineSnapshotPort {
    const known = new Map<string, { exists: boolean; hash?: string }>();
    for (const file of goldenCase.effectivePlan.files) {
        const baseline = goldenCase.baselines.get(file.path);
        known.set(file.path.replace(/\\/g, '/'), file.operation === 'update' && baseline !== undefined
            ? { exists: true, hash: sha256(baseline) }
            : { exists: false });
    }
    return {
        read(relativePath: string) {
            return known.get(relativePath.replace(/\\/g, '/')) || { exists: false };
        },
    };
}

/**
 * Proyeccion del plan que el replay compara: lo que decide el resolver, sin
 * ids, hashes ni fechas que cambian por corrida.
 */
export function goldenPlanProjection(plan: GenerationPlan, gaps: UnresolvedGap[] = []): Record<string, unknown> {
    return {
        reuseTarget: plan.reuseTarget
            ? { steps: plan.reuseTarget.steps, screen: plan.reuseTarget.screen, locators: plan.reuseTarget.locators }
            : null,
        files: plan.files.map(file => ({ layer: file.layer, path: file.path, operation: file.operation })),
        resolutions: (plan.resolutions || []).map(resolution => ({
            sequence: resolution.sequence,
            action: resolution.action,
            resolution: resolution.resolution,
            locatorName: resolution.locatorName || null,
            module: resolution.source?.module || null,
        })),
        gaps: gaps.map(gap => ({ id: gap.id, type: gap.type, blocking: Boolean(gap.blocking) })),
    };
}
