/**
 * Qué getters y literales consume cada método del Screen Object propuesto,
 * y si alguno construye un selector a mano en vez de usar los locators.
 */
import ts from 'typescript';

export function screenMethodGetterUsage(
    content: string,
    expectedClassName: string,
): Map<string, { getters: Set<string>; literals: Set<string>; hardcodedSelector: boolean }> {
    const source = ts.createSourceFile('screen.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const screenClass = source.statements.find(
        (statement): statement is ts.ClassDeclaration =>
            ts.isClassDeclaration(statement) && statement.name?.text === expectedClassName
    );
    if (!screenClass) return new Map();
    const knownGetters = new Set(screenClass.members.flatMap(member =>
        ts.isGetAccessorDeclaration(member)
        && (ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name))
            ? [member.name.text]
            : []
    ));
    const result = new Map<string, {
        getters: Set<string>;
        literals: Set<string>;
        hardcodedSelector: boolean;
    }>();
    const directGetter = (expression: ts.Expression): string | undefined => {
        while (ts.isParenthesizedExpression(expression) || ts.isAwaitExpression(expression)) {
            expression = expression.expression;
        }
        if (
            ts.isPropertyAccessExpression(expression)
            && expression.expression.kind === ts.SyntaxKind.ThisKeyword
            && knownGetters.has(expression.name.text)
        ) return expression.name.text;
        if (
            ts.isElementAccessExpression(expression)
            && expression.expression.kind === ts.SyntaxKind.ThisKeyword
            && expression.argumentExpression
            && ts.isStringLiteralLike(expression.argumentExpression)
            && knownGetters.has(expression.argumentExpression.text)
        ) return expression.argumentExpression.text;
        return undefined;
    };
    const selectorLiteral = /^(?:~|id=|android=|iosPredicate=|iosClassChain=|class=|\/|new\s+UiSelector\b|-ios\s)/;
    screenClass.members.forEach(member => {
        if (
            !ts.isMethodDeclaration(member)
            || !member.body
            || !(ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name))
        ) return;
        const elementAliases = new Map<string, string>();
        const derivedValues = new Map<string, string>();
        const usage = {
            getters: new Set<string>(),
            literals: new Set<string>(),
            hardcodedSelector: false,
        };
        const inspectLiteral = (candidate: ts.Node): void => {
            if (ts.isStringLiteralLike(candidate)) {
                const literal = candidate.text.trim();
                usage.literals.add(literal);
                if (selectorLiteral.test(literal)) usage.hardcodedSelector = true;
            }
            ts.forEachChild(candidate, inspectLiteral);
        };
        inspectLiteral(member.body);
        const unwrap = (expression: ts.Expression): ts.Expression => {
            while (
                ts.isParenthesizedExpression(expression)
                || ts.isAwaitExpression(expression)
                || ts.isAsExpression(expression)
                || ts.isNonNullExpression(expression)
            ) expression = expression.expression;
            return expression;
        };
        const singleton = (value?: string): Set<string> =>
            value ? new Set([value]) : new Set<string>();
        const elementOrigins = (expression: ts.Expression): Set<string> => {
            expression = unwrap(expression);
            const getter = directGetter(expression);
            if (getter) return singleton(getter);
            if (ts.isIdentifier(expression)) return singleton(elementAliases.get(expression.text));
            if (ts.isConditionalExpression(expression)) {
                const origins = elementOrigins(expression.whenTrue);
                elementOrigins(expression.whenFalse).forEach(origin => origins.add(origin));
                return origins;
            }
            return new Set();
        };
        const valueReadMethods = new Set([
            'getText',
            'getAttribute',
            'getValue',
            'isDisplayed',
            'isEnabled',
            'isExisting',
            'isSelected',
            'getCSSProperty',
            'getLocation',
            'getSize',
        ]);
        const readOrigins = (expression: ts.Expression): Set<string> => {
            expression = unwrap(expression);
            // La familia textAssertionRules comprueba además el cuerpo exacto del lector.
            if (ts.isCallExpression(expression)
                && ts.isPropertyAccessExpression(expression.expression)
                && expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword
                && expression.expression.name.text === 'readRecordedText'
                && expression.arguments[0]) return elementOrigins(expression.arguments[0]);
            if (
                ts.isCallExpression(expression)
                && ts.isPropertyAccessExpression(expression.expression)
                && valueReadMethods.has(expression.expression.name.text)
            ) return elementOrigins(expression.expression.expression);
            if (
                ts.isCallExpression(expression)
                && ts.isPropertyAccessExpression(expression.expression)
                && ['getElementText', 'isElementPresent', 'waitForElements'].includes(
                    expression.expression.name.text
                )
                && ts.isPropertyAccessExpression(expression.expression.expression)
                && expression.expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword
                && expression.expression.expression.name.text === 'uiHelper'
                && expression.arguments[0]
            ) return elementOrigins(expression.arguments[0]);
            if (ts.isIdentifier(expression)) return singleton(derivedValues.get(expression.text));
            if (ts.isConditionalExpression(expression)) {
                const origins = readOrigins(expression.whenTrue);
                readOrigins(expression.whenFalse).forEach(origin => origins.add(origin));
                return origins;
            }
            return new Set();
        };
        member.body.statements.forEach(statement => {
            if (
                !ts.isVariableStatement(statement)
                || (statement.declarationList.flags & ts.NodeFlags.Const) === 0
            ) return;
            statement.declarationList.declarations.forEach(declaration => {
                if (!ts.isIdentifier(declaration.name) || !declaration.initializer) return;
                const elementSource = elementOrigins(declaration.initializer);
                if (elementSource.size === 1) {
                    elementAliases.set(declaration.name.text, [...elementSource][0]);
                    return;
                }
                const valueSource = readOrigins(declaration.initializer);
                if (valueSource.size === 1) derivedValues.set(declaration.name.text, [...valueSource][0]);
            });
        });
        const uiHelperMethods = new Map<string, number[]>([
            ['waitForDisplayed', [0]],
            ['waitForElement', [0]],
            ['waitForElementExist', [0]],
            ['waitForElementExistByLocator', [0]],
            ['waitForElementToBeReady', [0]],
            ['waitForElementToBeEnabled', [0]],
            ['waitForElementDisplayedAndExpect', [0]],
            ['interactWithElement', [0]],
            ['waitForDisplayedAndClick', [0]],
            ['checkErrorMessageAndClickIfMatched', [0, 2]],
            ['fillSequentialOtp', [0]],
            ['validateTextPair', [0, 1]],
        ]);
        const keyboardHelperMethods = new Map<string, number[]>([
            ['submitOtp', [0, 2]],
        ]);
        const elementInteractionMethods = new Set([
            'click',
            'doubleClick',
            'setValue',
            'addValue',
            'clearValue',
            'waitForDisplayed',
            'waitForExist',
            'waitForClickable',
            'scrollIntoView',
            'moveTo',
            'touchAction',
            'dragAndDrop',
            'selectByAttribute',
            'selectByIndex',
            'selectByVisibleText',
        ]);
        const assertionMethods = new Set([
            'toBe',
            'toEqual',
            'toContain',
            'toMatch',
            'toBeTruthy',
            'toBeFalsy',
            'toExist',
            'toBeDisplayed',
            'toBeEnabled',
            'toBeClickable',
            'toHaveText',
            'toHaveTextContaining',
            'toHaveValue',
            'toHaveAttribute',
        ]);
        const assertionSubject = (call: ts.CallExpression): ts.CallExpression | undefined => {
            if (
                !ts.isPropertyAccessExpression(call.expression)
                || !assertionMethods.has(call.expression.name.text)
            ) return undefined;
            let expression: ts.Expression = call.expression.expression;
            while (ts.isPropertyAccessExpression(expression)) expression = expression.expression;
            if (
                !ts.isCallExpression(expression)
                || !ts.isIdentifier(expression.expression)
                || !['expect', 'expectWebdriverIO'].includes(expression.expression.text)
            ) return undefined;
            return expression;
        };
        const helperOrigins = (
            call: ts.CallExpression,
            helper: string,
            methods: Map<string, number[]>,
        ): Set<string> => {
            if (
                !ts.isPropertyAccessExpression(call.expression)
                || !ts.isPropertyAccessExpression(call.expression.expression)
                || call.expression.expression.expression.kind !== ts.SyntaxKind.ThisKeyword
                || call.expression.expression.name.text !== helper
            ) return new Set();
            const relevantArguments = methods.get(call.expression.name.text);
            if (!relevantArguments) return new Set();
            const origins = new Set<string>();
            relevantArguments.forEach(index => {
                const argument = call.arguments[index];
                if (argument) elementOrigins(argument).forEach(origin => origins.add(origin));
            });
            return origins;
        };
        const sinkOrigins = (call: ts.CallExpression): Set<string> => {
            const assertion = assertionSubject(call);
            if (assertion) {
                const origins = new Set<string>();
                for (const argument of assertion.arguments) {
                    elementOrigins(argument).forEach(origin => origins.add(origin));
                    readOrigins(argument).forEach(origin => origins.add(origin));
                }
                return origins;
            }
            for (const [helper, methods] of [
                ['uiHelper', uiHelperMethods],
                ['keyboardHelper', keyboardHelperMethods],
            ] as const) {
                const origins = helperOrigins(call, helper, methods);
                if (origins.size) return origins;
            }
            if (
                ts.isPropertyAccessExpression(call.expression)
                && elementInteractionMethods.has(call.expression.name.text)
            ) return elementOrigins(call.expression.expression);
            return new Set();
        };
        const visit = (node: ts.Node): void => {
            if (
                node !== member.body
                && (
                    ts.isFunctionDeclaration(node)
                    || ts.isFunctionExpression(node)
                    || ts.isArrowFunction(node)
                    || ts.isMethodDeclaration(node)
                    || ts.isGetAccessorDeclaration(node)
                    || ts.isSetAccessorDeclaration(node)
                    || ts.isClassDeclaration(node)
                    || ts.isClassExpression(node)
                )
            ) return;
            if (ts.isCallExpression(node)) {
                sinkOrigins(node).forEach(getter => usage.getters.add(getter));
            }
            ts.forEachChild(node, visit);
        };
        visit(member.body);
        result.set(member.name.text, usage);
    });
    return result;
}
