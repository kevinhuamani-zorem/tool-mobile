import ts from 'typescript';
import { RECORDED_TEXT_READER } from '../../../automation/contracts';
import { ResponseRuleContext, RuleReport } from './ruleContext';

const printer = ts.createPrinter({ removeComments: true });
const unwrap = (input: ts.Expression): ts.Expression => {
    while (ts.isAwaitExpression(input) || ts.isParenthesizedExpression(input)) input = input.expression;
    return input;
};
const canonical = (node: ts.Node, source: ts.SourceFile): string => {
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard,
        printer.printNode(ts.EmitHint.Unspecified, node, source));
    const tokens: unknown[] = [];
    for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
        tokens.push([kind, scanner.getTokenValue() || scanner.getTokenText()]);
    }
    return JSON.stringify(tokens);
};

/** Verifica evidencia explícita, no palabras del XPath ni comentarios del agente. */
export function textAssertionRules({ scenario, response }: ResponseRuleContext, report: RuleReport): void {
    const actions = scenario.actions.filter(action => action.textAssertion);
    if (!actions.length) return;
    const file = response.files.find(file => file.layer === 'screen');
    const source = ts.createSourceFile('screen.ts', file?.content || '', ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const template = ts.createSourceFile('template.ts', `class Template { ${RECORDED_TEXT_READER} }`, ts.ScriptTarget.Latest, true);
    const expectedHelper = (template.statements[0] as ts.ClassDeclaration).members[0];
    const classes = source.statements.filter(ts.isClassDeclaration);
    for (const action of actions) {
        const trace = response.actionTrace.find(trace => trace.sequence === action.sequence);
        let valid = false;
        for (const declaration of classes) {
            const methods = declaration.members.filter(ts.isMethodDeclaration);
            const helper = methods.find(method => method.name.getText(source) === 'readRecordedText');
            if (!helper || canonical(helper, source) !== canonical(expectedHelper, template)) continue;
            const method = methods.find(method => method.name.getText(source) === trace?.screenMethod);
            if (!method?.body || !trace?.locatorName) continue;
            const reads = new Set<string>();
            for (const statement of method.body.statements) {
                if (ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.Const)) {
                    for (const variable of statement.declarationList.declarations) {
                        if (!ts.isIdentifier(variable.name) || !variable.initializer) continue;
                        const call = unwrap(variable.initializer);
                        if (!ts.isCallExpression(call) || call.expression.getText(source) !== 'this.readRecordedText' || call.arguments.length !== 2) continue;
                        const target = unwrap(call.arguments[0]);
                        const origin = call.arguments[1];
                        if (ts.isPropertyAccessExpression(target) && target.expression.kind === ts.SyntaxKind.ThisKeyword
                            && target.name.text === trace.locatorName && ts.isStringLiteralLike(origin)
                            && origin.text === action.textAssertion!.source) reads.add(variable.name.text);
                    }
                }
                if (!ts.isExpressionStatement(statement)) continue;
                const assertion = unwrap(statement.expression);
                if (!ts.isCallExpression(assertion) || !ts.isPropertyAccessExpression(assertion.expression)) continue;
                const operator = action.textAssertion!.operator === 'contains' ? 'toContain' : 'toBe';
                if (assertion.expression.name.text !== operator || assertion.arguments.length !== 1) continue;
                const expect = assertion.expression.expression;
                if (!ts.isCallExpression(expect) || expect.expression.getText(source) !== 'expect' || expect.arguments.length !== 1) continue;
                const actual = expect.arguments[0];
                if (!ts.isIdentifier(actual) || !reads.has(actual.text)) continue;
                const expected = assertion.arguments[0];
                const parameter = /^<([A-Za-z_][A-Za-z0-9_]*)>$/.exec(action.value || '')?.[1];
                if ((ts.isStringLiteralLike(expected) && expected.text === action.value)
                    || (parameter && ts.isIdentifier(expected) && expected.text === parameter
                        && method.parameters.some(item => item.name.getText(source) === parameter))) valid = true;
            }
        }
        if (!valid) report.errors.push({
            code: 'recorded-text-assertion', file: file?.path,
            message: `La acción ${action.sequence} debe leer ${action.textAssertion!.source} con readRecordedText del borrador, desde su getter trazado, y comparar mediante ${action.textAssertion!.operator} con el valor grabado. El XPath solo localiza; no reemplaza la aserción.`,
        });
    }
}
