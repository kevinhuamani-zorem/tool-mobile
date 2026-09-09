import crypto from 'crypto';
import ts from 'typescript';
import { stepDelegation } from '../../indexing';
import { BehaviorReuseReport, AutomationAgentResponse } from '../contracts';
import { evaluationFraction } from './evaluationMetrics';

export interface ReuseEvaluationLabels {
    caseId?: string;
    groups: Array<{ sequences: number[]; expected: 'reuse' | 'create'; method?: string; screenFile?: string }>;
    qaMinutes?: number;
    qaCorrections?: number;
}
export interface ReuseFinalEvidence {
    response: Pick<AutomationAgentResponse, 'files' | 'actionTrace'>;
    /** Independent, pinned framework source before generation; never the exported checkout. */
    baselineFiles: Array<{ path: string; content: string }>;
}
const digest = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
function methods(files: Array<{ path: string; content: string }>) {
    return files.flatMap(file => {
        const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
        return source.statements.filter(ts.isClassDeclaration).flatMap(owner => owner.members.filter(ts.isMethodDeclaration).map(method => ({
            file: file.path, name: method.name.getText(source), hash: digest(method.getText(source)), returnsBoolean: /^(?:Promise<)?boolean>?$/.test(method.type?.getText(source) || ''),
        })));
    });
}
function invokedByStep(files: ReuseFinalEvidence['response']['files'], name: string, screenFile: string, texts: string[], returnsBoolean: boolean): boolean {
    return files.filter(file => file.layer === 'steps').some(file => {
        const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
        for (const statement of source.statements) {
            if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
            const expression = statement.expression.arguments[0];
            if (!expression || !ts.isRegularExpressionLiteral(expression)) continue;
            const raw = expression.getText(source), last = raw.lastIndexOf('/'), pattern = raw.slice(1, last);
            try { if (!texts.some(text => new RegExp(pattern, raw.slice(last + 1).replace(/[gy]/g, '')).test(text))) continue; }
            catch { continue; }
            const delegation = stepDelegation(source, pattern);
            if (delegation?.method !== name || returnsBoolean && !delegation.assertsBoolean) continue;
            const imported = source.statements.filter(ts.isImportDeclaration).find(item => item.importClause?.name?.text === delegation.alias);
            if (imported && ts.isStringLiteral(imported.moduleSpecifier)
                && imported.moduleSpecifier.text.replace(/^@screenobjects\//, 'screenobjects/').replace(/\.js$/, '.ts') === screenFile) return true;
        }
        return false;
    });
}

/** Literal no-argument reuse proof: only Steps in the final target TC earn credit. */
function targetFeatureProof(evidence: ReuseFinalEvidence, caseId?: string): boolean | undefined {
    const features = evidence.response.files.filter(file => file.layer === 'feature');
    if (!caseId || features.length !== 1) return undefined;
    const scenarios: Array<{ id?: string; steps: string[] }> = [];
    let current: typeof scenarios[number] | undefined, docString = false;
    for (const line of features[0].content.split(/\r?\n/)) {
        if (/^\s*(?:"""|```)/.test(line)) { docString = !docString; continue; }
        if (docString) continue;
        if (/^\s*Scenario(?: Outline)?:/i.test(line)) {
            current = { id: line.match(/\[(TC-\d+)\]/i)?.[1].toUpperCase(), steps: [] }; scenarios.push(current); continue;
        }
        const step = line.match(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/i);
        if (current && step) current.steps.push(step[1].normalize('NFC').trim());
    }
    const target = scenarios.filter(item => item.id === caseId.toUpperCase());
    if (target.length !== 1) return false;
    const traces = [...evidence.response.actionTrace].sort((a, b) => a.sequence - b.sequence);
    if (new Set(traces.map(trace => trace.sequence)).size !== traces.length) return false;
    let cursor = 0, previous: string | undefined;
    for (const trace of traces) {
        const text = trace.gherkinStep.replace(/^(?:Given|When|Then|And|But)\s+/i, '').normalize('NFC').trim();
        if (text !== previous) {
            const position = target[0].steps.indexOf(text, cursor);
            if (position < 0) return false;
            cursor = position + 1;
        }
        previous = text;
    }
    return true;
}

/** Independent labels define the denominator. Only delivered code can earn reuse credit. */
export function evaluateBehaviorReuse(report: BehaviorReuseReport, labels: ReuseEvaluationLabels, evidence?: ReuseFinalEvidence) {
    if (!labels.groups.length) throw new Error('Se requieren grupos esperados independientes para evaluar reutilización.');
    const seen = new Set<number>();
    for (const group of labels.groups) {
        if (!group.sequences.length || !['reuse', 'create'].includes(group.expected)) throw new Error('Grupo de evaluación inválido.');
        for (const n of group.sequences) {
            if (!Number.isInteger(n) || n < 1 || seen.has(n)) throw new Error('Las secuencias esperadas deben ser positivas y no solaparse.');
            seen.add(n);
        }
    }
    for (const value of [labels.qaMinutes, labels.qaCorrections]) if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error('Las métricas QA deben ser no negativas.');
    const key = (sequences: number[]) => sequences.join(',');
    let plannedCorrect = 0, plannedIncorrect = 0, plannedMissed = 0;
    const eligible = labels.groups.filter(g => g.expected === 'reuse').length;
    for (const group of labels.groups) {
        const decisions = report.decisions.filter(d => d.sequences.some(n => group.sequences.includes(n)));
        const exact = decisions.length === 1 && key(decisions[0].sequences) === key(group.sequences) ? decisions[0] : undefined;
        const reused = decisions.some(d => d.kind !== 'create');
        const valid = exact && exact.kind !== 'create' && (!group.method || exact.method === group.method);
        if (group.expected === 'reuse' && valid) plannedCorrect++;
        else if (reused) plannedIncorrect++;
        if (group.expected === 'reuse' && !valid) plannedMissed++;
    }
    const baseline = evidence ? methods(evidence.baselineFiles) : [], delivered = evidence ? methods(evidence.response.files.filter(f => f.layer === 'screen')) : [];
    const featureProof = evidence ? targetFeatureProof(evidence, labels.caseId) : undefined;
    const groups = labels.groups.map(group => {
        if (!evidence || featureProof === undefined || !evidence.baselineFiles.length || group.expected === 'reuse' && (!group.method || !group.screenFile)) return { ...group, status: 'not-evaluated', reused: false };
        const traces = group.sequences.map(sequence => evidence.response.actionTrace.filter(trace => trace.sequence === sequence));
        const names = [...new Set(traces.flat().map(trace => trace.screenMethod))];
        const name = traces.every(items => items.length === 1) && names.length === 1 ? names[0] : undefined;
        const candidates = delivered.filter(method => method.name === name && baseline.some(before => before.file === method.file && before.name === method.name && before.hash === method.hash));
        const used = name && candidates.length === 1 && invokedByStep(evidence.response.files, name, candidates[0].file, traces.flat().map(trace => trace.gherkinStep.replace(/^(?:Given|When|Then|And|But)\s+/i, '')), candidates[0].returnsBoolean);
        const reused = featureProof === true && candidates.length === 1 && !!used;
        const correct = group.expected === 'reuse' ? reused && name === group.method && candidates[0].file === group.screenFile : !reused;
        return { ...group, status: correct ? 'passed' : 'failed', reused, actualMethod: name, actualFile: candidates.length === 1 ? candidates[0].file : undefined };
    });
    const known = groups.filter(group => group.status !== 'not-evaluated'), unknown = groups.length - known.length;
    const tp = known.filter(group => group.expected === 'reuse' && group.status === 'passed').length;
    const fp = known.filter(group => group.reused && group.status === 'failed').length;
    const fn = known.filter(group => group.expected === 'reuse' && group.status === 'failed').length;
    return { schemaVersion: 2, status: !known.length ? 'not-evaluated' : unknown ? 'partial' : 'evaluated',
        eligibleGroups: eligible, correctlyReused: tp, incorrectlyReused: fp, missedReuse: fn,
        unlabelledDecisions: report.decisions.filter(d => d.sequences.some(n => !seen.has(n))).length,
        reuseRate: known.some(group => group.expected === 'reuse') ? tp / known.filter(group => group.expected === 'reuse').length : null,
        precision: evaluationFraction(tp, tp + fp, unknown), recall: evaluationFraction(tp, tp + fn, groups.filter(g => g.expected === 'reuse' && g.status === 'not-evaluated').length),
        groups, plannedDecisionAudit: { correctlyReused: plannedCorrect, incorrectlyReused: plannedIncorrect, missedReuse: plannedMissed, reuseRate: eligible ? plannedCorrect / eligible : null },
        qaMinutes: labels.qaMinutes ?? null, qaCorrections: labels.qaCorrections ?? null,
        deviceExecution: 'not-evaluated', goldenApproval: 'not-granted',
        scope: 'Exact baseline method preservation, action trace and Step invocation; does not prove runtime behavior.' };
}
