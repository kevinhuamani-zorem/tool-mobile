/**
 * Familia flujo de parametros: el dato que el QA parametrizo llega hasta el
 * codigo por argumento, nunca como literal.
 *
 * La cadena completa es Examples -> `<columna>` en el step -> argumento de la
 * definition -> argumento del metodo del Screen Object -> uso en el metodo.
 * Aqui se comprueban los eslabones de Lorem (Feature y Steps); los del Screen
 * Object (`parameter-unused`, `example-value-hardcoded`) corren en
 * `screenObjectProblems`, compartido con tools/check.js de Zorem.
 *
 * Origen: en rec-e84b3413 el Gherkin declaraba <email> en Examples, la
 * definition no lo pasaba y Zorem escribio `setValue('joseamendoza@...')`.
 */
import ts from 'typescript';
import {
    hardcodedExampleProblems,
    scenarioExampleValues,
    unusedExamplesColumns,
} from '../../../automation/contracts';
import { bindingNames } from './screenAst';
import { PreviewRuleContext, RuleReport } from './ruleContext';

/** Definitions Given/When/Then con los parametros de su callback que el cuerpo no usa. */
export function unforwardedStepParameters(content: string): Array<{ expression: string; parameters: string[] }> {
    const source = ts.createSourceFile('steps.ts', String(content || ''), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const problems: Array<{ expression: string; parameters: string[] }> = [];
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
            && ['Given', 'When', 'Then'].includes(node.expression.text) && node.arguments.length >= 2) {
            const callback = node.arguments[1];
            const expression = node.arguments[0].getText(source);
            if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) {
                const declared = callback.parameters.flatMap(parameter => bindingNames(parameter.name));
                const used = new Set<string>();
                const collect = (inner: ts.Node): void => {
                    if (ts.isIdentifier(inner)) used.add(inner.text);
                    ts.forEachChild(inner, collect);
                };
                if (callback.body) collect(callback.body);
                const unused = declared.filter(name => !used.has(name));
                if (unused.length) problems.push({ expression, parameters: unused });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return problems;
}

export function parameterFlowRules(context: PreviewRuleContext, report: RuleReport): void {
    const { scenario, response, preview } = context;
    const { errors } = report;
    const featurePath = response.files.find(file => file.layer === 'feature')?.path;
    const stepsPath = response.files.find(file => file.layer === 'steps')?.path;
    for (const message of unusedExamplesColumns(preview.featureContent)) {
        errors.push({ code: 'examples-unused-column', message, file: featurePath });
    }
    if (!preview.stepContent) return;
    for (const problem of unforwardedStepParameters(preview.stepContent)) {
        errors.push({
            code: 'parameter-not-forwarded',
            message: `La definition ${problem.expression} recibe ${problem.parameters.join(', ')} y no lo usa: ` +
                'el dato del step se pasa al método del Screen Object como argumento; si el Screen lo escribe ' +
                'por su cuenta, queda fijo el valor de la grabación.',
            file: stepsPath,
        });
    }
    for (const problem of hardcodedExampleProblems(preview.stepContent, scenarioExampleValues(scenario))) {
        errors.push({
            code: problem.code,
            message: problem.message.replace('parámetro del método (lo envía la definition del step)', 'parámetro de la definition'),
            file: stepsPath,
        });
    }
}
