/**
 * Qué TypeLocator referencia cada getter del Screen Object propuesto,
 * siguiendo los bindings confiables (`locators`, alias importados) y las
 * llamadas retornadas por cada getter.
 */
import ts from 'typescript';
import { FrameworkContract } from '../../../workspace';
import { bindingNames, propertyChain } from './screenAst';

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
        // Alias del framework o, en un Screen escrito a mano que se
        // actualiza, la ruta relativa que ya tenia el baseline: el modulo es
        // el mismo y el getter que lo consume tiene que poder resolverse.
        const relativeLocators = specifier.match(/(?:^|\/)(resources\/locators\/.+\.locator\.json)$/)?.[1];
        if (specifier.startsWith('@locators/') && specifier.endsWith('.locator.json') && defaultIdentifier) {
            locatorFilesByIdentifier.set(
                defaultIdentifier,
                specifier.replace(/^@locators\//, 'resources/locators/'),
            );
        } else if (relativeLocators && defaultIdentifier) {
            locatorFilesByIdentifier.set(defaultIdentifier, relativeLocators);
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
