import path from 'path';
import fs from 'fs';
import ts from 'typescript';
import {
    AUTOMATION_AGENT_RESPONSE_SCHEMA_VERSION,
    AutomationAgentResponse,
    AutomationScenario,
    AutomationValidation,
    FRAMEWORK_CONTEXT_QUERIES,
    GenerationPlan,
    recordedStepContext,
    featureStepLines,
    missingExamples,
    rewrittenReusedSteps,
    locatorImportIdentifier,
    screenObjectNames,
    screenObjectProblems,
    typeLocatorImportProblem,
    candidateAllowlist,
} from '../../automation/contracts';
import { validateTypeScriptSyntax } from './typescriptSyntaxValidator';
import { GeneratedPreview } from '../../generation';
import { OutputValidator } from './outputValidator';
import { projectPaths, frameworkHelpersOf, frameworkContract, FrameworkContract } from '../../workspace';
import { ReuseAnalyzer } from '../../indexing';
import { selectorNormalization, utf8TextProblems, declaredIdentifiers, spanishTokens } from '../../shared';

function responseLocatorValues(content: string): Array<{ blockName: string; name: string; selector: string }> {
    try {
        const document = JSON.parse(content) as Record<string, unknown>;
        return Object.entries(document).flatMap(([blockName, block]) =>
            blockName !== '_metadata' &&
            block && typeof block === 'object' && !Array.isArray(block)
                ? Object.entries(block as Record<string, unknown>)
                    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1].trim()))
                    .map(([name, selector]) => ({ blockName, name, selector }))
                : []
        );
    } catch {
        return [];
    }
}

function changedLocatorValues(
    content: string,
    baseline?: string,
): Array<{ blockName: string; name: string; selector: string }> {
    const current = responseLocatorValues(content);
    if (!baseline) return current;
    const inherited = new Map(responseLocatorValues(baseline)
        .map(entry => [`${entry.blockName}\u0000${entry.name}`, entry.selector]));
    return current.filter(entry =>
        inherited.get(`${entry.blockName}\u0000${entry.name}`) !== entry.selector
    );
}

function hasLocatorKeyForPlatform(content: string, name: string, platform: 'android' | 'ios'): boolean {
    try {
        const document = JSON.parse(content) as Record<string, unknown>;
        const suffix = platform.toLowerCase();
        return Object.entries(document).some(([blockName, block]) =>
            blockName !== '_metadata'
            && blockName.toLowerCase().endsWith(suffix)
            && block
            && typeof block === 'object'
            && !Array.isArray(block)
            && Object.prototype.hasOwnProperty.call(block as Record<string, unknown>, name)
        );
    } catch {
        return false;
    }
}

function groupRepairErrors(
    errors: Array<{ code: string; message: string; file?: string }>,
): NonNullable<AutomationValidation['repairContext']>['groups'] {
    const groups = new Map<string, {
        code: string;
        file?: string;
        count: number;
        messages: string[];
    }>();
    for (const error of errors) {
        const key = `${error.code}\u0000${error.file || ''}`;
        const group = groups.get(key) || {
            code: error.code,
            ...(error.file ? { file: error.file } : {}),
            count: 0,
            messages: [],
        };
        group.count += 1;
        if (!group.messages.includes(error.message) && group.messages.length < 3) {
            group.messages.push(error.message);
        }
        groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) =>
        right.count - left.count || left.code.localeCompare(right.code)
    );
}

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

function screenLocatorTypes(
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

function screenMethodGetterUsage(
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

function unexpectedFields(value: object, allowed: string[]): string[] {
    const accepted = new Set(allowed);
    return Object.keys(value).filter(key => !accepted.has(key));
}

function completionTarget(
    plan: GenerationPlan,
    completion: { file: string; name: string; platform: 'android' | 'ios'; sequence: number },
) {
    const targets = plan.resolutions
        .find(resolution => resolution.sequence === completion.sequence)
        ?.completionTargets?.filter(target =>
            target.file === completion.file
            && target.name === completion.name
            && target.platform === completion.platform
            && target.block.toLowerCase().endsWith(completion.platform)
        ) || [];
    return targets.length === 1 ? targets[0] : undefined;
}

function hasNoLocatorEntries(content: string): boolean {
    try {
        const document = JSON.parse(content) as Record<string, unknown>;
        return Object.entries(document)
            .filter(([name]) => name !== '_metadata')
            .every(([, block]) =>
                Boolean(block) &&
                typeof block === 'object' &&
                !Array.isArray(block) &&
                Object.keys(block as Record<string, unknown>).length === 0
            );
    } catch {
        return false;
    }
}

function reusesEveryRecordedLocator(
    scenario: AutomationScenario,
    plan: GenerationPlan,
    response: AutomationAgentResponse
): boolean {
    if ((response.completions || []).length > 0) return false;
    const locatorSequences = scenario.actions
        .filter(action => Boolean(action.selector?.trim()))
        .map(action => action.sequence);
    if (locatorSequences.length === 0) return false;
    const resolutions = new Map(plan.resolutions.map(item => [item.sequence, item.resolution]));
    return locatorSequences.every(sequence => resolutions.get(sequence) === 'reuse');
}

function responseScenarioSteps(content: string): string[][] {
    const scenarios: string[][] = [];
    let current: string[] | undefined;
    for (const line of content.split(/\r?\n/)) {
        if (/^\s*Scenario(?: Outline)?:/i.test(line)) {
            current = [];
            scenarios.push(current);
            continue;
        }
        const match = line.match(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/i);
        if (current && match) current.push(selectorNormalization.normalizeStepText(match[1]));
    }
    return scenarios;
}

const IMPERATIVE_GHERKIN_PATTERNS = [
    /\b(?:hace|hacer|da|dar)\s+(?:clic|click)\b/,
    /\b(?:presiona|presionar|pulsa|pulsar|toca|tocar)\s+(?:el\s+)?(?:boton|elemento|campo)\b/,
    /\b(?:scroll|swipe|desplaza|desplazar|arrastra|arrastrar)\b/,
    /\b(?:espera|esperar)\s+\d+\s*(?:segundo|segundos)\b/,
    /\b(?:escribe|escribir|ingresa|ingresar)\s+(?:en\s+)?(?:el\s+)?campo\b/,
];

const GENERIC_TEMPLATE_GHERKIN_PATTERNS = [
    /^el usuario completa\b/,
    /^se obtiene el resultado esperado de\b/,
];

const TECHNICAL_ACTIONS = new Set([
    'SCROLL_DOWN', 'SCROLL_UP', 'SWIPE', 'ESPERAR', 'SCREENSHOT',
]);

function imperativeGherkinSteps(content: string): string[] {
    return content.split(/\r?\n/).flatMap(line => {
        const match = line.match(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/i);
        if (!match) return [];
        const normalized = selectorNormalization.normalizeStepText(match[1]);
        return IMPERATIVE_GHERKIN_PATTERNS.some(pattern => pattern.test(normalized))
            ? [match[1].trim()]
            : [];
    });
}

function genericTemplateGherkinSteps(content: string): string[] {
    return content.split(/\r?\n/).flatMap(line => {
        const match = line.match(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/i);
        if (!match) return [];
        const normalized = selectorNormalization.normalizeStepText(match[1]);
        return GENERIC_TEMPLATE_GHERKIN_PATTERNS.some(pattern => pattern.test(normalized))
            ? [match[1].trim()]
            : [];
    });
}

function hasPlatformTag(content: string, platform: 'android' | 'ios'): boolean {
    return new RegExp(`^\\s*@[^\\n]*@${platform}(?:\\s|$)`, 'mi').test(content);
}

function completeLocatorPlatforms(content: string): Array<'android' | 'ios'> {
    try {
        const document = JSON.parse(content) as Record<string, unknown>;
        return (['android', 'ios'] as const).filter(platform => {
            const blocks = Object.entries(document)
                .filter(([name, value]) =>
                    name.toLowerCase().endsWith(platform) &&
                    value && typeof value === 'object' && !Array.isArray(value)
                )
                .map(([, value]) => Object.values(value as Record<string, unknown>));
            const values = blocks.flat();
            return values.length > 0 && values.every(value =>
                typeof value === 'string' && Boolean(value.trim())
            );
        });
    } catch {
        return [];
    }
}

function plannedAlias(file: string, root: string, alias: string): string | undefined {
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

function importsFrom(content: string, source: string): boolean {
    return [...content.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)]
        .some(match => match[1] === source);
}

function screenMethodArities(content: string): Map<string, { required: number; maximum: number }> {
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

function stepScreenMethodCalls(content: string): Array<{ method: string; arguments: number }> {
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

export class AutomationResponseValidator {
    private readonly relaxedContract = process.env.RECORDER_AGENT_RELAXED_CONTRACT === '1';

    constructor(
        private readonly outputValidator = new OutputValidator(),
        private readonly reuseAnalyzer = new ReuseAnalyzer()
    ) {}

    toPreview(response: AutomationAgentResponse): GeneratedPreview {
        const byLayer = new Map(response.files.map(file => [file.layer, file]));
        const absolute = (relative: string) => path.join(projectPaths.frameworkRoot, relative);
        const feature = byLayer.get('feature')!;
        const steps = byLayer.get('steps');
        const screen = byLayer.get('screen');
        const locators = byLayer.get('locators');
        return {
            featurePath: absolute(feature.path),
            featureContent: feature.content,
            stepPath: steps ? absolute(steps.path) : undefined,
            stepContent: steps?.content,
            screenPath: screen ? absolute(screen.path) : undefined,
            screenContent: screen?.content,
            locatorPath: locators ? absolute(locators.path) : undefined,
            locatorContent: locators?.content,
            files: response.files.map(file => absolute(file.path)),
        };
    }

    validate(
        scenario: AutomationScenario,
        plan: GenerationPlan,
        response: AutomationAgentResponse,
        attempt = 0
    ): AutomationValidation {
        const errors: AutomationValidation['errors'] = [];
        const warnings: string[] = [];
        if ((response.schemaVersion ?? AUTOMATION_AGENT_RESPONSE_SCHEMA_VERSION) !== AUTOMATION_AGENT_RESPONSE_SCHEMA_VERSION) {
            errors.push({ code: 'schema', message: 'schemaVersion no soportado' });
        }
        if (response.recordingId !== scenario.recordingId) errors.push({ code: 'recording-id', message: 'recordingId no coincide' });
        if (response.planId !== plan.planId) errors.push({ code: 'plan-id', message: 'planId no coincide' });
        response.resolutions.forEach((resolution, index) => {
            // `reason` es la traza que lee el QA: se acepta y se publica en el
            // esquema. Lo que no se acepta es inventar campos.
            const extras = unexpectedFields(resolution, ['gapId', 'decision', 'reason', 'needs']);
            if (extras.length) {
                errors.push({
                    code: 'resolution-shape',
                    message: `resolutions[${index}] contiene campos no permitidos: ${extras.join(', ')}`,
                });
            }
            if (resolution.needs !== undefined) {
                if (!Array.isArray(resolution.needs) || !resolution.needs.length) {
                    errors.push({
                        code: 'resolution-needs-shape',
                        message: `resolutions[${index}].needs debe ser un arreglo no vacío cuando se declara.`,
                    });
                } else {
                    resolution.needs.forEach((need, needIndex) => {
                        const needExtras = unexpectedFields(need, ['query', 'args']);
                        if (needExtras.length) {
                            errors.push({
                                code: 'resolution-needs-shape',
                                message: `resolutions[${index}].needs[${needIndex}] contiene campos no permitidos: ${needExtras.join(', ')}`,
                            });
                            return;
                        }
                        if (!FRAMEWORK_CONTEXT_QUERIES.includes(need.query as any)) {
                            errors.push({
                                code: 'resolution-needs-query',
                                message: `resolutions[${index}].needs[${needIndex}].query no es soportada: ${String((need as any).query)}.`,
                            });
                        }
                        if (!need.args || typeof need.args !== 'object' || Array.isArray(need.args)) {
                            errors.push({
                                code: 'resolution-needs-args',
                                message: `resolutions[${index}].needs[${needIndex}].args debe ser un objeto.`,
                            });
                        }
                    });
                }
            }
        });
        response.actionTrace.forEach((trace, index) => {
            const extras = unexpectedFields(trace, ['sequence', 'gherkinStep', 'screenMethod', 'locatorName']);
            if (extras.length) {
                errors.push({
                    code: 'trace-shape',
                    message: `actionTrace[${index}] contiene campos no permitidos: ${extras.join(', ')}`,
                });
            }
        });
        response.files.forEach((file, index) => {
            const extras = unexpectedFields(file, ['layer', 'path', 'content']);
            if (extras.length) {
                errors.push({
                    code: 'file-shape',
                    message: `files[${index}] contiene campos no permitidos: ${extras.join(', ')}`,
                    file: file.path,
                });
            }
            for (const problem of utf8TextProblems(file.content)) {
                errors.push({
                    code: problem.code === 'non-nfc' ? 'unicode-normalization' : 'unicode-encoding',
                    message: `${problem.message} Conserva UTF-8 NFC sin BOM y los diacríticos del recording.`,
                    file: file.path,
                });
            }
        });
        for (const file of response.files.filter(candidate =>
            candidate.layer === 'steps' || candidate.layer === 'screen'
        )) {
            for (const diagnostic of validateTypeScriptSyntax(file.path, file.content)) {
                const diagnosticText = diagnostic.line === undefined
                    ? `${file.path}: ${diagnostic.message}`
                    : `${file.path}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`;
                errors.push({
                    code: 'typescript-syntax',
                    message: `Sintaxis TypeScript inválida: ${diagnosticText}`,
                    file: file.path,
                });
            }
        }
        const generatedSteps = response.files.find(file => file.layer === 'steps');
        const generatedScreen = response.files.find(file => file.layer === 'screen');
        if (generatedSteps && generatedScreen) {
            const arities = screenMethodArities(generatedScreen.content);
            for (const call of stepScreenMethodCalls(generatedSteps.content)) {
                const arity = arities.get(call.method);
                if (!arity || (call.arguments >= arity.required && call.arguments <= arity.maximum)) continue;
                const expected = arity.required === arity.maximum
                    ? `${arity.required}`
                    : `${arity.required}..${Number.isFinite(arity.maximum) ? arity.maximum : 'n'}`;
                errors.push({
                    code: 'typescript-syntax',
                    message:
                        `Steps invoca ${call.method} con ${call.arguments} argumento(s), ` +
                        `pero el Screen Object declara ${expected}.`,
                    file: generatedSteps.path,
                });
            }
        }

        // `completions`: adoptar una clave existente y rellenar su hueco.
        //
        // El agente solo dice QUE clave y de QUE accion sale el valor; el
        // selector lo copia el recorder de la grabacion. Asi un selector
        // inventado no puede entrar por esta via, que es justo el riesgo de
        // dejarle escribir en un archivo de otra feature.
        for (const completion of response.completions || []) {
            const extras = unexpectedFields(completion, ['file', 'name', 'platform', 'sequence']);
            if (extras.length) {
                errors.push({
                    code: 'completion-shape',
                    message: `Completion contiene campos no permitidos: ${extras.join(', ')}`,
                });
                continue;
            }
            const label = `${completion.file}#${completion.name} (${completion.platform})`;
            const authorizedTarget = completionTarget(plan, completion);
            if (!authorizedTarget) {
                errors.push({
                    code: 'completion-unauthorized',
                    message: `Completar ${label} no coincide con un target de reuse verificado para la acción.`,
                });
                continue;
            }
            const action = scenario.actions.find(step => step.sequence === completion.sequence);
            if (!action) {
                errors.push({
                    code: 'completion-sequence',
                    message: `Completar ${label} apunta a la accion ${completion.sequence}, que no existe en la grabacion.`,
                });
                continue;
            }
            if (!action.selector) {
                errors.push({
                    code: 'completion-sequence',
                    message: `Completar ${label} apunta a la accion ${completion.sequence}, que no capturo ningun elemento.`,
                });
                continue;
            }
            if (action.platform && action.platform !== completion.platform) {
                errors.push({
                    code: 'completion-platform',
                    message: `Completar ${label} toma el valor de una accion grabada en ${action.platform}: `
                        + 'una plataforma no se completa con el selector de la otra.',
                });
                continue;
            }
            const absolute = path.resolve(projectPaths.frameworkRoot, completion.file);
            let document: Record<string, any>;
            try {
                document = JSON.parse(fs.readFileSync(absolute, 'utf-8'));
            } catch {
                errors.push({
                    code: 'completion-file',
                    message: `Completar ${label} apunta a un archivo de locators que no se puede leer.`,
                });
                continue;
            }
            const block = authorizedTarget.block;
            if (
                !block
                || !document[block]
                || typeof document[block] !== 'object'
                || !Object.prototype.hasOwnProperty.call(document[block], completion.name)
            ) {
                errors.push({
                    code: 'completion-key',
                    message: `Completar ${label}: la clave no existe en el bloque de ${completion.platform}. `
                        + 'Ese modulo no declara el elemento para esa plataforma, asi que no se completa: '
                        + 'crea el locator en el modulo de este caso.',
                });
                continue;
            }
            if (String(document[block][completion.name] || '').trim()) {
                errors.push({
                    code: 'completion-occupied',
                    message: `Completar ${label}: la clave ya tiene valor en esa plataforma. `
                        + 'Completar solo llena un hueco vacio; un valor real nunca se pisa.',
                });
            }
        }

        const planned = new Map(plan.files.map(file => [file.layer, file.path]));
        const updateBaselines = new Map<string, string>();
        for (const file of plan.files.filter(item => item.operation === 'update')) {
            const absolute = path.join(projectPaths.frameworkRoot, file.path);
            if (fs.existsSync(absolute)) updateBaselines.set(file.layer, fs.readFileSync(absolute, 'utf-8'));
        }
        const proposedScreen = response.files.find(file => file.layer === 'screen')?.content || '';
        const baselineScreen = updateBaselines.get('screen');
        const baselineScreenNames = new Set(declaredIdentifiers({ screen: baselineScreen || '' })
            .map(symbol => symbol.name));
        const screenAddsSymbols = Boolean(baselineScreen) && declaredIdentifiers({ screen: proposedScreen })
            .some(symbol => !baselineScreenNames.has(symbol.name));
        // Un Screen `update` puede ser una referencia pura: el agente usa APIs
        // existentes y el patch writer no escribe nada. En ese caso no se
        // obliga al agente a modernizar deuda legacy del archivo compartido;
        // se valida la API indexada por el plan y las capas que sí se crean.
        const reusesScreenWithoutChanges = Boolean(baselineScreen) && !screenAddsSymbols;
        const receivedLayers = new Set(response.files.map(file => file.layer));
        for (const [layer, expectedPath] of planned) {
            const file = response.files.find(candidate => candidate.layer === layer);
            if (!file) errors.push({ code: 'missing-layer', message: `Falta capa ${layer}` });
            else if (file.path !== expectedPath) errors.push({ code: 'path', message: `Ruta no planificada para ${layer}`, file: file.path });
        }
        if (receivedLayers.size !== response.files.length) errors.push({ code: 'duplicate-layer', message: 'Hay capas duplicadas' });
        for (const file of response.files) {
            if (!planned.has(file.layer)) errors.push({ code: 'extra-layer', message: `Capa no solicitada: ${file.layer}`, file: file.path });
            if (!file.content.trim()) errors.push({ code: 'empty-file', message: 'Archivo vacío', file: file.path });
        }

        const resolutionByGap = new Map<string, { gapId: string; decision: string; reason?: string }>();
        for (const resolution of response.resolutions) {
            if (!resolutionByGap.has(resolution.gapId)) resolutionByGap.set(resolution.gapId, resolution);
        }
        for (const gapId of plan.unresolvedGapIds) {
            const resolution = resolutionByGap.get(gapId);
            if (!resolution) {
                errors.push({
                    code: 'missing-gap-resolution',
                    message: `Falta resolución para gap abierto: ${gapId}`,
                });
                continue;
            }
            if (!String(resolution.decision || '').trim()) {
                errors.push({
                    code: 'gap-resolution-decision',
                    message: `La resolución de ${gapId} no declara decisión.`,
                });
                continue;
            }
            const unresolvedDecision = /^(unresolved|failed|error|blocked|not-resolved)$/i
                .test(String(resolution.decision || '').trim());
            if (unresolvedDecision && !String(resolution.reason || '').trim()) {
                errors.push({
                    code: 'unresolved-gap-without-reason',
                    message: `El gap ${gapId} quedó no resuelto sin causa explícita.`,
                });
            }
        }
        const traced = new Set(response.actionTrace.map(item => item.sequence));
        for (const action of scenario.actions) {
            if (!traced.has(action.sequence)) errors.push({ code: 'trace', message: `Acción ${action.sequence} sin trazabilidad` });
        }

        // Con el enum mal importado, `TypeLocator.X` deja de reconocerse y todas
        // las comprobaciones de tipos disparan a la vez sin nombrar la causa. El
        // agente tiene un solo intento de reparacion: se le da el error real y
        // no cuatro consecuencias.
        const enumImportBroken = Boolean(typeLocatorImportProblem(
            response.files.find(file => file.layer === 'screen')?.content || '',
            {
                typeLocatorSymbol: frameworkContract(projectPaths.frameworkRoot).typeLocatorSymbol,
                typeLocatorImport: frameworkContract(projectPaths.frameworkRoot).typeLocatorImport,
            }
        ));

        const locatorFile = response.files.find(file => file.layer === 'locators');
        if (locatorFile && !enumImportBroken) {
            const locatorPlan = plan.files.find(file => file.layer === 'locators');
            let baseline: string | undefined;
            if (locatorPlan?.operation === 'update') {
                const absolute = path.join(projectPaths.frameworkRoot, locatorPlan.path);
                if (fs.existsSync(absolute)) baseline = fs.readFileSync(absolute, 'utf-8');
            }
            const actionBySequence = new Map(scenario.actions.map(action => [action.sequence, action]));
            const completionBySequence = new Map<number, NonNullable<AutomationAgentResponse['completions']>[number]>();
            for (const completion of response.completions || []) {
                if (!completionTarget(plan, completion)) continue;
                if (completionBySequence.has(completion.sequence)) {
                    errors.push({
                        code: 'completion-duplicate',
                        message: `La acción ${completion.sequence} declara más de un completion.`,
                    });
                    continue;
                }
                completionBySequence.set(completion.sequence, completion);
            }
            // El gap de duplicado invita a reutilizar un locator existente en vez
            // de crear el del plan. Adoptar uno de los que el gap OFRECIO esta
            // autorizado —cualquier otro nombre, no—; sin esto el validador
            // rechazaba al agente por obedecer al gap.
            const adoptedBySequence = new Map<number, string>();
            response.actionTrace.forEach(trace => {
                if (!trace.locatorName) return;
                const planned = plan.resolutions.find(item => item.sequence === trace.sequence);
                if (!planned || planned.locatorName === trace.locatorName) return;
                const offered = (planned.reuseCandidates || [])
                    .find(candidate => candidate.name === trace.locatorName);
                if (offered) adoptedBySequence.set(trace.sequence, offered.name);
            });

            const primaryByLocator = new Map<string, Set<string>>();
            const addPrimary = (name: string | undefined, sequence: number): void => {
                if (!name) return;
                const action = actionBySequence.get(sequence);
                if (!action) return;
                const resolution = plan.resolutions.find(item => item.sequence === sequence);
                // Adoptar un candidato existente deja de ser un `create`: el par
                // (TypeLocator, valor) es el del locator que ya vive en el
                // framework, no el que la grabacion habria escrito.
                if (adoptedBySequence.has(sequence)) return;
                if (resolution?.resolution !== 'create' || completionBySequence.has(sequence)) return;
                const allowed = primaryByLocator.get(name) || new Set<string>();
                candidateAllowlist(action, scenario.platform)
                    .filter(candidate => candidate.primary)
                    .forEach(candidate =>
                        allowed.add(`${candidate.locatorType}\u0000${candidate.locatorValue}`)
                    );
                primaryByLocator.set(name, allowed);
            };
            plan.resolutions.forEach(resolution => addPrimary(resolution.locatorName, resolution.sequence));
            const traceLocatorMismatches: Array<{
                sequence: number;
                expectedName: string;
                actualName: string;
                planned?: GenerationPlan['resolutions'][number];
            }> = [];
            response.actionTrace.forEach(trace => {
                const planned = plan.resolutions.find(resolution => resolution.sequence === trace.sequence);
                const expectedName = adoptedBySequence.get(trace.sequence)
                    || completionBySequence.get(trace.sequence)?.name
                    || planned?.locatorName;
                if (expectedName && trace.locatorName !== expectedName) {
                    traceLocatorMismatches.push({
                        sequence: trace.sequence,
                        expectedName,
                        actualName: trace.locatorName || '',
                        planned,
                    });
                    return;
                }
                addPrimary(trace.locatorName, trace.sequence);
            });
            const contract = frameworkContract(projectPaths.frameworkRoot);
            const screenFile = response.files.find(file => file.layer === 'screen');
            const screenContent = screenFile?.content || '';
            const referencedTypes = screenLocatorTypes(
                screenContent,
                contract,
                screenFile ? screenObjectNames(screenFile.path).className : '',
            );
            const methodUsage = screenMethodGetterUsage(
                screenContent,
                screenFile ? screenObjectNames(screenFile.path).className : '',
            );
            const currentLocators = responseLocatorValues(locatorFile.content);
            const locatorTypesFor = (
                getterName: string,
                blockName: string,
                locatorName: string
            ): Set<string> => {
                const key =
                    `${getterName}\u0000${scenario.platform}\u0000${locatorFile.path}\u0000` +
                    `${blockName}\u0000${locatorName}`;
                return referencedTypes.get(key) || new Set<string>();
            };
            const acceptedTraceAliases = new Set<string>();
            const expectedGetterByAlias = new Map<string, string>();
            for (const mismatch of traceLocatorMismatches) {
                const expectedPairs = primaryByLocator.get(mismatch.expectedName) || new Set<string>();
                const candidates = currentLocators.filter(entry =>
                    entry.name === mismatch.actualName
                    && entry.blockName.toLowerCase().endsWith(scenario.platform)
                );
                const semanticMatch = candidates.some(entry => {
                    const candidateTypes = new Set<string>([
                        ...locatorTypesFor(entry.name, entry.blockName, entry.name),
                        ...locatorTypesFor(mismatch.expectedName, entry.blockName, entry.name),
                    ]);
                    return candidateTypes.size === 1
                        && expectedPairs.has(`${[...candidateTypes][0]}\u0000${entry.selector.trim()}`);
                });
                if (semanticMatch) {
                    acceptedTraceAliases.add(mismatch.actualName);
                    expectedGetterByAlias.set(mismatch.actualName, mismatch.expectedName);
                    if (expectedPairs.size) primaryByLocator.set(mismatch.actualName, new Set(expectedPairs));
                    warnings.push(
                        `trace-locator relajado: la acción ${mismatch.sequence} traza ` +
                        `${mismatch.actualName} en vez de ${mismatch.expectedName}, ` +
                        'pero conserva el selector primary verificado.'
                    );
                    continue;
                }
                errors.push({
                    code: 'trace-locator',
                    message:
                        `La acción ${mismatch.sequence} traza ${mismatch.actualName}, pero el plan exige ` +
                        `${mismatch.expectedName}` +
                        ((mismatch.planned?.reuseCandidates || []).length
                            ? `. Solo puedes adoptar uno de los locators que ofrece su gap: ` +
                              `${mismatch.planned!.reuseCandidates!.map(candidate => candidate.name).join(', ')}.`
                            : '.'),
                    file: locatorFile.path,
                });
            }
            const tracedGettersByMethod = new Map<string, Set<string>>();
            response.actionTrace.forEach(trace => {
                if (!trace.screenMethod) return;
                const resolution = plan.resolutions.find(item => item.sequence === trace.sequence);
                const expectedName = adoptedBySequence.get(trace.sequence)
                    || completionBySequence.get(trace.sequence)?.name
                    || resolution?.locatorName;
                if (!expectedName || trace.locatorName !== expectedName) return;
                const getters = tracedGettersByMethod.get(trace.screenMethod) || new Set<string>();
                getters.add(expectedName);
                tracedGettersByMethod.set(trace.screenMethod, getters);
            });
            // Una accion que adopto un candidato del gap ya no crea nada: su par
            // (TypeLocator, valor) es el del locator que ya vive en el
            // framework. Exigirle el par de la grabacion era pedirle que
            // deshiciera la reutilizacion que el propio gap le pidio.
            const createNames = new Set(plan.resolutions
                .filter(resolution =>
                    resolution.resolution === 'create'
                    && resolution.locatorName
                    && !completionBySequence.has(resolution.sequence)
                    && !adoptedBySequence.has(resolution.sequence)
                )
                .map(resolution => resolution.locatorName!));
            for (const name of createNames) {
                const pairs = primaryByLocator.get(name) || new Set<string>();
                const entries = currentLocators.filter(entry =>
                    entry.name === name
                    && entry.blockName.toLowerCase().endsWith(scenario.platform)
                );
                const exact = entries.filter(entry => {
                    const key =
                        `${name}\u0000${scenario.platform}\u0000${locatorFile.path}\u0000` +
                        `${entry.blockName}\u0000${name}`;
                    const types = referencedTypes.get(key) || new Set<string>();
                    return types.size === 1
                        && pairs.has(`${[...types][0]}\u0000${entry.selector.trim()}`);
                });
                if (!this.relaxedContract && (exact.length !== 1 || entries.length !== 1)) {
                    errors.push({
                        code: 'create-locator-contract',
                        message:
                            `El create de ${name} debe declarar una sola vez el par primary exacto ` +
                            '(TypeLocator, valor) en el getter homónimo y bloque de la plataforma grabada.',
                        file: locatorFile.path,
                    });
                }
                const oppositePlatform = scenario.platform === 'android' ? 'ios' : 'android';
                if (!hasLocatorKeyForPlatform(locatorFile.content, name, oppositePlatform)) {
                    errors.push({
                        code: 'platform-coverage',
                        message:
                            `El locator ${name} debe declarar tambien su clave en ${oppositePlatform.toUpperCase()} `
                            + "aunque quede vacia (''). No uses literales vacios dentro de getElement.",
                        file: locatorFile.path,
                    });
                }
            }
            for (const resolution of plan.resolutions.filter(item =>
                item.resolution === 'create' && item.locatorName
            )) {
                const traces = response.actionTrace.filter(trace => trace.sequence === resolution.sequence);
                const trace = traces.length === 1 ? traces[0] : undefined;
                const completion = completionBySequence.get(resolution.sequence);
                const adopted = adoptedBySequence.get(resolution.sequence);
                const expectedGetter = adopted || completion?.name || resolution.locatorName!;
                const reusesIndexedMethod = Boolean(
                    adopted
                    && resolution.existingMethod
                    && trace?.screenMethod === resolution.existingMethod.name
                    && resolution.existingMethod.locatorKeys.includes(adopted)
                );
                const usage = trace?.screenMethod
                    ? methodUsage.get(trace.screenMethod)
                    : undefined;
                const tracedGetters = trace?.screenMethod
                    ? tracedGettersByMethod.get(trace.screenMethod)
                    : undefined;
                const action = actionBySequence.get(resolution.sequence);
                const candidates = action ? candidateAllowlist(action, scenario.platform) : [];
                const candidateLiterals = candidates
                    .flatMap(candidate => [candidate.selector, candidate.locatorValue]);
                const primary = candidates.find(candidate => candidate.primary);
                // El locator adoptado trae su propio valor del framework: los
                // literales de la grabacion no aplican.
                const literals = adopted ? [] : candidateLiterals;
                const completionMappingValid = !completion || Boolean(
                    primary
                    && (() => {
                        const target = completionTarget(plan, completion);
                        if (!target) return false;
                        const key =
                            `${expectedGetter}\u0000${scenario.platform}\u0000${target.file}\u0000` +
                            `${target.block}\u0000${target.name}`;
                        const types = referencedTypes.get(key) || new Set<string>();
                        return types.size === 1 && types.has(primary.locatorType);
                    })()
                );
                if (!this.relaxedContract && !reusesIndexedMethod && (
                    !trace?.screenMethod
                    || !usage
                    || usage.hardcodedSelector
                    || literals.some(value => usage.literals.has(value))
                    || !completionMappingValid
                    || !usage.getters.has(expectedGetter)
                    || [...usage.getters].some(getter => !tracedGetters?.has(getter))
                )) {
                    errors.push({
                        code: 'trace-screen-method',
                        message:
                            `La acción ${resolution.sequence} debe trazar un único screenMethod que consuma ` +
                            `el getter ${expectedGetter} sin selectores literales ni rutas alternativas.`,
                        file: screenFile?.path,
                    });
                }
            }
            if (this.relaxedContract) {
                warnings.push(
                    'Modo experimental activo: se omitieron create-locator-contract y trace-screen-method.'
                );
            }
            for (const proposed of changedLocatorValues(locatorFile.content, baseline)) {
                const recordedPlatformBlock = proposed.blockName.toLowerCase().endsWith(scenario.platform);
                const types = new Set<string>([
                    ...locatorTypesFor(proposed.name, proposed.blockName, proposed.name),
                    ...(expectedGetterByAlias.has(proposed.name)
                        ? [...locatorTypesFor(
                            expectedGetterByAlias.get(proposed.name)!,
                            proposed.blockName,
                            proposed.name
                        )]
                        : []),
                ]);
                const pairs = primaryByLocator.get(proposed.name) || new Set<string>();
                const exactTypes = [...types].filter(type =>
                    pairs.has(`${type}\u0000${proposed.selector.trim()}`)
                );
                if (
                    createNames.has(proposed.name)
                    && recordedPlatformBlock
                    && exactTypes.length === 1
                    && types.size === 1
                ) continue;
                if (
                    acceptedTraceAliases.has(proposed.name)
                    && recordedPlatformBlock
                    && exactTypes.length === 1
                    && types.size === 1
                ) continue;
                if (
                    recordedPlatformBlock
                    && [...pairs].some(pair => pair.endsWith(`\u0000${proposed.selector.trim()}`))
                    && (types.size !== 1 || exactTypes.length !== 1)
                ) {
                    errors.push({
                        code: 'locator-type-mismatch',
                        message:
                            `El getter de ${proposed.blockName}.${proposed.name} debe usar el TypeLocator ` +
                            `del candidato primary para "${proposed.selector}".`,
                        file: locatorFile.path,
                    });
                } else {
                    errors.push({
                        code: 'invented-selector',
                        message:
                            `El locator ${proposed.blockName}.${proposed.name} no usa el par primary ` +
                            `(TypeLocator, valor) verificado para create: "${proposed.selector}".`,
                        file: locatorFile.path,
                    });
                }
            }
        }
        const existingAutomationWithoutNewLocators = Boolean(locatorFile) &&
            hasNoLocatorEntries(locatorFile!.content) &&
            (Boolean(plan.existingCase) || reusesEveryRecordedLocator(scenario, plan, response));
        if (existingAutomationWithoutNewLocators) {
            errors.push({
                code: 'existing-automation',
                message: 'El agente reutilizó todos los locators. Esta automatización ya existe y no se puede volver a crear.',
                file: locatorFile?.path,
            });
        }

        if (!existingAutomationWithoutNewLocators &&
            !errors.some(error => ['missing-layer', 'path', 'extra-layer'].includes(error.code))) {
            try {
                const preview = this.toPreview(response);
                const output = this.outputValidator.validate(preview, scenario.platform);
                output.errors.forEach(message => {
                    const layer = /^(?:Feature|Scenario)/.test(message)
                        ? 'feature'
                        : /^Steps/.test(message)
                            ? 'steps'
                            : /^(?:ScreenObject)/.test(message)
                                ? 'screen'
                                : /(?:locator|JSON)/i.test(message)
                                    ? 'locators'
                                    : undefined;
                    if (layer === 'screen' && reusesScreenWithoutChanges) return;
                    errors.push({
                        code: 'output',
                        message,
                        file: layer ? response.files.find(file => file.layer === layer)?.path : undefined,
                    });
                });
                warnings.push(...output.warnings);
                if (!/^\s*Then\s+\S+/m.test(preview.featureContent)) {
                    errors.push({
                        code: 'assertion',
                        message: 'Scenario sin aserción Then',
                        file: response.files.find(file => file.layer === 'feature')?.path,
                    });
                }
                // Las filas `reused` ya existen en el framework con esa
                // expresión exacta. Si el agente las reescribe (inlinar el
                // usuario, perder una tilde) el step queda undefined y eso solo
                // se descubre ejecutando el caso.
                for (const text of rewrittenReusedSteps(scenario, preview.featureContent)) {
                    errors.push({
                        code: 'reused-step-rewritten',
                        message: `El step reutilizado "${text}" fue reescrito. Cópialo literal: ` +
                            'lo resuelve un step definition que ya existe y cualquier cambio lo deja sin enlazar.',
                        file: response.files.find(file => file.layer === 'feature')?.path,
                    });
                }
                for (const message of missingExamples(preview.featureContent)) {
                    errors.push({
                        code: 'missing-examples',
                        message,
                        file: response.files.find(file => file.layer === 'feature')?.path,
                    });
                }
                // Un locator compartido puede tener cobertura histórica en la
                // otra plataforma, pero eso no demuestra que ESTE Scenario se
                // haya grabado/validado allí. El tag se habilita por la
                // plataforma de la ejecución actual; una posterior grabación
                // de completado conservará el tag previo y añadirá el nuevo.
                const requiredPlatforms = new Set<'android' | 'ios'>([scenario.platform]);
                for (const platform of requiredPlatforms) {
                    if (!hasPlatformTag(preview.featureContent, platform)) {
                        errors.push({
                            code: 'platform-tag',
                            message: `El Feature requiere @${platform} porque esa plataforma tiene cobertura.`,
                            file: response.files.find(file => file.layer === 'feature')?.path,
                        });
                    }
                }
                for (const step of imperativeGherkinSteps(preview.featureContent)) {
                    errors.push({
                        code: 'imperative-gherkin',
                        message: `Gherkin técnico/imperativo: ${step}. Describe la intención de negocio y agrupa las acciones.`,
                        file: response.files.find(file => file.layer === 'feature')?.path,
                    });
                }
                for (const step of genericTemplateGherkinSteps(preview.featureContent)) {
                    errors.push({
                        code: 'generic-template-gherkin',
                        message: `Gherkin genérico generado por plantilla: ${step}. Consolida el ciclo y describe un único comportamiento o resultado observable.`,
                        file: response.files.find(file => file.layer === 'feature')?.path,
                    });
                }
                const proposedStepTexts = responseScenarioSteps(preview.featureContent).flat();
                for (const action of scenario.actions) {
                    const contextHint = selectorNormalization.normalizeStepText(recordedStepContext(action));
                    if (!contextHint || !proposedStepTexts.includes(contextHint)) continue;
                    errors.push({
                        code: 'verbatim-context-hint',
                        message: `La pista contextual de la acción ${action.sequence} fue copiada literalmente como Step. Debe sintetizarse dentro del comportamiento del caso.`,
                        file: response.files.find(file => file.layer === 'feature')?.path,
                    });
                }
                const traceBySequence = new Map(response.actionTrace.map(trace => [trace.sequence, trace.gherkinStep]));
                for (const action of scenario.actions.filter(item => TECHNICAL_ACTIONS.has(item.action))) {
                    const current = traceBySequence.get(action.sequence);
                    const groupedWithAdjacent = Boolean(current) && [action.sequence - 1, action.sequence + 1]
                        .some(sequence => traceBySequence.get(sequence) === current);
                    if (!groupedWithAdjacent) {
                        errors.push({
                            code: 'ungrouped-technical-action',
                            message: `La acción técnica ${action.sequence} (${action.action}) debe quedar dentro de un step funcional adyacente.`,
                            file: response.files.find(file => file.layer === 'feature')?.path,
                        });
                    }
                }
                const definitions = [...(preview.stepContent || '').matchAll(
                    /(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g
                )].map(match => match[1]);
                const duplicateDefinition = definitions.find((definition, index) =>
                    definitions.indexOf(definition) !== index
                );
                if (duplicateDefinition) {
                    errors.push({
                        code: 'duplicate-step-definition',
                        message: `Definición Gherkin duplicada: ${duplicateDefinition}`,
                        file: response.files.find(file => file.layer === 'steps')?.path,
                    });
                }
                // Un step definition que ningun Scenario usa es codigo muerto en un
                // namespace global: nadie lo llama y estorba a la siguiente
                // generacion. Solo aplica cuando el archivo se crea; en un update el
                // baseline trae definitions de otros features que si se usan.
                {
                    const stepsPlanned = plan.files.find(file => file.layer === 'steps');
                    // En un update, las definitions del baseline pertenecen a otros
                    // Scenarios y si se usan; solo se juzga lo que el agente agrega.
                    const inherited = new Set<string>();
                    if (stepsPlanned?.operation === 'update') {
                        const absolute = path.join(projectPaths.frameworkRoot, stepsPlanned.path);
                        if (fs.existsSync(absolute)) {
                            [...fs.readFileSync(absolute, 'utf-8').matchAll(
                                /(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g
                            )].forEach(match => inherited.add(match[1]));
                        }
                    }
                    const featureLines = featureStepLines(preview.featureContent);
                    for (const definition of definitions.filter(item => !inherited.has(item))) {
                        let expression: RegExp;
                        try {
                            expression = new RegExp(`^${definition}$`);
                        } catch {
                            continue;
                        }
                        if (featureLines.some(line => expression.test(line))) continue;
                        warnings.push(
                            `Step definition sin uso: "${definition}". Ningun Scenario del Feature lo invoca; ` +
                            'eliminalo o cubre ese comportamiento en el Gherkin.'
                        );
                    }
                }
                const methods = [...(preview.screenContent || '').matchAll(
                    /public\s+async\s+([A-Za-z_$][\w$]*)\s*\(/g
                )].map(match => match[1]);
                const duplicateMethod = methods.find((method, index) => methods.indexOf(method) !== index);
                if (duplicateMethod) {
                    errors.push({
                        code: 'duplicate-screen-method',
                        message: `Método de Screen Object duplicado: ${duplicateMethod}`,
                        file: response.files.find(file => file.layer === 'screen')?.path,
                    });
                }
                // El codigo del framework se nombra en ingles; el espanol queda para
                // la prosa que lee el QA (linea Feature, nombre del Scenario y texto
                // de los steps). Solo se juzga lo que el agente agrega: hay 76
                // identificadores en espanol heredados que no le tocan a el arreglar.
                {
                    const inheritedNames = new Set<string>();
                    for (const plannedFile of plan.files.filter(file => file.operation === 'update')) {
                        const absolute = path.join(projectPaths.frameworkRoot, plannedFile.path);
                        if (!fs.existsSync(absolute)) continue;
                        const baseline = fs.readFileSync(absolute, 'utf-8');
                        declaredIdentifiers({
                            steps: plannedFile.layer === 'steps' ? baseline : '',
                            screen: plannedFile.layer === 'screen' ? baseline : '',
                            locators: plannedFile.layer === 'locators' ? baseline : '',
                        }).forEach(symbol => inheritedNames.add(symbol.name));
                    }
                    const reported = new Set<string>();
                    const added = declaredIdentifiers({
                        steps: preview.stepContent || '',
                        screen: preview.screenContent || '',
                        locators: preview.locatorContent || '',
                    }).filter(symbol => !inheritedNames.has(symbol.name));
                    for (const symbol of added) {
                        const markers = spanishTokens(symbol.name);
                        if (!markers.length || reported.has(symbol.name)) continue;
                        reported.add(symbol.name);
                        warnings.push(
                            `non-english-identifier: El ${symbol.kind} "${symbol.name}" está en español ` +
                            `(${markers.join(', ')}). El código del framework se nombra en inglés; ` +
                            'el español solo va en el Gherkin.'
                        );
                    }
                }
                const screenPlan = plan.files.find(file => file.layer === 'screen');
                const stepsPlan = plan.files.find(file => file.layer === 'steps');
                if (screenPlan && stepsPlan && !reusesScreenWithoutChanges) {
                    const expected = screenObjectNames(screenPlan.path);
                    const screenImports = [...(preview.stepContent || '').matchAll(
                        /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.screen\.(?:ts|js))['"]/gm
                    )];
                    const expectedSource = plannedAlias(
                        screenPlan.path,
                        'screenobjects',
                        '@screenobjects'
                    );
                    const screenImport = screenImports.find(match => match[2] === expectedSource);
                    const alias = screenImport?.[1];
                    const source = screenImport?.[2];
                    if (alias && !(preview.stepContent || '').includes(`${alias}.`)) {
                        errors.push({
                            code: 'screen-alias-usage',
                            message: `El alias ${alias} se importa pero no se utiliza en Steps.`,
                            file: stepsPlan.path,
                        });
                    }
                    if (!expectedSource || source !== expectedSource) {
                        errors.push({
                            code: 'screen-import-alias',
                            message: `Import de Screen Object inválido: ${source || 'ausente'}. Esperado: ${expectedSource || '@screenobjects/<squad>/<archivo>.screen.ts'}.`,
                            file: stepsPlan.path,
                        });
                    }
                    const screenContent = preview.screenContent || '';
                    const locatorPlan = plan.files.find(file => file.layer === 'locators');
                    const expectedLocatorSource = locatorPlan
                        ? plannedAlias(locatorPlan.path, 'resources/locators', '@locators')
                        : undefined;
                    // Los anclajes se leen del framework, no se asumen: comparar
                    // contra una constante propia hacia que un import obsoleto
                    // pasara la validacion y reventara recien en wdio.
                    const contract = frameworkContract(projectPaths.frameworkRoot);
                    const requiredSources = [
                        contract.baseScreenImport,
                        ...(expectedLocatorSource
                            ? [contract.locatorFactoryImport, contract.typeLocatorImport, expectedLocatorSource]
                            : []),
                    ];
                    // El framework renombro la clase resolutora (LocatorFactory ->
                    // LocatorProvider). Importar la ruta correcta pero invocar el
                    // nombre viejo compila mal y el import queda sin uso.
                    if (expectedLocatorSource) {
                        for (const [symbol, label] of [
                            [contract.locatorFactorySymbol, 'resolutor de locators'],
                            [contract.typeLocatorSymbol, 'enum de estrategias'],
                        ]) {
                            if (new RegExp(`\\b${symbol}\\b`).test(screenContent)) continue;
                            errors.push({
                                code: 'framework-symbol',
                                message: `El Screen Object no usa el ${label} de este framework: se llama ${symbol}.`,
                                file: screenPlan.path,
                            });
                        }
                    }
                    for (const requiredSource of requiredSources) {
                        if (!importsFrom(screenContent, requiredSource)) {
                            errors.push({
                                code: 'framework-import-alias',
                                message: `Screen Object debe importar ${requiredSource}.`,
                                file: screenPlan.path,
                            });
                        }
                    }
                    // Reglas mecanicas: atributo de tipo en los imports de JSON,
                    // alias tambien en los modulos reutilizados —su forma se
                    // deriva del propio especificador— y `getElement` con sus
                    // cuatro argumentos en el orden de la firma. Misma
                    // implementacion que corre dentro del sandbox del agente.
                    const expectedImports: Record<string, string> = {};
                    const expectedIdentifiers: Record<string, string> = {};
                    if (expectedLocatorSource) {
                        const fileName = expectedLocatorSource.split('/').pop()!;
                        expectedImports[fileName] = expectedLocatorSource;
                        expectedIdentifiers[fileName] = locatorImportIdentifier(locatorPlan!.path);
                    }
                    for (const problem of screenObjectProblems(screenContent, {
                        typeLocatorSymbol: contract.typeLocatorSymbol,
                        typeLocatorImport: contract.typeLocatorImport,
                        helpers: frameworkHelpersOf(projectPaths.frameworkRoot).map(helper => ({
                            property: helper.property,
                            methods: helper.methods.map(method => method.name),
                        })),
                        platformOrder: contract.locatorSignature.platformOrder,
                        parameterCount: contract.locatorSignature.parameterCount,
                        expectedImports,
                        expectedIdentifiers,
                        stepsContent: preview.stepContent || '',
                        expectedNames: {
                            className: expected.className,
                            instanceName: expected.instanceName,
                            importSource: expectedSource,
                            baseScreenClass: contract.baseScreenClass,
                        },
                    })) {
                        errors.push({
                            code: problem.code,
                            message: problem.message,
                            file: problem.code === 'screen-alias' ? stepsPlan.path : screenPlan.path,
                        });
                    }
                    // Cobertura de plataforma: ninguna clave referenciada puede
                    // quedar vacia en la plataforma que se grabo.
                    const locatorImports = [...screenContent.matchAll(
                        /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"](@locators\/[^'"]+\.locator\.json)['"]/g
                    )].map(match => ({
                        identifier: match[1],
                        file: match[2].replace(/^@locators\//, 'resources/locators/'),
                    }));
                    const completedKeys = new Set((response.completions || []).flatMap(completion => {
                        const target = completionTarget(plan, completion);
                        if (!target || target.platform !== scenario.platform) return [];
                        const imported = locatorImports.find(item => item.file === target.file);
                        return imported ? [`${imported.identifier}.${target.block}.${target.name}`] : [];
                    }));
                    const documents = new Map<string, Record<string, any> | undefined>();
                    const documentFor = (identifier: string): Record<string, any> | undefined => {
                        if (documents.has(identifier)) return documents.get(identifier);
                        let document: Record<string, any> | undefined;
                        const ownContent = response.files.find(file => file.layer === 'locators')?.content;
                        const importMatch = screenContent.match(new RegExp(
                            `import\\s+${identifier}\\s+from\\s+['"]([^'"]+\\.locator\\.json)['"]`
                        ));
                        try {
                            if (importMatch && expectedLocatorSource && importMatch[1] === expectedLocatorSource) {
                                // El modulo propio todavia no esta en disco: su
                                // contenido es el que trae la respuesta.
                                document = ownContent ? JSON.parse(ownContent) : undefined;
                            } else if (importMatch) {
                                const relative = importMatch[1].replace(/^@locators\//, 'resources/locators/');
                                document = JSON.parse(fs.readFileSync(
                                    path.join(projectPaths.frameworkRoot, relative), 'utf-8'
                                ));
                            }
                        } catch {
                            document = undefined;
                        }
                        documents.set(identifier, document);
                        return document;
                    };
                    for (const reference of emptyOnRecordedPlatform(
                        screenContent, scenario.platform, documentFor, completedKeys
                    )) {
                        errors.push({
                            code: 'platform-coverage',
                            message: `${reference} no tiene valor en ${scenario.platform}: el getter resolveria `
                                + 'a un selector vacio y el caso fallaria al ejecutar. Rellena la clave '
                                + 'declarandola en `completions` con la accion que capturo ese elemento, '
                                + 'o usa un locator del modulo de este caso.',
                            file: screenPlan.path,
                        });
                    }
                }
                if (/Locators\.[A-Za-z_$][\w$]*-/.test(preview.screenContent || '')) {
                    errors.push({
                        code: 'invalid-locator-access',
                        message: 'El Screen Object usa acceso inválido a un bloque locator con guiones',
                        file: response.files.find(file => file.layer === 'screen')?.path,
                    });
                }
                for (const plannedFile of plan.files.filter(file => file.operation === 'update')) {
                    const proposed = response.files.find(file => file.layer === plannedFile.layer)?.content || '';
                    const absolute = path.join(projectPaths.frameworkRoot, plannedFile.path);
                    if (!fs.existsSync(absolute)) {
                        errors.push({
                            code: 'missing-update-target',
                            message: `El artefacto a reutilizar ya no existe: ${plannedFile.path}`,
                            file: plannedFile.path,
                        });
                        continue;
                    }
                    const baseline = fs.readFileSync(absolute, 'utf-8');
                    const requiredTokens = plannedFile.layer === 'steps'
                        ? [...baseline.matchAll(/(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g)].map(match => match[1])
                        : plannedFile.layer === 'screen'
                            ? [...baseline.matchAll(/public\s+async\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1])
                            : plannedFile.layer === 'locators'
                                ? responseLocatorValues(baseline).map(locator => locator.name)
                                : [];
                    const missingTokens = requiredTokens.filter(token => !proposed.includes(token));
                    if (missingTokens.length) {
                        errors.push({
                            code: 'destructive-update',
                            message: `La actualización elimina APIs existentes: ${missingTokens.slice(0, 5).join(', ')}`,
                            file: plannedFile.path,
                        });
                    }
                }
                const catalog = this.reuseAnalyzer.getCatalog(
                    scenario.squad,
                    scenario.platform,
                    scenario.request.featureScope
                );
                const stepsPath = response.files.find(file => file.layer === 'steps')?.path;
                for (const definition of definitions) {
                    const normalizedDefinition = selectorNormalization.canonicalStepExpression(definition);
                    const collision = catalog.stepDefinitions.find(existing =>
                        existing.file !== stepsPath
                        && (
                            existing.expression === definition
                            || selectorNormalization.canonicalStepExpression(existing.expression) === normalizedDefinition
                        )
                    );
                    if (collision) {
                        errors.push({
                            code: 'framework-step-collision',
                            message: `Definición Gherkin ya existente en ${collision.file}: ${definition}`,
                            file: stepsPath,
                        });
                    }
                }
                const featurePath = response.files.find(file => file.layer === 'feature')?.path;
                for (const proposed of responseScenarioSteps(preview.featureContent)) {
                    const collision = (catalog.scenarios || []).find(existing =>
                        existing.file !== featurePath &&
                        existing.steps.length === proposed.length &&
                        existing.steps.every((step, index) =>
                            selectorNormalization.normalizeStepText(step.text) === proposed[index]
                        )
                    );
                    if (collision) {
                        errors.push({
                            code: 'framework-scenario-collision',
                            message: `Escenario equivalente ya existente en ${collision.file}: ${collision.name}`,
                            file: featurePath,
                        });
                    }
                }
                const locatorFile = response.files.find(file => file.layer === 'locators');
                const locatorBaseline = updateBaselines.get('locators');
                const proposedLocators = locatorBaseline
                    ? changedLocatorValues(locatorFile?.content || '', locatorBaseline)
                    : responseLocatorValues(locatorFile?.content || '');
                for (const proposed of proposedLocators) {
                    const aliases = selectorNormalization.selectorAliases(proposed.selector, scenario.platform);
                    const collision = catalog.locators.find(existing =>
                        existing.file !== locatorFile?.path && Boolean(existing.selector) &&
                        [...selectorNormalization.selectorAliases(existing.selector, scenario.platform)]
                            .some(alias => aliases.has(alias))
                    );
                    if (collision) {
                        errors.push({
                            code: 'framework-locator-collision',
                            message: `Selector de ${proposed.name} ya existe como ${collision.name} en ${collision.file}`,
                            file: locatorFile?.path,
                        });
                    }
                }
            } catch (error: any) {
                errors.push({ code: 'preview', message: error.message });
            }
        }
        const unique = errors.filter((error, index) =>
            errors.findIndex(candidate => candidate.code === error.code && candidate.message === error.message && candidate.file === error.file) === index
        );
        const valid = unique.length === 0;
        const affectedFiles = [...new Set(unique.map(error => error.file).filter(Boolean) as string[])];
        return {
            valid,
            qualityScore: valid ? 100 : Math.max(0, 100 - unique.length * 10),
            errors: unique,
            warnings,
            ...(valid ? {} : {
                repairContext: {
                    attempt,
                    errors: unique,
                    affectedFiles,
                    groups: groupRepairErrors(unique),
                },
            }),
        };
    }
}
