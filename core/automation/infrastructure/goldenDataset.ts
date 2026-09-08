import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ApprovedGoldenStore, goldenPath } from './approvedGoldenStore';
import { AutomationHistoryStore } from './automationHistoryStore';
import { RecoveryWorkspace, recoveryGitContext } from './frameworkRecovery/files';
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
import { readJsonUtf8, readUtf8File, slug } from '../../shared';
import { projectPaths, resolveGoldenRepository } from '../../workspace';
export { GOLDEN_DATASET_DIRECTORY } from '../../workspace';

export const GOLDEN_MANIFEST_SCHEMA_VERSION = 2 as const;
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
    'golden-examples.json',
    'layered-generation-run.json',
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
    schemaVersion: 1 | 2;
    goldenId?: string;
    versionHash?: string;
    revisionId?: string;
    contract?: string;
    source?: string;
    approval?: { status: 'approved'; actor: string; at: string; source: 'qa-declaration' };
    active?: boolean;
    artifacts?: Record<string, { sha256: string; bytes: number }>;
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
    recoverySnapshot?: string;
    dependencies?: Array<{ path: string; content: string }>;
    usage?: 'reference' | 'evaluation';
    approved: boolean;
    revisionId: string;
    source?: string;
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

/** Both source and packaged apps share tests/golden in a recorder Git checkout. */
export function goldenDatasetRoot(paths: { toolRoot: string; runtimeRoot: string } = projectPaths): string {
    return resolveGoldenRepository(paths).datasetRoot;
}

/** `TC-10240-85a9110f`: legible para el QA y unico por grabacion. */
export function goldenCaseDirectoryName(scenario: Pick<AutomationScenario, 'recordingId' | 'request'>): string {
    const caseId = slug(String(scenario.request?.caseId || ''), 'caso').replace(/-+$/, '');
    const suffix = String(scenario.recordingId || '').replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase() || 'rec';
    return `${caseId}-${suffix}`;
}

function planOf(packageDirectory: string): { plan: GenerationPlan; effectivePlan: GenerationPlan } {
    const workspace = new RecoveryWorkspace(packageDirectory);
    const plan = JSON.parse(workspace.read('generation-plan.json')!) as GenerationPlan;
    const effectiveFile = path.join(packageDirectory, 'effective-generation-plan.json');
    const effectivePlan = fs.existsSync(effectiveFile) ? JSON.parse(workspace.read('effective-generation-plan.json')!) : plan;
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
    const response = JSON.parse(new RecoveryWorkspace(packageDirectory).read('agent-response.json')!) as AutomationAgentResponse;
    const { effectivePlan } = planOf(packageDirectory);
    const byPath = new Map(Object.entries(contents).map(([key, value]) => [normalizeContentKey(frameworkRoot, key), value]));
    const workspace = new RecoveryWorkspace(frameworkRoot);
    for (const [relative, content] of byPath) {
        if (typeof content !== 'string' || !effectivePlan.files.some(file => file.path === relative)) throw new Error('Archivo revisado ajeno al plan.');
        workspace.target(relative);
    }
    const editedLayers: PlannedFile['layer'][] = [];
    const files = response.files.map(file => {
        const planned = effectivePlan.files.find(item => item.path === file.path) || effectivePlan.files.find(item => item.layer === file.layer) || { path: file.path };
        const relative = planned.path.replace(/\\/g, '/');
        const current = workspace.read(relative);
        const accepted = byPath.get(relative) ?? current ?? file.content;
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

/** Freeze exact reviewed bytes. Only an append-only QA publication activates a version. */
const goldenIdentity = (scenario: AutomationScenario) => ({ recordingId: scenario.recordingId, caseId: scenario.request?.caseId || '', squad: scenario.squad, platform: scenario.platform, featureScope: scenario.request?.featureScope || '', environment: scenario.environment || '' });
/** Preserve the latest explicit split, including a temporarily revoked case. */
export function goldenCaseUsage(scenario: AutomationScenario, root = goldenDatasetRoot()): 'reference' | 'evaluation' {
    const goldenId = `golden-${sha256(JSON.stringify(goldenIdentity(scenario)))}`;
    return fs.existsSync(goldenPath(root, `approved/${goldenId}/publications`))
        ? new ApprovedGoldenStore(root).read(goldenId).publication.usage || 'reference' : 'reference';
}

export function saveGoldenCase(input: SaveGoldenCaseInput) {
    if (input.approved !== true || !input.savedBy?.trim() || !input.revisionId) throw new Error('Se requiere aprobación QA explícita de una revisión.');
    const workspace = new RecoveryWorkspace(input.packageDirectory);
    const scenario = JSON.parse(workspace.read('scenario.json')!) as AutomationScenario;
    const { effectivePlan } = planOf(input.packageDirectory);
    const artifacts = new Map<string, Buffer>();
    const add = (name: string, content: string | Buffer) => artifacts.set(name, Buffer.isBuffer(content) ? content : Buffer.from(content));
    const addJson = (name: string, content: unknown) => add(name, JSON.stringify(content, null, 2) + '\n');
    const copiedPackageFiles: string[] = [];
    for (const name of [...GOLDEN_PACKAGE_FILES, 'framework-recovery.json', 'framework-baseline.json', 'baseline-response.json', 'legacy-manifest.json']) {
        const content = name === 'framework-recovery.json' && input.recoverySnapshot ? input.recoverySnapshot : workspace.read(name);
        if (content !== null) { add(`package/${name}`, content); copiedPackageFiles.push(name); }
    }
    const baselineRoot = goldenPath(input.packageDirectory, 'baselines');
    if (fs.existsSync(baselineRoot)) for (const name of fs.readdirSync(baselineRoot)) {
        const content = workspace.read(`baselines/${name}`);
        if (content !== null) { add(`baselines/${name}`, content); copiedPackageFiles.push(`baselines/${name}`); }
    }
    const history = new AutomationHistoryStore(input.packageDirectory);
    const events = history.events().map(event => ({ ...event, artifacts: event.artifacts.filter(item =>
        /(?:evaluation-pass|evaluation-validation|agent-response|response|interaction-result|behavior-result|design-review-result|integration-result|baseline-response|framework-recovery|framework-baseline|exported-files|validation|generation-plan|scenario)\.json$/.test(item.name) || item.name.startsWith('golden-examples/')) }));
    for (const event of events) for (const artifact of event.artifacts) add(`provenance/blobs/${artifact.sha256}`, history.readArtifact(artifact));
    addJson('provenance/events.json', events);
    const original = workspace.read('agent-response.json');
    if (original) add('provenance/original-agent-response.json', original);
    const before = original ? JSON.parse(original).files || [] : [];
    addJson('qa-changes.json', input.accepted.response.files.map(file => {
        const prior = before.find((item: any) => item.path === file.path)?.content ?? null;
        return { path: file.path, before: prior, after: file.content, beforeHash: prior === null ? null : sha256(prior), afterHash: sha256(file.content), changed: prior !== file.content };
    }));
    const dependencies = (input.dependencies || []).map(file => ({ path: file.path, content: file.content })).sort((a, b) => a.path.localeCompare(b.path));
    for (const file of dependencies) { new RecoveryWorkspace(input.frameworkRoot).target(file.path); if (typeof file.content !== 'string') throw new Error('Dependencia inválida.'); }
    addJson('dependency-files.json', dependencies);
    addJson('diagnostics.json', input.validation);
    addJson('execution.json', { declaration: { status: input.executed, source: 'qa-declaration' }, automaticVerification: 'not-reported' });
    const { frameworkMetrics: _, ...catalog } = input.catalog;
    addJson('catalog.json', catalog);
    addJson('agent-response.json', input.accepted.response);
    const seen = new Set<string>();
    const files: GoldenCaseFile[] = input.accepted.response.files.map(file => {
        new RecoveryWorkspace(input.frameworkRoot).target(file.path);
        if (typeof file.content !== 'string' || seen.has(file.path) || !['feature', 'steps', 'screen', 'locators'].includes(file.layer)) throw new Error('Capas golden inválidas o duplicadas.');
        seen.add(file.path);
        const expected = `${file.layer}-${sha256(file.path).slice(0, 12)}-${path.basename(file.path)}`;
        add(`expected/${expected}`, file.content);
        return { layer: file.layer, path: file.path, operation: effectivePlan.files.find(item => item.path === file.path)?.operation || 'update', expected, sha256: sha256(file.content) };
    });
    if (!files.length) throw new Error('No hay archivos para aprobar.');
    const contract = 'mobile-four-layers/v1';
    const identity = goldenIdentity(scenario);
    const goldenId = `golden-${sha256(JSON.stringify(identity))}`;
    const previousUsage = goldenCaseUsage(scenario, input.root);
    const contextHash = sha256(JSON.stringify([...artifacts].filter(([name]) => !name.startsWith('provenance/') && !name.startsWith('expected/') && !['execution.json', 'agent-response.json', 'dependency-files.json'].includes(name)).map(([name, content]) => [name, sha256(content)]).sort(([a], [b]) => a.localeCompare(b))));
    const versionHash = sha256(JSON.stringify({ ...identity, contextHash, scenarioHash: sha256(artifacts.get('package/scenario.json')!), contract, dependencies, files: input.accepted.response.files.map(file => ({ layer: file.layer, path: file.path, content: file.content })).sort((a, b) => a.path.localeCompare(b.path)) }));
    const manifest = {
        schemaVersion: 2 as const, ...identity, goldenId, versionHash, revisionId: input.revisionId, contract, contextHash, catalogSource: 'approval-preview', source: input.source || 'review',
        objective: scenario.objective, savedAt: new Date().toISOString(), savedBy: input.savedBy, executed: input.executed,
        notes: input.notes?.trim(), usage: input.usage || previousUsage || 'reference', edited: input.accepted.edited, files, validation: validationProfile(input.validation, input.validationSource),
        framework: recoveryGitContext(input.frameworkRoot), package: copiedPackageFiles,
        artifacts: Object.fromEntries([...artifacts].map(([name, content]) => [name, { sha256: sha256(content), bytes: content.length }])),
    };
    return new ApprovedGoldenStore(input.root).publish(manifest, artifacts, input.savedBy, input.revisionId, input.approved);
}

/** Legacy cases are review candidates, never approved index entries. */
export function listLegacyGoldenCases(root: string): string[] {
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name !== 'approved')
        .map(entry => goldenPath(root, `${entry.name}/manifest.json`)).filter(file => fs.existsSync(file))
        .filter(file => JSON.parse(fs.readFileSync(file, 'utf8')).schemaVersion === 1).map(file => path.dirname(file)).sort();
}

export function listGoldenCases(root: string): string[] {
    return new ApprovedGoldenStore(root).index().entries.map(entry => entry.directory);
}

export function readGoldenCase(directory: string): GoldenCase {
    let manifest = JSON.parse(fs.readFileSync(goldenPath(directory, 'manifest.json'), 'utf8')) as GoldenCaseManifest;
    if (manifest.schemaVersion === 2) {
        const root = path.resolve(directory, '../../../..');
        const verified = new ApprovedGoldenStore(root).read(manifest.goldenId!, manifest.versionHash!);
        if (path.resolve(verified.directory) !== path.resolve(directory)) throw new Error('Directorio golden inválido.');
        manifest = verified.manifest;
    } else if (manifest.schemaVersion !== 1) throw new Error('Versión golden no soportada.');
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
        if (fs.existsSync(baseline)) baselines.set(file.path, new RecoveryWorkspace(baselinesDirectory).read(path.basename(baseline))!);
    }
    return {
        directory,
        manifest,
        scenario: JSON.parse(new RecoveryWorkspace(packageDirectory).read('scenario.json')!),
        plan,
        effectivePlan,
        gaps,
        catalog: readJsonUtf8<SquadReuseCatalog>(path.join(directory, 'catalog.json')),
        response: JSON.parse(new RecoveryWorkspace(directory).read('agent-response.json')!),
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
