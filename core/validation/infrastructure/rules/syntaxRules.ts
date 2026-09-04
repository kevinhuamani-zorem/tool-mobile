/**
 * Familia sintaxis: el TypeScript propuesto tiene que compilar.
 *
 * Diagnostico del compilador sobre Steps y Screen Object, y coherencia entre
 * los argumentos con que Steps invoca un metodo y la aridad que ese metodo
 * declara en el Screen Object.
 */
import { validateTypeScriptSyntax } from '../typescriptSyntaxValidator';
import { screenMethodArities, stepScreenMethodCalls } from './screenInspection';
import { ResponseRuleContext, RuleReport } from './ruleContext';

export function syntaxRules(context: ResponseRuleContext, report: RuleReport): void {
    const { scenario, plan, response } = context;
    const { errors, warnings } = report;
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
}
