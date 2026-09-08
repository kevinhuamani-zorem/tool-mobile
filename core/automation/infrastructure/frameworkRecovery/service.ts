import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import type { AutomationScenario, AutomationAgentResponse, GenerationPlan } from '../../contracts';
import type { FrameworkRecoveryPreview, FrameworkRecoveryRequest, FrameworkRecoverySaved, RecoveryFile } from '../../contracts/frameworkRecovery';
import { AutomationHistoryStore } from '../automationHistoryStore';
import type { AutomationApplicationReceipt } from '../automationApplicationReceipt';
import { RecoveryWorkspace, recoveryGitContext, recoveryHash } from './files';
import { inspectRecoveryCode, projectRecoveryFile, recoveryFeatureSteps } from './inspection';
import { recoverRelationships, recoveryLayer } from './graph';

interface PendingRecovery {
    preview: FrameworkRecoveryPreview;
    packageDirectory: string;
    target: RecoveryWorkspace;
    targetHashes: Map<string, string | null>;
    source: RecoveryWorkspace;
    sourceHashes: Map<string, string | null>;
    revisionId?: string;
    digest: string;
}
const parse = <T>(workspace: RecoveryWorkspace, file: string): T => {
    const content = workspace.read(file);
    if (content === null) throw new Error(`Falta ${file}; se necesita una exportación previa para recuperar.`);
    return JSON.parse(content) as T;
};

/** Two-step local recovery. All framework operations are read-only. */
export class FrameworkRecoveryService {
    private pending?: PendingRecovery;
    constructor(private readonly frameworkRoot: string) {}

    prepare(packageDirectory: string, request: FrameworkRecoveryRequest = {}): FrameworkRecoveryPreview {
        this.pending = undefined;
        const target = new RecoveryWorkspace(this.frameworkRoot);
        const source = new RecoveryWorkspace(packageDirectory);
        const explicitPaths = request.paths || {};
        const lastRecovery = source.read('framework-recovery.json');
        const previousRecovery = lastRecovery ? JSON.parse(lastRecovery) : undefined;
        request = { ...request, paths: { ...previousRecovery?.associations?.paths, ...request.paths },
            symbols: { ...previousRecovery?.associations?.symbols, ...request.symbols },
            prUrl: request.prUrl ?? previousRecovery?.context?.prUrl, notes: request.notes ?? previousRecovery?.context?.notes };
        const scenario = parse<AutomationScenario>(source, 'scenario.json');
        const receipt = parse<AutomationApplicationReceipt>(source, 'application-receipt.json');
        const plan = parse<GenerationPlan>(source, source.read('effective-generation-plan.json') === null ? 'generation-plan.json' : 'effective-generation-plan.json');
        if (![1, 2].includes(receipt.schemaVersion) || receipt.recordingId !== scenario.recordingId || receipt.planId !== plan.planId
            || (request.recordingId && request.recordingId !== scenario.recordingId)) throw new Error('El recibo no corresponde a este caso/plan.');
        if (!Array.isArray(receipt.files) || !receipt.files.length || receipt.files.some(file => typeof file.path !== 'string' || !['create', 'update'].includes(file.operation) || !/^[a-f0-9]{64}$/.test(file.afterHash)) || new Set(receipt.files.map(file => file.path)).size !== receipt.files.length) throw new Error('El recibo no contiene archivos exportados.');
        if ((request.prUrl?.length || 0) > 2048) throw new Error('La referencia PR admite hasta 2048 caracteres.');
        if (request.prUrl) {
            const url = new URL(request.prUrl);
            if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Referencia PR inválida. Usa una URL HTTP(S) sin credenciales.');
        }
        if ((request.notes?.length || 0) > 4000) throw new Error('Las notas admiten hasta 4000 caracteres.');
        const history = new AutomationHistoryStore(packageDirectory);
        const events = history.events();
        let response: AutomationAgentResponse | undefined;
        let preparedFiles: Array<{ path: string; before: string | null; content: string }> = [];
        for (const event of events.filter(item => item.kind === 'export-result').reverse()) {
            const artifact = event.artifacts.find(item => item.name === 'application-receipt.json');
            if (!artifact) continue;
            const historical = JSON.parse(history.readArtifact(artifact).toString('utf8')) as AutomationApplicationReceipt;
            if (receipt.exportId ? historical.exportId !== receipt.exportId : historical.responseHash !== receipt.responseHash) continue;
            if (recoveryHash(JSON.stringify(historical)) !== recoveryHash(JSON.stringify(receipt))) throw new Error('El recibo fue alterado respecto del historial.');
            const delivered = event.artifacts.find(item => item.name === 'agent-response.json');
            if (delivered) response = JSON.parse(history.readArtifact(delivered).toString('utf8'));
            const prepared = event.artifacts.find(item => item.name === 'exported-files.json');
            if (prepared) preparedFiles = JSON.parse(history.readArtifact(prepared).toString('utf8'));
            break;
        }
        if (!response) response = parse<AutomationAgentResponse>(source, 'agent-response.json');
        if (response.recordingId !== scenario.recordingId || response.planId !== plan.planId || recoveryHash(JSON.stringify(response)) !== receipt.responseHash) throw new Error('No se encontró una copia íntegra de la respuesta exportada.');
        const previous = new Map(receipt.files.map(file => {
            const prepared = preparedFiles.find(item => item.path === file.path);
            const exported = prepared?.content ?? response!.files.find(item => item.path === file.path)?.content;
            if (exported !== undefined && recoveryHash(exported) !== file.afterHash) throw new Error(`La copia exportada fue alterada: ${file.path}`);
            return [file.path, { receipt: file, exported: exported ?? null, baseline: prepared?.before as string | null | undefined }];
        }));
        const pending: FrameworkRecoveryPreview['pending'] = [];
        // Baselines from older F3 packages are optional evidence, never guessed from current disk.
        const reuse = source.read('reuse-context.json');
        const baselineRefs = reuse ? JSON.parse(reuse).updateBaselines || [] : [];
        for (const [file, item] of previous) {
            target.target(file);
            if (item.baseline === undefined && item.receipt.beforeHash === null) item.baseline = null;
            if (item.baseline === undefined) {
                const ref = baselineRefs.find((entry: any) => entry.path === file)?.reference;
                if (ref) {
                    const content = source.read(ref);
                    if (content !== null && (!item.receipt.beforeHash || recoveryHash(content) === item.receipt.beforeHash)) item.baseline = content;
                }
            }
            if (item.exported === null) pending.push({ id: `export:${file}`, path: file, message: 'La versión exportada no está disponible; asociación pendiente.' });
        }
        const paths = new Map<string, string>();
        for (const [before, now] of Object.entries(request.paths || {})) {
            if (!previous.has(before) && !plan.files.some(file => file.path === before)) {
                // A reexport already adopted the formerly moved path. Old saved aliases
                // are obsolete; new explicit associations still require validation.
                if (!Object.prototype.hasOwnProperty.call(explicitPaths, before) && previous.has(now)) continue;
                throw new Error(`Ruta original ajena al caso: ${before}`);
            }
            target.target(now);
            if (target.read(now) === null) throw new Error(`No existe la ruta asociada: ${now}`);
            paths.set(before, now);
        }
        const seeds = new Map<string, Set<string>>();
        const caseId = scenario.request?.caseId;
        const owned = (file: string) => {
            const item = previous.get(file);
            if (item?.receipt.operation === 'create') return new Set(['*']);
            return new Set(item?.receipt.symbols || []);
        };
        for (const [file] of previous) {
            let current = paths.get(file) || file;
            if (target.read(current) === null && recoveryLayer(file) === 'feature' && caseId && !paths.has(file)) {
                const matches = target.list('features', '.feature').filter(candidate => (target.read(candidate) || '').includes(`[${caseId}]`));
                if (matches.length === 1) { current = matches[0]; paths.set(file, current); }
                else pending.push({ id: `path:${file}`, path: file, message: 'Feature movido sin destino único. Asocia su ruta actual.', candidates: matches });
            }
            if (['feature', 'steps'].includes(recoveryLayer(file)) && target.read(current) !== null) seeds.set(current, owned(file));
        }
        if (!seeds.size) for (const [file] of previous) {
            const current = paths.get(file) || file;
            if (target.read(current) !== null) seeds.set(current, owned(file));
        }
        for (const [file, symbols] of Object.entries(request.symbols || {})) {
            target.target(file);
            if (!Array.isArray(symbols) || symbols.some(symbol => typeof symbol !== 'string') || symbols.length > 500) throw new Error('Asociaciones de símbolos inválidas.');
            seeds.set(file, new Set([...(seeds.get(file) || []), ...symbols]));
        }
        const hints = new Map(plan.files.map(file => [paths.get(file.path) || file.path, file.layer]));
        const graph = recoverRelationships(target, seeds, caseId, hints);
        pending.push(...graph.pending);
        // A moved layer must be reached from the case, or explicitly associated by QA.
        for (const [file] of previous) if (!paths.has(file) && !graph.selected.has(file)) {
            const candidates = [...graph.selected.keys()].filter(candidate => (graph.layers.get(candidate) || recoveryLayer(candidate)) === recoveryLayer(file) && !previous.has(candidate));
            if (candidates.length === 1 && ['steps', 'screen', 'locators'].includes(recoveryLayer(file))) paths.set(file, candidates[0]);
            else if (target.read(file) === null) pending.push({ id: `path:${file}`, path: file, message: 'Archivo movido o eliminado sin asociación única.', candidates });
        }
        const files: RecoveryFile[] = [];
        const included = new Set<string>();
        const add = (file: string, old?: string) => {
            if (included.has(file)) return;
            included.add(file);
            const prior = old ? previous.get(old) : undefined;
            const layer = plan.files.find(item => item.path === old)?.layer || graph.layers.get(file) || recoveryLayer(file);
            const current = target.read(file);
            const shared = prior ? prior.receipt.operation === 'update' : true;
            const symbols = new Set([...(prior ? owned(old!) : []), ...(graph.selected.get(file) || []), ...(request.symbols?.[file] || [])]);
            const exported = prior?.exported ?? null;
            // New dependencies are saved as the reached symbols, not arbitrary neighbours in their module.
            const projection = projectRecoveryFile(layer, exported, current, symbols, shared);
            if (projection.problem) pending.push({ id: `projection:${file}`, path: file, message: projection.problem });
            if (prior && shared && prior.baseline === undefined) pending.push({ id: `baseline:${file}`, path: file, message: 'Baseline previo no disponible; se conserva la comparación exportado/actual.' });
            files.push({ path: file, previousPath: old, layer, association: request.paths?.[old || ''] || request.symbols?.[file] ? 'qa' : old === file ? 'receipt' : 'relations',
                shared, baseline: prior?.baseline, exported, current, content: projection.content,
                currentHash: current === null ? null : recoveryHash(current), symbols: [...symbols], changes: projection.changes });
        };
        for (const [file] of previous) add(paths.get(file) || file, file);
        for (const file of graph.selected.keys()) add(file);
        for (const planned of plan.files) if (!files.some(file => file.layer === planned.layer)) pending.push({ id: `layer:${planned.layer}`, path: planned.path,
            message: `Capa ${planned.layer} sin archivo asociado. Puede guardarse como pendiente.` });
        const steps = files.filter(file => file.layer === 'feature').flatMap(file => recoveryFeatureSteps(file.content || '').steps);
        const recordedTrace = response.actionTrace || [];
        const traceAssociations = recordedTrace.map(trace => ({ sequence: trace.sequence, gherkinStep: trace.gherkinStep,
            status: steps.includes(trace.gherkinStep.replace(/^(Given|When|Then|And|But)\s+/, ''))
                && (!trace.screenMethod || graph.relations.some(link => link.to.symbol === trace.screenMethod)) ? 'preserved' as const : 'pending' as const }));
        for (const trace of traceAssociations.filter(item => item.status === 'pending')) pending.push({ id: `trace:${trace.sequence}`, message: `Acción grabada ${trace.sequence}: asociación al código pendiente. No se inventan eventos Appium.` });
        const preview: FrameworkRecoveryPreview = { associations: { paths: request.paths || {}, symbols: request.symbols || {} }, schemaVersion: 1, token: crypto.randomUUID(), recordingId: scenario.recordingId, caseId,
            exportId: receipt.exportId, sourceRevisionId: receipt.revisionId, files, relations: graph.relations,
            pending: pending.filter((item, index, all) => all.findIndex(other => other.id === item.id) === index), parameters: graph.parameters,
            recordedTrace, traceAssociations, context: { ...recoveryGitContext(this.frameworkRoot), prUrl: request.prUrl, notes: request.notes } };
        this.pending = { preview, packageDirectory, target, source, targetHashes: new Map(target.watched), sourceHashes: new Map(source.watched),
            revisionId: history.current()?.revisionId, digest: recoveryHash(JSON.stringify(preview)) };
        return preview;
    }

    save(packageDirectory: string, token: string): FrameworkRecoverySaved {
        const pending = this.pending;
        if (!pending || pending.packageDirectory !== packageDirectory || pending.preview.token !== token
            || recoveryHash(JSON.stringify(pending.preview)) !== pending.digest) throw new Error('La recuperación cambió. Prepara y revisa nuevamente.');
        pending.target.requireUnchanged(pending.targetHashes);
        pending.source.requireUnchanged(pending.sourceHashes);
        const history = new AutomationHistoryStore(packageDirectory);
        if (history.current()?.revisionId !== pending.revisionId) throw new Error('La revisión del caso cambió. Recupera nuevamente.');
        const git = recoveryGitContext(this.frameworkRoot);
        for (const key of ['repository', 'branch', 'commit'] as const) if (git[key] !== pending.preview.context[key]) {
            throw new Error('El checkout cambió después de revisar. Recupera nuevamente.');
        }
        const { token: _, ...preview } = pending.preview;
        const snapshot = { ...preview, recoveredAt: new Date().toISOString(), recoveredBy: os.userInfo().username, origin: 'qa-framework',
            context: { ...preview.context, ...git },
            files: preview.files.map(({ current, changes, ...file }) => ({ ...file, changes: changes.map(change => change.scope === 'case' ? change
                : { symbol: change.symbol, scope: change.scope }) })) };
        const file = pending.source.target('framework-recovery.json');
        const before = fs.existsSync(file) ? fs.readFileSync(file) : null;
        const bytes = JSON.stringify(snapshot, null, 2) + '\n';
        const temporary = `${file}.${crypto.randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temporary, bytes, { flag: 'wx' });
            fs.renameSync(temporary, file);
            const event = history.beginRevision({ recordingId: preview.recordingId, caseId: preview.caseId, source: 'framework-import' }, [
                { name: 'framework-recovery.json', content: bytes },
            ]);
            this.pending = undefined;
            return { revisionId: event.revisionId, recordingId: event.recordingId, files: preview.files.filter(item => item.content !== null).length, pending: preview.pending.length };
        } catch (error) {
            if (before === null) { if (fs.existsSync(file)) fs.unlinkSync(file); }
            else fs.writeFileSync(file, before);
            throw error;
        } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    }
}
