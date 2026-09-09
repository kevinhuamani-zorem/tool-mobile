import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { AcceptanceCriterion, AcceptanceCriterionResult, AutomationAssessment, AutomationValidation,
    acceptanceArtifactHash, parseAcceptanceCriteria } from '../../../automation/contracts';
import { helperBodyHash, indexMethodBehaviors, stepDelegation, verifiedFrameworkHelpers } from '../../../indexing';
import { projectPaths } from '../../../workspace';
import { validatedTextAssertionGetters } from './textAssertionRules';
import { ResponseRuleContext, RuleReport } from './ruleContext';
import { responseScenarioResolutions } from './gherkinInspection';
import profile from './dateRangeProfile.json';

function frameworkFile(file: string): string | undefined {
    try {
        const root = fs.realpathSync(projectPaths.frameworkRoot);
        const real = fs.realpathSync(path.join(root, file));
        return real.startsWith(root + path.sep) ? fs.readFileSync(real, 'utf8') : undefined;
    } catch { return undefined; }
}

/** A trace is evidence only when its ordered steps belong to the final target Scenario. */
function tracedFeatureStep(context: ResponseRuleContext, criterion: AcceptanceCriterion): boolean {
    const features = context.response.files.filter(file => file.layer === 'feature');
    const caseId = context.scenario.request.caseId?.toUpperCase();
    if (features.length !== 1 || !caseId) return false;
    const scenarios = responseScenarioResolutions(features[0].content)
        .filter(item => item.title.match(/\[(TC-\d+)\]/i)?.[1].toUpperCase() === caseId);
    if (scenarios.length !== 1) return false;
    const traces = [...context.response.actionTrace].sort((left, right) => left.sequence - right.sequence);
    const known = new Set(context.scenario.actions.map((action, index) => action.sequence ?? index + 1));
    if (traces.length !== known.size || new Set(traces.map(trace => trace.sequence)).size !== traces.length
        || traces.some(trace => !known.has(trace.sequence))) return false;
    let previous: string | undefined;
    let cursor = 0;
    let found = false;
    for (const trace of traces) {
        const text = trace.gherkinStep.replace(/^(Given|When|Then|And|But)\s+/i, '').normalize('NFC').trim();
        if (text !== previous) {
            const index = scenarios[0].lines.findIndex((line, index) => index >= cursor
                && [line.raw, ...line.expanded].some(value => value.normalize('NFC').trim() === text));
            if (index < 0) return false;
            cursor = index + 1;
        }
        previous = text;
        if (trace.sequence === criterion.sequence) found = true;
    }
    return found;
}

/** Canonical text-returning Step; matcher/value correctness is checked separately. */
function textStepDelegation(source: ts.SourceFile, callback: ts.Expression | undefined) {
    if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) || !ts.isBlock(callback.body)) return undefined;
    const statements = callback.body.statements;
    if (statements.length !== 2 || !ts.isVariableStatement(statements[0]) || !ts.isExpressionStatement(statements[1])) return undefined;
    const declarations = statements[0].declarationList.declarations;
    const local = declarations[0];
    if (declarations.length !== 1 || !ts.isIdentifier(local.name) || !local.initializer || !ts.isAwaitExpression(local.initializer)) return undefined;
    const invocation = local.initializer.expression;
    if (!ts.isCallExpression(invocation) || !ts.isPropertyAccessExpression(invocation.expression) || !ts.isIdentifier(invocation.expression.expression)) return undefined;
    const assertion = ts.isAwaitExpression(statements[1].expression) ? statements[1].expression.expression : statements[1].expression;
    if (!ts.isCallExpression(assertion) || !ts.isPropertyAccessExpression(assertion.expression) || !['toBe', 'toContain'].includes(assertion.expression.name.text)) return undefined;
    const expected = assertion.expression.expression;
    if (!ts.isCallExpression(expected) || expected.expression.getText(source) !== 'expect' || expected.arguments.length !== 1 || expected.arguments[0].getText(source) !== local.name.text) return undefined;
    return { alias: invocation.expression.expression.text, method: invocation.expression.name.text, assertsBoolean: false };
}

/** A comparison found inside dead or conditional code is not executed evidence. */
function straightLineAssertion(method: ts.MethodDeclaration | undefined): boolean {
    if (!method?.body) return false;
    return method.body.statements.every((statement, index, statements) => {
        if (ts.isReturnStatement(statement)) return index === statements.length - 1;
        return ts.isVariableStatement(statement) || ts.isExpressionStatement(statement);
    });
}

function delegatedMethod(context: ResponseRuleContext, criterion: AcceptanceCriterion) {
    if (!tracedFeatureStep(context, criterion)) return undefined;
    const traces = context.response.actionTrace.filter(t => t.sequence === criterion.sequence);
    if (traces.length !== 1 || !traces[0].screenMethod) return undefined;
    const trace = traces[0];
    const text = trace.gherkinStep.replace(/^(Given|When|Then|And|But)\s+/, '');
    const candidates: Array<{ source: ts.SourceFile; owner: ts.ClassDeclaration; name: string; file: string; assertsBoolean: boolean }> = [];
    for (const file of context.response.files.filter(f => f.layer === 'steps')) {
        const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
        for (const statement of source.statements) {
            if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
            const call = statement.expression, regex = call.arguments[0];
            if (!['Given', 'When', 'Then'].includes(call.expression.getText(source)) || !regex || !ts.isRegularExpressionLiteral(regex)) continue;
            const raw = regex.getText(source), end = raw.lastIndexOf('/');
            const expression = raw.slice(1, end).replace(/\\\//g, '/');
            try { if (!new RegExp(expression, raw.slice(end + 1)).test(text)) continue; } catch { continue; }
            const textCriterion = criterion.kind === 'recorded-assertion' && context.scenario.actions.find(action => action.sequence === criterion.sequence)?.action === 'VERIFICAR_TEXTO';
            const delegated = stepDelegation(source, expression) || (textCriterion ? textStepDelegation(source, call.arguments[1]) : undefined);
            if (!delegated || delegated.method !== trace.screenMethod) continue;
            const imports = source.statements.filter(ts.isImportDeclaration).filter(i => i.importClause?.name?.text === delegated.alias);
            if (imports.length !== 1 || !ts.isStringLiteral(imports[0].moduleSpecifier)) continue;
            const module = imports[0].moduleSpecifier.text;
            if (!module.startsWith('@screenobjects/')) continue;
            const screenPath = 'screenobjects/' + module.slice('@screenobjects/'.length).replace(/\.(js|ts)$/, '') + '.ts';
            const screen = context.response.files.find(f => f.layer === 'screen' && f.path === screenPath);
            if (!screen) continue;
            const screenSource = ts.createSourceFile(screen.path, screen.content, ts.ScriptTarget.Latest, true);
            const exports = screenSource.statements.filter(ts.isExportAssignment);
            if (exports.length !== 1 || !ts.isNewExpression(exports[0].expression)) continue;
            const exported = exports[0].expression.expression.getText(screenSource);
            const owners = screenSource.statements.filter(ts.isClassDeclaration).filter(c => c.name?.text === exported && !c.members.some(ts.isConstructorDeclaration));
            if (owners.length === 1) candidates.push({ source: screenSource, owner: owners[0], name: delegated.method, file: screen.path, assertsBoolean: delegated.assertsBoolean });
        }
    }
    return candidates.length === 1 ? candidates[0] : undefined;
}

/** Recognize the reviewed oldest-date assertion and its unchanged dependencies.
 * Any unrecognized implementation is pending review, never an invented proof. */
function dateRangeResult(context: ResponseRuleContext, criterion: AcceptanceCriterion): Pick<AcceptanceCriterionResult, 'status' | 'message' | 'file'> {
    const delegated = delegatedMethod(context, criterion);
    if (!delegated) return { status: 'not-evaluated', message: 'No se pudo vincular una única definición del Step con el método de rango; revisa su trazabilidad.' };
    const { source, owner, name, file } = delegated;
    const members = new Map(owner.members.filter(m => m.name).map(m => [m.name!.getText(source), m]));
    const methods = new Map(owner.members.filter(ts.isMethodDeclaration).map(m => [m.name.getText(source), m]));
    const expected = criterion.days!;
    const imports = source.statements.filter(ts.isImportDeclaration);
    const importContains = (module: string, names: string[]) => imports.some(i => ts.isStringLiteral(i.moduleSpecifier) && i.moduleSpecifier.text === module
        && i.importClause?.namedBindings && ts.isNamedImports(i.importClause.namedBindings)
        && names.every(name => i.importClause!.namedBindings && ts.isNamedImports(i.importClause!.namedBindings)
            && i.importClause!.namedBindings.elements.some(e => e.name.text === name && (!e.propertyName || e.propertyName.text === name))));
    const profileMatches = () => context.scenario.platform === 'android'
        && Object.entries(profile.members).every(([name, hash]) => members.has(name) && helperBodyHash(members.get(name)!.getText(source)) === hash)
        && profile.dependencies.every(d => { const text = frameworkFile(d.file); return text !== undefined && helperBodyHash(text) === d.hash; })
        && importContains('@utils/payment.js', ['parseMovementDate', 'isWithinLastDays'])
        && importContains('@common/assertions/assertions.ts', ['Assertions'])
        && imports.some(i => i.importClause?.name?.text === 'LocatorMovements' && ts.isStringLiteral(i.moduleSpecifier)
            && i.moduleSpecifier.text === '@locators/payment/movements.locator.json')
        && (() => {
            const locatorFile = 'resources/locators/payment/movements.locator.json';
            try { const text = context.response.files.find(f => f.path === locatorFile)?.content ?? frameworkFile(locatorFile);
                return Boolean(text && JSON.parse(text).movementsAndroid?.movementDates === profile.locators.movementsAndroid); } catch { return false; }
        })();
    const visit = (methodName: string, parents = new Set<string>()): 'matched' | 'wrong-range' | 'presence' | 'unknown' => {
        const method = methods.get(methodName);
        if (!method?.body || method.parameters.length || parents.has(methodName)) return 'unknown';
        const chain = new Set([...parents, methodName]);
        if (chain.size > 12) return 'unknown';
        // Early returns, branches, catch and nested callbacks cannot prove the assertion executes.
        const statements = method.body.statements;
        if (statements.some(s => !ts.isExpressionStatement(s))) {
            const behavior = indexMethodBehaviors(source, owner, verifiedFrameworkHelpers(projectPaths.frameworkRoot)).get(methodName);
            return behavior?.complete && behavior.operations.every(op => ['exists', 'visible', 'enabled'].includes(op.kind)) ? 'presence' : 'unknown';
        }
        let result: 'matched' | 'wrong-range' | 'presence' | 'unknown' = 'unknown';
        for (const statement of statements) {
            if (!ts.isExpressionStatement(statement) || !ts.isAwaitExpression(statement.expression)) return 'unknown';
            const call = statement.expression.expression;
            if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return 'unknown';
            if (call.expression.expression.kind !== ts.SyntaxKind.ThisKeyword) return 'unknown';
            const target = call.expression.name.text;
            if (target === 'validateOldestMovementWithinDays') {
                const days = call.arguments[0];
                if (!days || !ts.isNumericLiteral(days) || call.arguments.length > 2 || (call.arguments[1] && !ts.isNumericLiteral(call.arguments[1]))) return 'unknown';
                if (Number(days.text) !== expected) return 'wrong-range';
                if (!profileMatches()) return 'unknown';
                result = 'matched';
            } else if (call.arguments.length === 0 && methods.has(target)) {
                const nested = visit(target, chain);
                if (nested === 'wrong-range') return nested;
                if (nested !== 'matched') return 'unknown';
                result = 'matched';
            } else return 'unknown';
        }
        return result;
    };
    const result = visit(name);
    return { file, status: result === 'matched' ? 'passed' : result === 'presence' || result === 'wrong-range' ? 'failed' : 'not-evaluated',
        message: result === 'matched' ? `Implementa la aserción reconocida de fecha más antigua dentro de ${expected} días; su ejecución está pendiente.`
            : result === 'wrong-range' ? `La aserción utiliza un rango distinto de ${expected} días.`
            : result === 'presence' ? `Comprobar que la fecha se ve o existe no verifica el rango de ${expected} días. Reutiliza la aserción de rango del framework.`
            : 'La implementación o sus dependencias no coinciden con una aserción de rango reconocida. Requiere revisión; no se acredita cumplimiento.' };
}

export function acceptanceCriteriaRules(context: ResponseRuleContext, report: RuleReport): AcceptanceCriterionResult[] {
    let checks: AcceptanceCriterion[];
    try { checks = parseAcceptanceCriteria(context.scenario.request.acceptanceChecks, context.scenario.actions) || []; }
    catch (error: any) {
        report.errors.push({ code: 'acceptance-contract', message: error.message });
        return [{ id: 'invalid-acceptance-contract', description: 'Contrato de criterios QA', critical: true, status: 'failed', message: error.message }];
    }
    return checks.map(criterion => {
        const base = { id: criterion.id, description: criterion.description, critical: criterion.critical,
            ...(criterion.sequence === undefined ? {} : { sequence: criterion.sequence }) };
        let result: Pick<AcceptanceCriterionResult, 'status' | 'message' | 'file'>;
        if (criterion.kind === 'manual') result = { status: 'not-evaluated', message: 'Resultado de negocio pendiente de comprobación QA sobre esta versión.' };
        else if (criterion.kind === 'date-range') result = dateRangeResult(context, criterion);
        else {
            const sequence = criterion.sequence!;
            const action = context.scenario.actions.find(a => a.sequence === sequence);
            const trace = context.response.actionTrace.find(t => t.sequence === sequence);
            const delegated = delegatedMethod(context, criterion);
            const behavior = delegated && indexMethodBehaviors(delegated.source, delegated.owner, verifiedFrameworkHelpers(projectPaths.frameworkRoot)).get(delegated.name);
            const delegatedMember = delegated?.owner.members.filter(ts.isMethodDeclaration).find(method => method.name.getText(delegated.source) === delegated.name);
            const matchesText = Boolean(delegated) && straightLineAssertion(delegatedMember)
                && action?.action === 'VERIFICAR_TEXTO' && validatedTextAssertionGetters(context).has(sequence);
            const matchesExistence = action?.action === 'VERIFICAR_EXISTE' && behavior?.complete
                && (behavior.returnType === 'void' || (behavior.returnType === 'boolean' && delegated?.assertsBoolean))
                && behavior.operations.some(op => ['exists', 'visible'].includes(op.kind) && op.locator === trace?.locatorName);
            const passed = Boolean(matchesText || matchesExistence) && !report.errors.length;
            result = { status: passed ? 'passed' : 'not-evaluated', ...(delegated ? { file: delegated.file } : {}), message: passed
                ? 'La verificación grabada está enlazada a una aserción comprobable; falta ejecutarla en el dispositivo.'
                : 'No se ha demostrado la aserción grabada y sus enlaces. Revisa los diagnósticos o la implementación.' };
        }
        if (result.status === 'failed') {
            const details = { file: result.file, message: `${criterion.id}: ${result.message}` };
            if (criterion.kind === 'date-range') report.errors.push({ code: 'acceptance-date-range', ...details });
            else report.errors.push({ code: 'acceptance-recorded-assertion', ...details });
        }
        return { ...base, ...result };
    });
}

export function buildAutomationAssessment(context: ResponseRuleContext, errors: Array<unknown>, criteria: AcceptanceCriterionResult[]): AutomationAssessment {
    const passed = criteria.filter(c => c.status === 'passed').length;
    const failed = criteria.filter(c => c.status === 'failed').length;
    const notEvaluated = criteria.filter(c => c.status === 'not-evaluated').length;
    return { schemaVersion: 1, artifactHash: acceptanceArtifactHash(context.response.files),
        static: { status: errors.length ? 'failed' : 'passed', errorCount: errors.length },
        acceptance: { status: failed ? 'failed' : !criteria.length || notEvaluated ? 'not-evaluated' : 'passed',
            total: criteria.length, passed, failed, notEvaluated, rate: criteria.length ? passed / criteria.length : null,
            criticalFailures: criteria.filter(c => c.critical && c.status === 'failed').length, criteria },
        functional: { status: 'not-evaluated' } };
}

/** Later compilation/preparation errors must invalidate the same displayed assessment. */
export function refreshAssessmentStatic(validation: AutomationValidation): void {
    if (validation.assessment) validation.assessment.static = {
        status: validation.errors.length ? 'failed' : 'passed', errorCount: validation.errors.length,
    };
}
