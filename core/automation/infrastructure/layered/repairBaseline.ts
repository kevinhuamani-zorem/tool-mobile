import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import ts from 'typescript';
import type { GenerationPlan } from '../../contracts';
import type { LayeredAgentResult } from '../../domain/layeredGenerationContracts';
import { readJsonUtf8, writeJsonUtf8 } from '../../../shared';
import { AutomationHistoryStore } from '../automationHistoryStore';
import type { AuthorRole, LayeredRepairFeedback } from './roles';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Only the preceding pass of this invocation may become a repair baseline. */
export function captureRepairBaseline(file: string, plan: GenerationPlan, role: AuthorRole, attempt: number): Buffer | undefined {
    if (attempt !== 1 || !fs.existsSync(file) || !fs.lstatSync(file).isFile()) return undefined;
    const bytes = fs.readFileSync(file);
    try {
        const value = JSON.parse(bytes.toString('utf8')) as LayeredAgentResult;
        if (value.recordingId !== plan.recordingId || value.planId !== plan.planId || value.role !== role) return undefined;
        if (!Array.isArray(value.files)) return undefined;
        return bytes;
    } catch { return undefined; }
}

/** Expected hashes stay outside the agent workspace, in the calling process. */
export function writeRepairBaseline(stage: string, bytes: Buffer | undefined, plan: GenerationPlan, role: AuthorRole, errors: string[]) {
    if (!bytes) return undefined;
    const resultFile = path.join(stage, 'previous-author-result.json');
    fs.writeFileSync(resultFile, bytes);
    const contractFile = path.join(stage, 'repair-baseline.json');
    writeJsonUtf8(contractFile, {
        schemaVersion: 1, recordingId: plan.recordingId, planId: plan.planId, role,
        sourcePass: 1, targetPass: 2, result: { path: 'previous-author-result.json', sha256: sha256(bytes), bytes: bytes.length },
        assignedErrors: errors,
        instructions: 'Parte de tu entrega anterior. Modifica solo lo necesario para estos errores y la interfaz vigente; conserva el resto, incluidos nombres y pares TypeLocator/valor. Esta base no acredita calidad ni aprobación QA.',
    });
    return [resultFile, contractFile].map(file => ({ file, sha256: sha256(fs.readFileSync(file)) }));
}

export function verifyRepairBaseline(expected: ReturnType<typeof writeRepairBaseline>): void {
    for (const item of expected || []) {
        if (!fs.existsSync(item.file) || !fs.lstatSync(item.file).isFile() || sha256(fs.readFileSync(item.file)) !== item.sha256) {
            throw new Error('[repair-baseline-integrity] La base de reparación fue alterada. Conserva previous-author-result.json y repair-baseline.json; entrega los cambios solo en tu resultado.');
        }
    }
}

/** Compare diagnostics, never select a previous failed draft as an automatic success. */
export function recordRepairComparison(root: string, plan: GenerationPlan, previous: LayeredRepairFeedback, current: LayeredRepairFeedback): void {
    const before = new Set(previous.all);
    const after = new Set(current.all);
    const value = {
        schemaVersion: 1, recordingId: plan.recordingId, planId: plan.planId, sourcePass: 1, targetPass: 2,
        comparison: 'diagnostics',
        resolved: [...before].filter(issue => !after.has(issue)),
        persisting: [...after].filter(issue => before.has(issue)),
        introduced: [...after].filter(issue => !before.has(issue)),
        valid: current.all.length === 0,
    };
    const file = path.join(root, 'agents', 'derek', 'repair-comparison.json');
    writeJsonUtf8(file, value);
    new AutomationHistoryStore(root).captureFile(file, 'recorder', 'repair:comparison', 2);
}

/** An additive update cannot repair a shared method by replacing its body. */
export function routeSharedMethodRepair(root: string, plan: GenerationPlan, feedback: LayeredRepairFeedback, behaviorFile?: string): void {
    if (plan.reconciliation || !behaviorFile) return;
    let behavior: LayeredAgentResult;
    try { behavior = readJsonUtf8<LayeredAgentResult>(behaviorFile); } catch { return; }
    const screens = plan.files.filter(file => file.layer === 'screen' && file.operation === 'update');
    for (const file of screens) {
        const baseline = path.join(root, 'baselines', `screen-${path.basename(file.path)}`);
        if (!fs.existsSync(baseline)) continue;
        const source = ts.createSourceFile(file.path, fs.readFileSync(baseline, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        const methods = new Set<string>();
        for (const statement of source.statements) {
            if (!ts.isClassDeclaration(statement)) continue;
            for (const member of statement.members) {
                if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) methods.add(member.name.text);
            }
        }
        const failed = feedback.interaction.filter(issue => (issue.includes('[trace-screen-method]') || issue.includes('[shared-symbol-change-discarded]')) && issue.includes(file.path));
        const sequences = new Set(failed.flatMap(issue => [...issue.matchAll(/acci[oó]n\s+(\d+)/gi)].map(match => Number(match[1]))));
        const affected = new Set((behavior.actionTrace || []).filter(trace => trace.screenMethod && methods.has(trace.screenMethod)
            && (sequences.has(trace.sequence) || failed.some(issue => issue.includes('[shared-symbol-change-discarded]') && issue.includes(trace.screenMethod!)))).map(trace => trace.screenMethod!));
        for (const method of affected) {
            const issue = `[shared-method-repair] ${file.path}: ${method} pertenece al baseline compartido y la actualización aditiva conserva su cuerpo. Lorem debe dirigir las acciones afectadas a un método nuevo específico del caso y ajustar sus Steps/actionTrace; Zorem debe implementar esa interfaz consumiendo los getters del plan y conservar ${method} intacto. No cambies una reutilización fijada por QA; si el plan no autoriza sustituirla, informa el pendiente.`;
            for (const key of ['behavior', 'interaction'] as const) if (!feedback[key].includes(issue)) feedback[key].push(issue);
        }
    }
}
