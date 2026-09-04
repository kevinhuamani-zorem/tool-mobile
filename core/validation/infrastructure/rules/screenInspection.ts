/**
 * Lecturas del Screen Object y de los Steps mediante el AST de TypeScript:
 * que TypeLocator referencia cada getter, que getters consume cada metodo, la
 * aridad declarada y las claves que quedarian vacias en la plataforma grabada.
 *
 * Son consultas puras sobre el codigo propuesto; las reglas que las usan viven
 * en `locatorContractRules`, `syntaxRules` y `codeStructureRules`.
 */
import ts from 'typescript';
import { FrameworkContract } from '../../../workspace';

function propertyChain(expression: ts.Expression): { root: string; properties: string[] } | undefined {
    if (ts.isIdentifier(expression)) return { root: expression.text, properties: [] };
    if (ts.isPropertyAccessExpression(expression)) {
        const parent = propertyChain(expression.expression);
        return parent
            ? { root: parent.root, properties: [...parent.properties, expression.name.text] }
            : undefined;
    }
    if (ts.isElementAccessExpression(expression) && expression.argumentExpression) {
        const parent = propertyChain(expression.expression);
        const argument = expression.argumentExpression;
        if (!parent || !ts.isStringLiteralLike(argument)) return undefined;
        return { root: parent.root, properties: [...parent.properties, argument.text] };
    }
    return undefined;
}

function bindingNames(name: ts.BindingName): string[] {
    if (ts.isIdentifier(name)) return [name.text];
    return name.elements.flatMap(element =>
        ts.isOmittedExpression(element) ? [] : bindingNames(element.name)
    );
}

export function screenLocatorTypes(
    content: string,
    contract: Pick<FrameworkContract,
        'locatorFactoryImport' | 'locatorFactorySymbol' |
        'typeLocatorImport' | 'typeLocatorSymbol' | 'locatorSignature'>,
    expectedClassName: string,
): Map<string, Set<string>> {
    const source = ts.createSourceFile('screen.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const locatorFilesByIdentifier = new Map<string, string>();
    const locatorFactoryIdentifiers = new Set<string>();
    const typeLocatorIdentifiers = new Set<string>();
    source.statements.forEach(statement => {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return;
        if (statement.importClause?.isTypeOnly) return;
        const specifier = statement.moduleSpecifier.text;
        const defaultIdentifier = statement.importClause?.name?.text;
        if (specifier.startsWith('@locators/') && specifier.endsWith('.locator.json') && defaultIdentifier) {
            locatorFilesByIdentifier.set(
                defaultIdentifier,
                specifier.replace(/^@locators\//, 'resources/locators/'),
            );
        }
        if (specifier === contract.locatorFactoryImport && defaultIdentifier) {
            locatorFactoryIdentifiers.add(defaultIdentifier);
        }
        const bindings = statement.importClause?.namedBindings;
        if (
            specifier === contract.typeLocatorImport
            && bindings
            && ts.isNamedImports(bindings)
        ) {
            bindings.elements.forEach(element => {
                if (
                    !element.isTypeOnly
                    && (element.propertyName?.text || element.name.text) === contract.typeLocatorSymbol
                ) {
                    typeLocatorIdentifiers.add(element.name.text);
                }
            });
        }
    });
    const trustedBindings = new Set([
        ...locatorFilesByIdentifier.keys(),
        ...locatorFactoryIdentifiers,
        ...typeLocatorIdentifiers,
    ]);
    const types = new Map<string, Set<string>>();
    const addReturnedCall = (
        getterName: string,
        body: ts.Block,
        expression: ts.Expression,
    ): void => {
        let shadowed = false;
        const findShadowing = (node: ts.Node): void => {
            if (
                ts.isVariableDeclaration(node)
                || ts.isFunctionDeclaration(node)
                || ts.isClassDeclaration(node)
            ) {
                if (node.name && bindingNames(node.name).some(name => trustedBindings.has(name))) {
                    shadowed = true;
                    return;
                }
            }
            if (ts.isParameter(node) && bindingNames(node.name).some(name => trustedBindings.has(name))) {
                shadowed = true;
                return;
            }
            ts.forEachChild(node, findShadowing);
        };
        findShadowing(body);
        if (shadowed) return;
        while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
        let returnedIdentifier: string | undefined;
        if (ts.isIdentifier(expression)) {
            returnedIdentifier = expression.text;
        } else if (
            ts.isCallExpression(expression)
            && ts.isIdentifier(expression.expression)
            && expression.expression.text === '$'
            && expression.arguments.length === 1
            && ts.isIdentifier(expression.arguments[0])
        ) {
            returnedIdentifier = expression.arguments[0].text;
        }
        if (returnedIdentifier) {
            const declarations = body.statements.flatMap(statement =>
                ts.isVariableStatement(statement)
                && (statement.declarationList.flags & ts.NodeFlags.Const) !== 0
                    ? [...statement.declarationList.declarations]
                    : []
            ).filter(declaration =>
                ts.isIdentifier(declaration.name)
                && declaration.name.text === returnedIdentifier
                && Boolean(declaration.initializer)
            );
            if (declarations.length !== 1 || !declarations[0].initializer) return;
            expression = declarations[0].initializer;
            while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
        }
        if (
            !ts.isCallExpression(expression)
            || !ts.isPropertyAccessExpression(expression.expression)
            || expression.expression.name.text !== 'getElement'
        ) return;
        const receiver = propertyChain(expression.expression.expression);
        if (
            !receiver
            || receiver.properties.length !== 0
            || !locatorFactoryIdentifiers.has(receiver.root)
        ) return;
        contract.locatorSignature.platformOrder.forEach((platform, index) => {
            const typeChain = expression.arguments[index * 2]
                ? propertyChain(expression.arguments[index * 2])
                : undefined;
            const reference = expression.arguments[index * 2 + 1]
                ? propertyChain(expression.arguments[index * 2 + 1])
                : undefined;
            if (
                !typeChain
                || !typeLocatorIdentifiers.has(typeChain.root)
                || typeChain.properties.length !== 1
                || !reference
                || !locatorFilesByIdentifier.has(reference.root)
                || reference.properties.length < 2
            ) return;
            const blockName = reference.properties[reference.properties.length - 2];
            const name = reference.properties[reference.properties.length - 1];
            const file = locatorFilesByIdentifier.get(reference.root)!;
            const key =
                `${getterName}\u0000${platform}\u0000${file}\u0000${blockName}\u0000${name}`;
            const referencedTypes = types.get(key) || new Set<string>();
            referencedTypes.add(typeChain.properties[0]);
            types.set(key, referencedTypes);
        });
    };
    const screenClass = source.statements.find(
        (statement): statement is ts.ClassDeclaration =>
            ts.isClassDeclaration(statement) && statement.name?.text === expectedClassName
    );
    screenClass?.members.forEach(member => {
        if (!ts.isGetAccessorDeclaration(member) || !member.name || !member.body) return;
        const getterName = ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name)
            ? member.name.text
            : undefined;
        const returned = member.body.statements.filter(
            (statement): statement is ts.ReturnStatement =>
                ts.isReturnStatement(statement) && Boolean(statement.expression)
        );
        if (getterName && returned.length === 1 && returned[0].expression) {
            addReturnedCall(getterName, member.body, returned[0].expression);
        }
    });
    return types;
}

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

export function plannedAlias(file: string, root: string, alias: string): string | undefined {
    const normalized = file.replace(/\\/g, '/').replace(/^\.\//, '');
    const prefix = `${root.replace(/^\/+|\/+$/g, '')}/`;
    return normalized.startsWith(prefix) ? `${alias}/${normalized.slice(prefix.length)}` : undefined;
}

/**
 * Claves que el Screen Object referencia y que quedarian vacias en la
 * plataforma de la grabacion.
 *
 * Es el cierre del contrato de cobertura: un getter contra "" compila, pasa el
 * review y falla al ejecutar. Se evalua el archivo COMO QUEDARA, aplicando las
 * completions declaradas, para no marcar como roto lo que el propio paquete va
 * a rellenar.
 */
export function emptyOnRecordedPlatform(
    screenContent: string,
    platform: 'android' | 'ios',
    documentFor: (identifier: string) => Record<string, any> | undefined,
    completed: Set<string>
): string[] {
    const problems: string[] = [];
    const seen = new Set<string>();
    // `LocatorHome.homeAndroid.shortcutTapp` y `Locators["blockIos"].name`.
    const references = [
        ...screenContent.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)/g),
        ...screenContent.matchAll(/\b([A-Za-z_$][\w$]*)\s*\[\s*['"]([^'"]+)['"]\s*\]\s*\.\s*([A-Za-z_$][\w$]*)/g),
    ];
    for (const [, identifier, block, key] of references) {
        if (!block.toLowerCase().endsWith(platform)) continue;
        const unique = `${identifier}.${block}.${key}`;
        if (seen.has(unique)) continue;
        seen.add(unique);
        const document = documentFor(identifier);
        if (!document) continue;
        const target = document[block];
        if (!target || typeof target !== 'object') continue;
        if (!Object.prototype.hasOwnProperty.call(target, key)) continue;
        if (String(target[key] || '').trim()) continue;
        if (completed.has(unique)) continue;
        problems.push(unique);
    }
    return problems;
}

export function importsFrom(content: string, source: string): boolean {
    return [...content.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)]
        .some(match => match[1] === source);
}

export function screenMethodArities(content: string): Map<string, { required: number; maximum: number }> {
    const source = ts.createSourceFile('screen.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const result = new Map<string, { required: number; maximum: number }>();
    const visit = (node: ts.Node): void => {
        if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
            const required = node.parameters.filter(parameter =>
                !parameter.questionToken && !parameter.initializer && !parameter.dotDotDotToken
            ).length;
            result.set(node.name.text, {
                required,
                maximum: node.parameters.some(parameter => parameter.dotDotDotToken)
                    ? Number.POSITIVE_INFINITY
                    : node.parameters.length,
            });
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return result;
}

export function stepScreenMethodCalls(content: string): Array<{ method: string; arguments: number }> {
    const source = ts.createSourceFile('steps.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const calls: Array<{ method: string; arguments: number }> = [];
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            calls.push({ method: node.expression.name.text, arguments: node.arguments.length });
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return calls;
}
