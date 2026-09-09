import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { projectPaths } from '../../../../core/workspace';
import { acceptanceArtifactHash } from '../../../../core/automation/contracts';
import { AutomationHistoryStore, acceptedGoldenFiles, goldenDatasetRoot, goldenCaseUsage, saveGoldenCase, ApprovedGoldenStore, listLegacyGoldenCases, readGoldenCase, goldenHash, goldenPath } from '../../../../core/automation';
import type { GoldenExecutionStatus, AcceptedGoldenFiles, AutomationValidation, AutomationScenario, GenerationPlan } from '../../../../core/automation';
import { RecoveryWorkspace, recoveryGitContext } from '../../../../core/automation';
import type { ReuseAnalyzer } from '../../../../core/indexing';
import type { AutomationResponseValidator } from '../../../../core/validation';
import type { AutomationHandlersContext } from '../automationHandlers';

export interface SaveGoldenCaseRequest {
    recordingId?: string; squad?: string; source?: 'recovery' | 'review'; legacyId?: string;
    executed?: GoldenExecutionStatus; notes?: string; reviewedContents?: Record<string, string>;
    token?: string; approved?: boolean; usage?: 'reference' | 'evaluation';
}
export interface SaveGoldenCaseDependencies {
    packageDirectory: string; frameworkRoot: string; reuseAnalyzer: ReuseAnalyzer;
    automationResponseValidator: AutomationResponseValidator;
    /** Compatibility only; golden publication never changes the generated-file registry. */
    generatedFileRegistry?: unknown;
}
function validateRequest(input: SaveGoldenCaseRequest) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Solicitud golden inválida.');
    for (const key of ['recordingId', 'squad', 'source', 'legacyId', 'token', 'notes'] as const)
        if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`Campo inválido: ${key}`);
    if (input.usage && !['reference', 'evaluation'].includes(input.usage)) throw new Error('Uso golden inválido.');
    if (input.source && !['recovery', 'review'].includes(input.source)) throw new Error('Origen golden inválido.');
    if (input.executed && !['passed', 'failed', 'not-run'].includes(input.executed)) throw new Error('Estado de ejecución inválido.');
    if ((input.notes?.length || 0) > 4000) throw new Error('Las notas admiten hasta 4000 caracteres.');
    if (input.reviewedContents && (typeof input.reviewedContents !== 'object' || Array.isArray(input.reviewedContents))) throw new Error('Contenidos inválidos.');
}
/** Digest of the candidate package, including absent/new artifacts and immutable history. */
function packageDigest(root: string): string {
    const entries: Array<[string, string]> = [];
    const walk = (directory: string) => {
        for (const name of fs.readdirSync(directory).sort()) {
            if (name.startsWith('.')) continue;
            const relative = path.relative(root, path.join(directory, name)).split(path.sep).join('/');
            const file = goldenPath(root, relative); const stat = fs.statSync(file);
            if (stat.isDirectory()) walk(file);
            else if (stat.isFile()) entries.push([relative, goldenHash(fs.readFileSync(file))]);
        }
    };
    walk(root); return goldenHash(JSON.stringify(entries));
}

export class GoldenCaseReview {
    private pending?: { token: string; accepted: AcceptedGoldenFiles; scenario: AutomationScenario; plan: GenerationPlan;
        recoverySnapshot?: string; dependencies: Array<{ path: string; content: string }>; validation: AutomationValidation; validationSource: 'apply' | 'golden'; catalog: any; revisionId: string;
        packageDigest: string; target: RecoveryWorkspace; hashes: Map<string, string | null>; git: ReturnType<typeof recoveryGitContext>; source: string; usage: 'reference' | 'evaluation' };
    constructor(private readonly deps: SaveGoldenCaseDependencies, private readonly root = goldenDatasetRoot()) {}
    prepare(input: SaveGoldenCaseRequest = {}) {
        this.pending = undefined; validateRequest(input);
        const { packageDirectory, frameworkRoot } = this.deps;
        const source = new RecoveryWorkspace(packageDirectory);
        const scenario = JSON.parse(source.read('scenario.json')!) as AutomationScenario;
        const plan = JSON.parse(source.read('effective-generation-plan.json') || source.read('generation-plan.json')!) as GenerationPlan;
        if (input.recordingId && input.recordingId !== scenario.recordingId) throw new Error('La grabación no corresponde al caso.');
        const history = new AutomationHistoryStore(packageDirectory);
        const revision = history.ensureRevision(scenario.recordingId, scenario.request?.caseId);
        let accepted: AcceptedGoldenFiles;
        let recovery: any;
        let recoverySnapshot: string | undefined;
        let dependencies: Array<{ path: string; content: string }> = [];
        if (input.source === 'recovery' || revision.source === 'framework-import') {
            const artifact = revision.artifacts.find(item => item.name === 'framework-recovery.json');
            if (!artifact || revision.source !== 'framework-import') throw new Error('Recupera y guarda primero la revisión actual del framework.');
            recoverySnapshot = history.readArtifact(artifact).toString('utf8');
            recovery = JSON.parse(recoverySnapshot);
            const response = JSON.parse(source.read('agent-response.json')!);
            dependencies = recovery.files.filter((file: any) => file.layer === 'dependency' && file.content !== null).map((file: any) => ({ path: file.path, content: file.content }));
            const files = recovery.files.filter((file: any) => file.layer !== 'dependency' && file.content !== null).map((file: any) => ({ layer: file.layer, path: file.path, content: file.content }));
            accepted = { response: { ...response, files, actionTrace: recovery.recordedTrace }, edited: true, editedLayers: files.map((file: any) => file.layer) };
        } else accepted = acceptedGoldenFiles(packageDirectory, frameworkRoot, input.reviewedContents || {});
        const target = new RecoveryWorkspace(frameworkRoot);
        for (const file of [...accepted.response.files, ...dependencies]) target.read(file.path);
        let validation: AutomationValidation;
        let validationSource: 'apply' | 'golden' = 'apply';
        const applied = source.read('validation.json');
        if (!accepted.edited && applied) validation = JSON.parse(applied);
        else {
            validationSource = 'golden';
            try { validation = this.deps.automationResponseValidator.validate(scenario, plan, accepted.response); }
            catch (error: any) { validation = { valid: false, qualityScore: 0, errors: [{ code: 'golden-validation-unavailable', message: error.message }], warnings: [] } as unknown as AutomationValidation; }
        }
        const catalog = this.deps.reuseAnalyzer.getCatalog(scenario.squad, scenario.platform, scenario.request?.featureScope);
        const usage = input.usage || goldenCaseUsage(scenario, this.root);
        const token = crypto.randomUUID();
        this.pending = { token, usage, accepted, dependencies, recoverySnapshot, scenario, plan, validation, validationSource, catalog, revisionId: revision.revisionId,
            packageDigest: packageDigest(packageDirectory), target, hashes: new Map(target.watched), git: recoveryGitContext(frameworkRoot), source: source.read('legacy-manifest.json') ? 'legacy-review' : recovery ? 'framework-recovery' : 'review' };
        return structuredClone({ token, datasetRoot: this.root, recordingId: scenario.recordingId, caseId: scenario.request?.caseId, revisionId: revision.revisionId,
            files: [...accepted.response.files, ...dependencies.map(file => ({ ...file, layer: 'dependency' }))], diagnostics: validation, pending: recovery?.pending || [], context: recovery?.context || this.pending.git,
            source: this.pending.source, usage, automaticVerification: 'not-reported', executionDeclaration: input.executed || 'not-run', notes: input.notes || '' });
    }
    save(input: SaveGoldenCaseRequest) {
        validateRequest(input);
        const pending = this.pending;
        if (!pending || input.token !== pending.token || input.approved !== true) throw new Error('Revisa la versión y marca la aprobación QA explícita.');
        if (packageDigest(this.deps.packageDirectory) !== pending.packageDigest) throw new Error('El caso cambió después de revisar. Prepara una nueva revisión.');
        pending.target.requireUnchanged(pending.hashes);
        const git = recoveryGitContext(this.deps.frameworkRoot);
        for (const key of ['repository', 'branch', 'commit'] as const) if (git[key] !== pending.git[key]) throw new Error('Cambió el checkout. Revisa nuevamente.');
        const saved = saveGoldenCase({ root: this.root, ...this.deps, catalog: pending.catalog, accepted: pending.accepted, recoverySnapshot: pending.recoverySnapshot, dependencies: pending.dependencies,
            validation: pending.validation, validationSource: pending.validationSource, revisionId: pending.revisionId, approved: true,
            usage: input.usage || pending.usage, executed: input.executed || 'not-run', notes: input.notes, savedBy: os.userInfo().username, source: pending.source });
        this.pending = undefined;
        // Publication is the commit point. A missing convenience history event cannot undo approval.
        let historyWarning: string | undefined;
        try {
            const history = new AutomationHistoryStore(this.deps.packageDirectory);
            history.append({ ...history.identity()!, kind: 'qa-verification', origin: 'qa', result: 'approved', stage: 'golden-publication' }, [
                { name: 'golden-publication.json', content: JSON.stringify({ goldenId: saved.manifest.goldenId, versionHash: saved.manifest.versionHash, revisionId: pending.revisionId,
                    artifactHash: acceptanceArtifactHash(pending.accepted.response.files), executed: input.executed || 'not-run',
                    qaCorrected: pending.accepted.edited || pending.source === 'framework-recovery', approval: saved.manifest.approval }) },
            ]);
        } catch { historyWarning = 'Aprobación publicada; no se pudo actualizar la vista del historial de la grabación.'; }
        return { ...saved, historyWarning, appliedEdits: [] };
    }
}

/** CLI callers must explicitly authorize after inspecting the candidate. IPC uses separate preview/save calls. */
export function saveGoldenCaseFromPackage(deps: SaveGoldenCaseDependencies, request: SaveGoldenCaseRequest) {
    if (request.approved !== true) throw new Error('Se requiere aprobación QA explícita.');
    const review = new GoldenCaseReview(deps); const preview = review.prepare(request);
    return review.save({ ...request, token: preview.token });
}

/** Selects packages inside the active recordings scope; no device is needed. */
export class GoldenCaseController {
    private pending?: { review: GoldenCaseReview; context: string; cleanup?: () => void; legacyDigest?: string; legacyDirectory?: string };
    constructor(private readonly deps: AutomationHandlersContext) {}
    private context() { return JSON.stringify([projectPaths.frameworkRoot, goldenDatasetRoot(), this.deps.state.activeSquad, this.deps.state.activeEnvironment]); }
    list() {
        const root = goldenDatasetRoot(); const store = new ApprovedGoldenStore(root);
        const legacy = listLegacyGoldenCases(root).map(directory => ({ legacyId: path.basename(directory), caseId: readGoldenCase(directory).manifest.caseId }));
        return { success: true, datasetRoot: root, index: store.index(), legacy };
    }
    prepare(input: SaveGoldenCaseRequest = {}) {
        validateRequest(input); this.pending?.cleanup?.(); this.pending = undefined;
        const { state, recordingCoverageAnalyzer } = this.deps;
        let packageDirectory: string; let cleanup: (() => void) | undefined; let legacyDirectory: string | undefined; let legacyDigest: string | undefined;
        let reuseAnalyzer = this.deps.reuseAnalyzer;
        if (input.legacyId) {
            legacyDirectory = listLegacyGoldenCases(goldenDatasetRoot()).find(directory => path.basename(directory) === input.legacyId);
            if (!legacyDirectory) throw new Error('Caso legacy no encontrado.');
            legacyDigest = packageDigest(legacyDirectory);
            const legacy = readGoldenCase(legacyDirectory);
            const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-legacy-review-')); cleanup = () => fs.rmSync(temporary, { recursive: true, force: true });
            packageDirectory = temporary;
            fs.cpSync(path.join(legacyDirectory, 'package'), temporary, { recursive: true });
            const baselines = path.join(legacyDirectory, 'baselines');
            if (fs.existsSync(baselines)) fs.cpSync(baselines, path.join(temporary, 'baselines'), { recursive: true });
            fs.writeFileSync(path.join(temporary, 'agent-response.json'), JSON.stringify(legacy.response));
            fs.copyFileSync(path.join(legacyDirectory, 'manifest.json'), path.join(temporary, 'legacy-manifest.json'));
            input = { ...input, reviewedContents: Object.fromEntries(legacy.response.files.map(file => [file.path, file.content])) };
            reuseAnalyzer = { getCatalog: () => legacy.catalog } as unknown as ReuseAnalyzer;
        } else {
            packageDirectory = input.recordingId ? path.join(recordingCoverageAnalyzer.findRecordingDirectory(input.squad || state.activeSquad, input.recordingId, state.activeEnvironment), 'generation/automation') : state.activeAutomationPackage || '';
            if (!packageDirectory) throw new Error('Selecciona una grabación con archivos generados.');
            const relative = path.relative(fs.realpathSync(projectPaths.recordings), fs.realpathSync(packageDirectory));
            if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Paquete fuera de recordings.');
        }
        try {
            const review = new GoldenCaseReview({ ...this.deps, reuseAnalyzer, packageDirectory, frameworkRoot: projectPaths.frameworkRoot });
            const preview = review.prepare(input);
            this.pending = { review, context: this.context(), cleanup, legacyDigest, legacyDirectory };
            return { success: true, preview };
        } catch (error) { cleanup?.(); throw error; }
    }
    save(input: SaveGoldenCaseRequest) {
        const pending = this.pending;
        if (!pending || pending.context !== this.context()) throw new Error('Cambió el contexto. Revisa nuevamente.');
        if (pending.legacyDirectory && packageDigest(pending.legacyDirectory) !== pending.legacyDigest) throw new Error('El caso legacy cambió después de revisar.');
        const result = pending.review.save(input);
        try { pending.cleanup?.(); } catch { /* Approval already committed. */ }
        this.pending = undefined; return { success: true, ...result };
    }
}
