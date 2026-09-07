/** Provenance acotada de verificaciones Page Object: Screen devuelve, Step afirma. */
import ts from 'typescript';
import { matchingStepDefinitions } from '../../../shared';
import { bindingNames } from './screenAst';

const unwrap = (input: ts.Expression): ts.Expression => {
    while (ts.isParenthesizedExpression(input) || ts.isAwaitExpression(input)
        || ts.isAsExpression(input) || ts.isNonNullExpression(input)) input = input.expression;
    return input;
};

function declares(root: ts.Node, name: string): boolean {
    let found = false;
    const visit = (node: ts.Node): void => {
        if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && bindingNames(node.name).includes(name)) found = true;
        if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name?.text === name) found = true;
        if (ts.isImportClause(node) && node.name?.text === name) found = true;
        if ((ts.isImportSpecifier(node) || ts.isNamespaceImport(node)) && node.name.text === name) found = true;
        ts.forEachChild(node, visit);
    };
    visit(root);
    return found;
}

function invalidateMentioned<T>(node: ts.Node, bindings: Map<string, T>): void {
    if (ts.isIdentifier(node) && bindings.has(node.text)) {
        const value = bindings.get(node.text);
        for (const [name, entry] of bindings) if (entry === value) bindings.delete(name);
    }
    ts.forEachChild(node, child => invalidateMentioned(child, bindings));
}

type BooleanValue = { kind: 'boolean' | 'promise' | 'array' | 'array-promise'; getters: Set<string> };

/**
 * Solo flujos rectos de const/return y conjunciones positivas. No se cuentan
 * lecturas descartadas, OR, funciones anidadas ni valores constantes. Una
 * llamada desconocida que toca un alias lo invalida (puede mutarlo).
 */
export function screenReturnedBooleanGetters(content: string, className: string): Map<string, Set<string>> {
    const source = ts.createSourceFile('screen.ts', content, ts.ScriptTarget.Latest, true);
    const declaration = source.statements.find((node): node is ts.ClassDeclaration =>
        ts.isClassDeclaration(node) && node.name?.text === className);
    const results = new Map<string, Set<string>>();
    if (!declaration) return results;
    const getters = new Set(declaration.members.filter(ts.isGetAccessorDeclaration)
        .filter(member => ts.isIdentifier(member.name)).map(member => (member.name as ts.Identifier).text));
    const promiseGlobal = !declares(source, 'Promise');
    const booleanGlobal = !declares(source, 'Boolean');
    for (const member of declaration.members) {
        if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name) || !member.body) continue;
        const elements = new Map<string, string>();
        const values = new Map<string, BooleanValue>();
        const element = (input: ts.Expression): string | undefined => {
            const node = unwrap(input);
            if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword
                && getters.has(node.name.text)) return node.name.text;
            return ts.isIdentifier(node) ? elements.get(node.text) : undefined;
        };
        const combine = (items: readonly ts.Expression[], promises = false): Set<string> | undefined => {
            if (!items.length) return undefined;
            const origins = new Set<string>();
            for (const item of items) {
                const value = read(item);
                if (!value || (value.kind !== 'boolean' && !(promises && value.kind === 'promise'))) return undefined;
                value.getters.forEach(getter => origins.add(getter));
            }
            return origins;
        };
        const read = (input: ts.Expression): BooleanValue | undefined => {
            while (ts.isParenthesizedExpression(input) || ts.isAsExpression(input)
                || ts.isNonNullExpression(input)) input = input.expression;
            if (ts.isAwaitExpression(input)) {
                const value = read(input.expression);
                return value && { ...value, kind: value.kind === 'promise' ? 'boolean'
                    : value.kind === 'array-promise' ? 'array' : value.kind };
            }
            const node = unwrap(input);
            if (ts.isIdentifier(node)) return values.get(node.text);
            if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
                const origins = combine([node.left, node.right]);
                return origins && { kind: 'boolean', getters: origins };
            }
            if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return undefined;
            const receiver = node.expression.expression;
            const method = node.expression.name.text;
            if (['isDisplayed', 'isExisting'].includes(method) && node.arguments.length === 0) {
                const getter = element(receiver);
                return getter ? { kind: 'promise', getters: new Set([getter]) } : undefined;
            }
            if (promiseGlobal && ts.isIdentifier(receiver) && receiver.text === 'Promise' && method === 'all'
                && node.arguments.length === 1 && ts.isArrayLiteralExpression(node.arguments[0])) {
                const origins = combine(node.arguments[0].elements, true);
                return origins && { kind: 'array-promise', getters: origins };
            }
            if (booleanGlobal && method === 'every' && node.arguments.length === 1
                && ts.isIdentifier(node.arguments[0]) && node.arguments[0].text === 'Boolean') {
                const array = read(receiver);
                return array?.kind === 'array' ? { kind: 'boolean', getters: array.getters } : undefined;
            }
            return undefined;
        };
        for (const statement of member.body.statements) {
            if (ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.Const)) {
                for (const variable of statement.declarationList.declarations) {
                    if (!ts.isIdentifier(variable.name) || !variable.initializer) continue;
                    const origin = element(variable.initializer);
                    const value = read(variable.initializer);
                    if (origin) elements.set(variable.name.text, origin);
                    else if (value) values.set(variable.name.text, value);
                    else {
                        invalidateMentioned(variable.initializer, elements);
                        invalidateMentioned(variable.initializer, values);
                    }
                }
            } else if (ts.isReturnStatement(statement)) {
                const value = statement.expression && read(statement.expression);
                if (value && (value.kind === 'boolean' || value.kind === 'promise')) results.set(member.name.text, value.getters);
                break;
            } else if (ts.isExpressionStatement(statement)) {
                invalidateMentioned(statement, elements);
                invalidateMentioned(statement, values);
            } else break; // Branches, mutable locals, loops and nested declarations need another analysis.
        }
    }
    return results;
}

interface AssertedStep {
    expression: string;
    methods: Set<string>;
}

/** Solo la definition correspondiente y el import exacto pueden consumir el retorno. */
export function stepBooleanAssertions(
    content: string,
    screenPath: string,
    resolveModule: (specifier: string) => string,
): (method: string, gherkinStep: string) => boolean {
    const source = ts.createSourceFile('steps.ts', content, ts.ScriptTarget.Latest, true);
    const screens = new Set<string>();
    const expects = new Set<string>();
    const definitions = new Set<string>();
    for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)
            || !statement.importClause || statement.importClause.isTypeOnly) continue;
        const module = statement.moduleSpecifier.text;
        if (resolveModule(module) === screenPath.replace(/\.(?:ts|js|mjs|cjs)$/, '') && statement.importClause.name) {
            screens.add(statement.importClause.name.text);
        }
        const bindings = statement.importClause.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) continue;
        for (const item of bindings.elements) {
            if (item.isTypeOnly) continue;
            const imported = item.propertyName?.text || item.name.text;
            if (module === '@wdio/globals' && ['expect', 'expectWebdriverIO'].includes(imported)) expects.add(item.name.text);
            if (module === '@wdio/cucumber-framework' && ['Given', 'When', 'Then', 'And', 'But'].includes(imported)) definitions.add(item.name.text);
        }
    }
    const asserted: AssertedStep[] = [];
    for (const statement of source.statements) {
        if (!ts.isExpressionStatement(statement)) continue;
        const call = unwrap(statement.expression);
        if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || !definitions.has(call.expression.text)) continue;
        const expression = call.arguments[0];
        const callback = call.arguments[call.arguments.length - 1];
        if (!expression || !(ts.isStringLiteralLike(expression) || ts.isRegularExpressionLiteral(expression))
            || !callback || !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) || !ts.isBlock(callback.body)) continue;
        const activeScreens = new Set([...screens].filter(name => !declares(callback, name)));
        const activeExpects = new Set([...expects].filter(name => !declares(callback, name)));
        const values = new Map<string, string>();
        const methods = new Set<string>();
        const methodCall = (input: ts.Expression): string | undefined => {
            // An unawaited Promise asserted as truthy is not evidence of visibility.
            while (ts.isParenthesizedExpression(input) || ts.isAsExpression(input)) input = input.expression;
            if (!ts.isAwaitExpression(input)) return undefined;
            const node = unwrap(input);
            return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
                && ts.isIdentifier(node.expression.expression) && activeScreens.has(node.expression.expression.text)
                ? node.expression.name.text : undefined;
        };
        const actualMethod = (input: ts.Expression): string | undefined => {
            const node = unwrap(input);
            return ts.isIdentifier(node) ? values.get(node.text) : methodCall(input);
        };
        for (const line of callback.body.statements) {
            if (ts.isVariableStatement(line) && (line.declarationList.flags & ts.NodeFlags.Const)) {
                for (const variable of line.declarationList.declarations) {
                    if (!ts.isIdentifier(variable.name) || !variable.initializer) continue;
                    const method = actualMethod(variable.initializer);
                    if (method) values.set(variable.name.text, method);
                    else invalidateMentioned(variable.initializer, values);
                }
                continue;
            }
            if (!ts.isExpressionStatement(line)) break;
            const assertion = unwrap(line.expression);
            if (ts.isCallExpression(assertion) && ts.isPropertyAccessExpression(assertion.expression)) {
                const matcher = assertion.expression.name.text;
                const positive = (matcher === 'toBeTruthy' && assertion.arguments.length === 0)
                    || (['toBe', 'toEqual', 'toStrictEqual'].includes(matcher)
                        && assertion.arguments.length === 1 && assertion.arguments[0].kind === ts.SyntaxKind.TrueKeyword);
                const expect = assertion.expression.expression;
                if (positive && ts.isCallExpression(expect) && ts.isIdentifier(expect.expression)
                    && activeExpects.has(expect.expression.text) && expect.arguments.length === 1) {
                    const method = actualMethod(expect.arguments[0]);
                    if (method) methods.add(method);
                    continue;
                }
            }
            invalidateMentioned(line, values);
        }
        asserted.push({ expression: ts.isStringLiteralLike(expression) ? expression.text : expression.getText(source), methods });
    }
    return (method, gherkinStep) => {
        const matches = matchingStepDefinitions(gherkinStep, asserted);
        return matches.length === 1 && matches[0].methods.has(method);
    };
}
