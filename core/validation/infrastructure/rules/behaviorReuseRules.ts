import ts from 'typescript';
import crypto from 'crypto';
import { PreviewRuleContext, RuleReport } from './ruleContext';
import { stepDelegation, verifiedFrameworkHelpers } from '../../../indexing';
import { projectPaths } from '../../../workspace';
import { ResponseRuleContext } from './ruleContext';

export function preservedBehaviorBinding(context: ResponseRuleContext, sequence: number) {
    const row = context.scenario.request?.scenarioRows?.find(r => r.reuse?.sequences.includes(sequence));
    const binding = row?.reuse;
    if (!binding) return undefined;
    const screen = context.response.files.find(f => f.path === binding.screenFile);
    if (!screen) return undefined;
    const source = ts.createSourceFile(screen.path, screen.content, ts.ScriptTarget.Latest, true);
    const owner = source.statements.find(s => ts.isClassDeclaration(s) && s.name?.text === binding.className);
    if (!owner || !ts.isClassDeclaration(owner) || owner.members.some(ts.isConstructorDeclaration)
        || !source.statements.some(s => ts.isExportAssignment(s) && !s.isExportEquals && ts.isNewExpression(s.expression)
            && s.expression.expression.getText(source) === binding.className)) return undefined;
    const methods = owner.members.filter(ts.isMethodDeclaration);
    for (const [name, hash] of Object.entries({ ...binding.dependencies, [binding.methodName]: binding.sourceHash })) {
        const method = methods.find(m => m.name.getText(source) === name);
        if (!method || crypto.createHash('sha256').update(method.getText(source)).digest('hex') !== hash) return undefined;
    }
    const helpers = verifiedFrameworkHelpers(projectPaths.frameworkRoot);
    if ((binding.helpers || []).some(name => !helpers.has(name))) return undefined;
    const traces = context.response.actionTrace.filter(t => t.sequence === sequence);
    return traces.length === 1 && traces[0].screenMethod === binding.methodName ? binding : undefined;
}

/** A frozen binding is valid only while the existing implementation is preserved. */
export function behaviorReuseRules(context: PreviewRuleContext, report: RuleReport): void {
    for (const row of context.scenario.request.scenarioRows || []) {
        const binding = row.reuse;
        if (!binding) continue;
        const screen = context.response.files.find(f => f.path === binding.screenFile);
        const source = screen && ts.createSourceFile(screen.path, screen.content, ts.ScriptTarget.Latest, true);
        const methods = source?.statements.filter(ts.isClassDeclaration).flatMap(c => c.members.filter(ts.isMethodDeclaration)) || [];
        const method = methods.find(m => m.name.getText(source!) === binding.methodName);
        const hash = method && crypto.createHash('sha256').update(method.getText(source!)).digest('hex');
        if (hash !== binding.sourceHash || !preservedBehaviorBinding(context, binding.sequences[0])) {
            report.errors.push({ code: 'reuse-implementation-changed', file: binding.screenFile,
                message: `La reutilización de ${binding.signature} exige conservar su implementación revisada en el plan. Recupera el baseline o vuelve a analizar si el QA cambió el método.` });
        }
        for (const sequence of binding.sequences) {
            const traces = context.response.actionTrace.filter(t => t.sequence === sequence);
            if (traces.length !== 1 || traces[0].screenMethod !== binding.methodName) report.errors.push({
                code: 'reuse-binding-mismatch', file: binding.screenFile,
                message: `La acción ${sequence} debe reutilizar ${binding.methodName}; no necesita otro método.`,
            });
        }
        if (binding.kind === 'step') continue; // Existing Step resolution is checked by Cucumber collision rules.
        // Method-only reuse must still call and, for boolean APIs, assert the result.
        const steps = context.response.files.find(f => f.layer === 'steps');
        if (!steps) continue;
        const stepSource = ts.createSourceFile(steps.path, steps.content, ts.ScriptTarget.Latest, true);
        const expression = `^${row.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
        const delegation = stepDelegation(stepSource, expression);
        if (!delegation || delegation.method !== binding.methodName || (binding.returnType === 'boolean' && !delegation.assertsBoolean)) report.errors.push({
            code: 'reuse-binding-mismatch', file: steps.path, message: `El Step debe invocar ${binding.signature} y conservar la comprobación de su resultado.`,
        });
    }
}
