/**
 * Helpers de AST compartidos por las inspecciones del Screen Object.
 */
import ts from 'typescript';

export function propertyChain(expression: ts.Expression): { root: string; properties: string[] } | undefined {
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

export function bindingNames(name: ts.BindingName): string[] {
    if (ts.isIdentifier(name)) return [name.text];
    return name.elements.flatMap(element =>
        ts.isOmittedExpression(element) ? [] : bindingNames(element.name)
    );
}

