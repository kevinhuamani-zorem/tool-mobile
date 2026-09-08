import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import type { GenerationPlan, AutomationAgentResponse } from '../contracts';
import type { FrameworkRecoveryPreview, RecoveryLayer } from '../contracts/frameworkRecovery';
import { AutomationHistoryStore } from './automationHistoryStore';
import { RecoveryWorkspace, recoveryGitContext, recoveryHash } from './frameworkRecovery/files';
import { inspectRecoveryCode, projectRecoveryFile } from './frameworkRecovery/inspection';

export interface FrameworkBaseline {
    schemaVersion: 1;
    recordingId: string;
    planId: string;
    revisionId: string;
    context: FrameworkRecoveryPreview['context'];
    files: Array<{ path: string; layer: RecoveryLayer; content: string | null; symbols: string[]; shared: boolean }>;
    pending: FrameworkRecoveryPreview['pending'];
    recordedTrace?: FrameworkRecoveryPreview['recordedTrace'];
    relations?: FrameworkRecoveryPreview['relations'];
}
export interface ReconciliationInput { baseline: FrameworkBaseline; reviewed?: boolean }
export const conflictMarkers = /^(?:<<<<<<< PROPUESTA|\|\|\|\|\|\|\| BASELINE_QA|=======|>>>>>>> FRAMEWORK)\r?$/m;

/** The mutable file is only a view; the history artifact authorizes reconciliation. */
export function loadFrameworkBaseline(directory: string, plan: GenerationPlan): FrameworkBaseline | undefined {
    if (!plan.reconciliation) return undefined;
    const history = new AutomationHistoryStore(directory);
    for (const event of history.events().reverse()) for (const artifact of event.artifacts) {
        if (event.kind !== 'artifact-captured' || event.stage !== 'regeneration:baseline' || artifact.name !== 'framework-baseline.json') continue;
        const value = JSON.parse(history.readArtifact(artifact).toString('utf8')) as FrameworkBaseline;
        if (value.planId !== plan.planId) continue;
        if (value.schemaVersion !== 1 || value.recordingId !== plan.recordingId || value.revisionId !== plan.reconciliation.revisionId)
            throw new Error('Baseline de reconciliación ajeno al plan.');
        return value;
    }
    throw new Error('No existe evidencia íntegra del baseline QA. Recupera y prepara nuevamente.');
}

export function planForReconciliation(root: string, plan: GenerationPlan, baseline?: FrameworkBaseline): GenerationPlan {
    if (!baseline) return plan;
    const workspace = new RecoveryWorkspace(root);
    return { ...plan, files: plan.files.map(file => {
        const prior = baseline.files.find(item => item.path === file.path && item.layer === file.layer);
        if (!prior) throw new Error(`Ruta no asociada al baseline QA: ${file.path}`);
        const current = workspace.read(file.path);
        if (current === null && prior.content !== null) throw new Error(`Ruta movida o eliminada: ${file.path}. Recupera su nueva asociación antes de reexportar.`);
        return { ...file, operation: current === null ? 'create' : 'update', baseHash: current === null ? undefined : recoveryHash(current) };
    }) };
}

/** Git's text merge runs only on isolated temporary files, never on the checkout. */
export function mergeFrameworkText(base: string, proposed: string, current: string): { content: string; conflict: boolean } {
    if (proposed === base || proposed === current) return { content: current, conflict: false };
    if (current === base) return { content: proposed, conflict: false };
    if ([base, proposed, current].some(value => value.includes('\0'))) throw new Error('No se puede reconciliar contenido binario.');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-merge-'));
    try {
        const files = ['proposed', 'base', 'current'].map(name => path.join(directory, name));
        [proposed, base, current].forEach((content, index) => fs.writeFileSync(files[index], content));
        try {
            const content = execFileSync('git', ['merge-file', '-p', '--diff3', '-L', 'PROPUESTA', '-L', 'BASELINE_QA', '-L', 'FRAMEWORK', ...files],
                { encoding: 'utf8', timeout: 10_000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
            return { content, conflict: false };
        } catch (error: any) {
            if (typeof error.status === 'number' && error.status > 0 && error.status <= 127 && typeof error.stdout === 'string' && conflictMarkers.test(error.stdout))
                return { content: error.stdout, conflict: true };
            throw new Error('No se pudo combinar el código con Git. Conserva los archivos y vuelve a preparar la recuperación.');
        }
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

export function reconcileFrameworkFile(file: AutomationAgentResponse['files'][number], current: string | null, input: ReconciliationInput) {
    const saved = input.baseline.files.find(item => item.path === file.path && item.layer === file.layer);
    if (!saved) throw new Error(`Archivo fuera del baseline QA: ${file.path}`);
    if (current === null && saved.content !== null) throw new Error(`Archivo movido o eliminado: ${file.path}. Recupera nuevamente.`);
    let proposed = file.content;
    const base = input.reviewed ? current : saved.content;
    if (saved.shared && base !== null && !saved.symbols.includes('*')) {
        const before = inspectRecoveryCode(file.layer, base);
        const after = inspectRecoveryCode(file.layer, proposed);
        const selected = new Set(saved.symbols);
        // New symbols may be introduced for this case; existing foreign APIs remain intact.
        for (const unit of after.units) if (!before.units.some(old => old.key === unit.key)) selected.add(unit.key);
        for (const unit of after.units) if (unit.key.startsWith('import:')) selected.add(unit.key);
        const projection = projectRecoveryFile(file.layer, base, proposed, selected, true);
        if (projection.problem) throw new Error(`${file.path}: ${projection.problem}`);
        const foreign = projection.changes.filter(change => change.scope === 'unrelated');
        if (foreign.length && input.reviewed) throw new Error(`La edición cambia símbolos compartidos ajenos: ${file.path} (${foreign.map(item => item.symbol).join(', ')}).`);
        proposed = projection.content!;
    }
    const merged = input.reviewed ? { content: proposed, conflict: conflictMarkers.test(proposed) }
        : mergeFrameworkText(base || '', proposed, current || '');
    return merged;
}

export function baselineFromRecovery(preview: FrameworkRecoveryPreview, planId: string, revisionId: string): FrameworkBaseline {
    return { schemaVersion: 1, recordingId: preview.recordingId, planId, revisionId, context: preview.context,
        files: preview.files.map(file => ({ path: file.path, layer: file.layer, content: file.current, symbols: file.symbols, shared: file.shared })), pending: preview.pending, recordedTrace: preview.recordedTrace, relations: preview.relations };
}
export { recoveryGitContext };
