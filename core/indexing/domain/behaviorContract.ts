import ts from 'typescript';
import crypto from 'crypto';

export interface BehaviorOperation {
    kind: 'click' | 'scroll-down' | 'exists' | 'visible' | 'enabled' | 'text' | 'write';
    locator?: string;
    value?: string;
    operator?: 'equals' | 'contains';
    guard?: boolean;
}

/** Bounded proof, not a semantic guess about arbitrary TypeScript. */
export interface MethodBehavior {
    complete: boolean;
    operations: BehaviorOperation[];
    returnType: 'void' | 'boolean' | 'string' | 'unknown';
    parameters: number;
    sourceHash: string;
    dependencies: Record<string, string>;
    helpers: string[];
    reason?: string;
}

export const behaviorHash = (source: string): string => crypto.createHash('sha256').update(source).digest('hex');

function unwrap(node: ts.Expression): ts.Expression {
    return ts.isAwaitExpression(node) || ts.isParenthesizedExpression(node)
        ? unwrap(node.expression) : node;
}

/** Only ordinary, awaited calls are eligible. Branches/loops/unknown effects stay pending. */
export function indexMethodBehaviors(source: ts.SourceFile, declaration: ts.ClassDeclaration, helpers: ReadonlySet<string> = new Set()): Map<string, MethodBehavior> {
    const getters = new Map<string, string>();
    const methods = new Map<string, ts.MethodDeclaration>();
    const result = new Map<string, MethodBehavior>();
    for (const member of declaration.members) {
        if (!member.name || !ts.isIdentifier(member.name)) continue;
        if (ts.isMethodDeclaration(member)) methods.set(member.name.text, member);
        if (ts.isGetAccessorDeclaration(member)) {
            const keys = [...member.getText(source).matchAll(/\b\w+\.(?:\w*Android|\w*Ios|\w*iOS)\.([\w$]+)/g)].map(m => m[1]);
            const unique = [...new Set(keys)];
            const statements = member.body?.statements || [];
            const last = statements[statements.length - 1];
            const declarations = statements.slice(0, -1).flatMap(s => ts.isVariableStatement(s) ? [...s.declarationList.declarations] : []);
            const returned = last && ts.isReturnStatement(last) && last.expression && unwrap(last.expression);
            const argument = returned && ts.isCallExpression(returned) && returned.expression.getText(source) === '$' && returned.arguments[0];
            const locator = argument && ts.isIdentifier(argument) && declarations.find(d => ts.isIdentifier(d.name) && d.name.text === argument.text);
            const initializer = locator && locator.initializer && unwrap(locator.initializer);
            const safe = statements.length === 2 && declarations.length === 1 && initializer && ts.isCallExpression(initializer)
                && ts.isPropertyAccessExpression(initializer.expression) && initializer.expression.name.text === 'getElement'
                && initializer.arguments.every(a => !ts.isCallExpression(a));
            if (unique.length === 1 && safe) getters.set(member.name.text, unique[0]);
        }
    }
    const parse = (name: string, parents = new Set<string>()): MethodBehavior => {
        const cached = result.get(name);
        if (cached) return cached;
        const member = methods.get(name)!;
        const type = member.type?.getText(source).replace(/\s/g, '') || '';
        const contract: MethodBehavior = {
            complete: true, operations: [], dependencies: {}, helpers: [], parameters: member.parameters.length,
            returnType: /^(Promise<)?void>?$/.test(type) ? 'void'
                : /^(Promise<)?boolean>?$/.test(type) ? 'boolean'
                : /^(Promise<)?string>?$/.test(type) ? 'string' : 'unknown',
            sourceHash: behaviorHash(member.getText(source)),
        };
        const reject = (reason: string) => { contract.complete = false; contract.reason = reason; };
        if (parents.has(name) || !member.body || member.parameters.length) {
            reject('Recursive, parameterized or absent implementation requires a reviewed binding.');
            return contract;
        }
        const chain = new Set([...parents, name]);
        const locals = new Map<string, ts.Expression>();
        const target = (expression: ts.Expression | undefined): string | undefined => {
            if (!expression) return undefined;
            const e = unwrap(expression);
            if (ts.isIdentifier(e) && locals.has(e.text)) return target(locals.get(e.text));
            return ts.isPropertyAccessExpression(e) && e.expression.kind === ts.SyntaxKind.ThisKeyword
                ? getters.get(e.name.text) : undefined;
        };
        const literal = (e?: ts.Expression) => e && ts.isStringLiteralLike(e) ? e.text : undefined;
        const waitOptions = (args: ts.NodeArray<ts.Expression>): boolean => !args.length || (args.length === 1
            && ts.isObjectLiteralExpression(args[0]) && args[0].properties.every(property =>
                (ts.isShorthandPropertyAssignment(property) && property.name.text === 'timeout')
                || (ts.isPropertyAssignment(property) && property.name.getText(source) === 'timeout'
                    && (ts.isNumericLiteral(property.initializer) || (ts.isIdentifier(property.initializer) && property.initializer.text === 'timeout')))));
        const inspect = (expression: ts.Expression, returning = false): void => {
            const e = unwrap(expression);
            if (!ts.isCallExpression(e)) { reject('Unsupported statement or return.'); return; }
            const awaited = ts.isAwaitExpression(expression);
            const callee = e.expression;
            if (!ts.isPropertyAccessExpression(callee)) { reject('Unknown call.'); return; }
            const method = callee.name.text;
            const receiver = callee.expression;
            const getter = target(receiver);
            if (getter && awaited && returning && !e.arguments.length && contract.returnType === 'boolean' && ['isDisplayed', 'isExisting'].includes(method)) {
                contract.operations.push({ kind: method === 'isDisplayed' ? 'visible' : 'exists', locator: getter }); return;
            }
            if (getter && awaited && !returning && ['click', 'waitForExist', 'waitForDisplayed', 'waitForEnabled'].includes(method)
                && (method === 'click' ? !e.arguments.length : waitOptions(e.arguments))) {
                contract.operations.push({ kind: method === 'click' ? 'click' : method === 'waitForExist' ? 'exists' : method === 'waitForEnabled' ? 'enabled' : 'visible', locator: getter, ...(method !== 'click' ? { guard: !returning } : {}) });
                return;
            }
            if (getter && awaited && !returning && method === 'setValue' && e.arguments.length === 1 && literal(e.arguments[0]) !== undefined) {
                contract.operations.push({ kind: 'write', locator: getter, value: literal(e.arguments[0]) }); return;
            }
            if (receiver.kind === ts.SyntaxKind.ThisKeyword && awaited && methods.has(method) && !e.arguments.length) {
                const nested = parse(method, chain);
                if (!nested.complete || nested.returnType !== 'void') reject('Unproved nested call.');
                else {
                    contract.operations.push(...nested.operations);
                    Object.assign(contract.dependencies, nested.dependencies, { [method]: nested.sourceHash });
                    contract.helpers.push(...nested.helpers);
                }
                return;
            }
            if (ts.isPropertyAccessExpression(receiver) && receiver.expression.kind === ts.SyntaxKind.ThisKeyword && awaited) {
                if (helpers.has(`gestureHelper.${method}`) && receiver.name.text === 'gestureHelper' && method === 'verticalScrollingToEnd' && !e.arguments.length) {
                    contract.helpers.push(`gestureHelper.${method}`); contract.operations.push({ kind: 'scroll-down' }); return;
                }
                const element = target(e.arguments[0]);
                if (helpers.has(`uiHelper.${method}`) && receiver.name.text === 'uiHelper' && element) {
                    if (method === 'waitForElementDisplayedAndExpect' && (!returning || contract.returnType === 'void')) {
                        contract.helpers.push(`uiHelper.${method}`);
                        contract.operations.push({ kind: 'visible', locator: element }); return;
                    }
                    if (method === 'waitForElementExistByLocator' && e.arguments[1]?.kind === ts.SyntaxKind.TrueKeyword && (!returning || contract.returnType === 'boolean')) {
                        contract.helpers.push(`uiHelper.${method}`);
                        contract.operations.push({ kind: 'exists', locator: element, guard: !returning }); return;
                    }
                }
            }
            if (ts.isCallExpression(receiver) && receiver.expression.getText(source) === 'expect' && awaited) {
                const element = target(receiver.arguments[0]);
                if (element && method === 'toBeDisplayed' && !e.arguments.length) {
                    contract.operations.push({ kind: 'visible', locator: element }); return;
                }
                const expected = literal(e.arguments[0]);
                if (element && method === 'toHaveText' && e.arguments.length === 1 && expected !== undefined) {
                    contract.operations.push({ kind: 'text', locator: element, operator: 'equals', value: expected }); return;
                }
            }
            reject('Unknown helper, assertion, side effect or unawaited call.');
        };
        for (const statement of member.body.statements) {
            if (ts.isExpressionStatement(statement)) inspect(statement.expression);
            else if (ts.isReturnStatement(statement) && statement.expression) inspect(statement.expression, true);
            else if (ts.isVariableStatement(statement)) {
                for (const d of statement.declarationList.declarations) {
                    if (ts.isIdentifier(d.name) && d.initializer && target(d.initializer)) locals.set(d.name.text, d.initializer);
                    else if (ts.isIdentifier(d.name) && d.name.text === 'timeout' && d.initializer && ts.isCallExpression(d.initializer)
                        && d.initializer.expression.getText(source) === 'getTimeoutFromEnv' && !d.initializer.arguments.length
                        && /import\s*\{[^}]*\bgetTimeoutFromEnv\b[^}]*\}\s*from\s*['\"]@common\/utils\/env\/environment-config\.js['\"]/.test(source.text)) { /* Framework timeout configuration; no UI operation. */ }
                    else reject('Computed local requires analysis.');
                }
            } else reject('Control flow requires review.');
        }
        if (!contract.operations.length) reject('No observable operation.');
        // Readiness before an interaction is a guard, not another recorded action.
        contract.operations = contract.operations.filter((op, i, all) => {
            if (!['exists', 'visible', 'enabled'].includes(op.kind)) return true;
            const next = all.slice(i + 1).find(other => !['exists', 'visible', 'enabled'].includes(other.kind));
            return !(next && next.locator === op.locator && ['click', 'write', 'text'].includes(next.kind));
        });
        result.set(name, contract);
        return contract;
    };
    for (const name of methods.keys()) parse(name);
    return result;
}

/** A reusable Step delegates exactly once and does not add hidden effects. */
export function stepDelegation(source: ts.SourceFile, expression: string): { method: string; alias: string; assertsBoolean: boolean } | undefined {
    for (const statement of source.statements) {
        if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
        const call = statement.expression;
        if (!['Given', 'When', 'Then'].includes(call.expression.getText(source))) continue;
        const regex = call.arguments[0];
        if (!regex || !ts.isRegularExpressionLiteral(regex) || regex.getText(source).replace(/^\//, '').replace(/\/[a-z]*$/, '').replace(/\\\//g, '/') !== expression) continue;
        const callback = call.arguments[1];
        if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) || !ts.isBlock(callback.body) || callback.parameters.length) continue;
        const statements = callback.body.statements;
        let e: ts.Expression | undefined;
        let assertsBoolean = false;
        if (statements.length === 1 && ts.isExpressionStatement(statements[0])) e = statements[0].expression;
        if (statements.length === 2 && ts.isVariableStatement(statements[0]) && ts.isExpressionStatement(statements[1])) {
            const declarations = statements[0].declarationList.declarations;
            const local = declarations[0];
            if (declarations.length !== 1 || !ts.isIdentifier(local.name)) continue;
            const assertion = unwrap(statements[1].expression);
            if (!ts.isCallExpression(assertion) || !ts.isPropertyAccessExpression(assertion.expression)) continue;
            const matcher = assertion.expression;
            const expectCall = matcher.expression;
            if (!['toBe', 'toEqual', 'toStrictEqual'].includes(matcher.name.text) || assertion.arguments[0]?.kind !== ts.SyntaxKind.TrueKeyword
                || !ts.isCallExpression(expectCall) || expectCall.expression.getText(source) !== 'expect'
                || expectCall.arguments[0]?.getText(source) !== local.name.text) continue;
            e = local.initializer; assertsBoolean = true;
        }
        if (!e || !ts.isAwaitExpression(e)) continue;
        const delegated = unwrap(e);
        if (!ts.isCallExpression(delegated) || delegated.arguments.length || !ts.isPropertyAccessExpression(delegated.expression)) continue;
        const receiver = delegated.expression.expression;
        if (!ts.isIdentifier(receiver)) continue;
        return { alias: receiver.text, method: delegated.expression.name.text, assertsBoolean };
    }
    return undefined;
}
