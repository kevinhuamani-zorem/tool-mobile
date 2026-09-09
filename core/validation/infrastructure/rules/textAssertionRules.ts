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

const HELPER = 'readRecordedText';
const HELPER_SOURCE = 'framework-api.json.textAssertion.helper';

/** Una lectura `const x = await this.readRecordedText(<objetivo>, '<fuente>')` dentro del metodo trazado. */
interface RecordedRead {
    variable: string;
    target: string;
    source?: string;
}

const RETURNED_READ = '(return)';

function readsOf(method: ts.MethodDeclaration, source: ts.SourceFile): RecordedRead[] {
    const reads: RecordedRead[] = [];
    const record = (variable: string, expression: ts.Expression): void => {
        const call = unwrap(expression);
        if (!ts.isCallExpression(call) || call.expression.getText(source) !== `this.${HELPER}`) return;
        const target = call.arguments[0] ? unwrap(call.arguments[0]).getText(source) : '';
        const origin = call.arguments[1];
        reads.push({ variable, target, source: origin && ts.isStringLiteralLike(origin) ? origin.text : undefined });
    };
    for (const statement of method.body?.statements || []) {
        if (ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.Const)) {
            for (const variable of statement.declarationList.declarations) {
                if (ts.isIdentifier(variable.name) && variable.initializer) record(variable.name.text, variable.initializer);
            }
        }
        // `return this.readRecordedText(...)` directo: lectura devuelta sin variable.
        if (ts.isReturnStatement(statement) && statement.expression) record(RETURNED_READ, statement.expression);
    }
    return reads;
}

/** Una comparacion `expect(<variable>).<operador>(<esperado>)` como sentencia del metodo. */
interface RecordedAssertion {
    variable: string;
    operator: string;
    expected: ts.Expression;
}

function assertionsOf(method: ts.MethodDeclaration, source: ts.SourceFile): RecordedAssertion[] {
    const assertions: RecordedAssertion[] = [];
    for (const statement of method.body?.statements || []) {
        if (!ts.isExpressionStatement(statement)) continue;
        const assertion = unwrap(statement.expression);
        if (!ts.isCallExpression(assertion) || !ts.isPropertyAccessExpression(assertion.expression)) continue;
        if (assertion.arguments.length !== 1) continue;
        const expect = assertion.expression.expression;
        if (!ts.isCallExpression(expect) || expect.expression.getText(source) !== 'expect' || expect.arguments.length !== 1) continue;
        const actual = expect.arguments[0];
        if (!ts.isIdentifier(actual)) continue;
        assertions.push({ variable: actual.text, operator: assertion.expression.name.text, expected: assertion.arguments[0] });
    }
    return assertions;
}

/** `return x` / `return await this.readRecordedText(this.<getter>, '<fuente>')` en el metodo trazado. */
function returnsRecordedRead(
    method: ts.MethodDeclaration,
    source: ts.SourceFile,
    variables: Set<string>,
    target: string,
    origin: string,
): boolean {
    for (const statement of method.body?.statements || []) {
        if (!ts.isReturnStatement(statement) || !statement.expression) continue;
        const value = unwrap(statement.expression);
        if (ts.isIdentifier(value) && variables.has(value.text)) return true;
        if (ts.isCallExpression(value) && value.expression.getText(source) === `this.${HELPER}`
            && value.arguments.length === 2
            && unwrap(value.arguments[0]).getText(source) === target
            && ts.isStringLiteralLike(value.arguments[1]) && value.arguments[1].text === origin) return true;
    }
    return false;
}

/** Como compara un Step el texto que devuelve `<instancia>.<screenMethod>()`. */
interface StepComparison {
    operator: string;
    expected: ts.Expression;
    /** Parametros del callback del Step, para aceptar `<param>` del Examples. */
    parameters: Set<string>;
}

function stepComparisons(steps: ts.SourceFile, screenMethod: string): { calls: number; comparisons: StepComparison[] } {
    const comparisons: StepComparison[] = [];
    let calls = 0;
    const isMethodCall = (node: ts.Node): boolean => {
        const call = unwrap(node as ts.Expression);
        return ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression)
            && call.expression.name.text === screenMethod;
    };
    const visit = (node: ts.Node): void => {
        if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) && node.body && ts.isBlock(node.body)) {
            const parameters = new Set(node.parameters.map(parameter => parameter.name.getText(steps)));
            const variables = new Set<string>();
            for (const statement of node.body.statements) {
                if (ts.isVariableStatement(statement)) {
                    for (const variable of statement.declarationList.declarations) {
                        if (ts.isIdentifier(variable.name) && variable.initializer && isMethodCall(variable.initializer)) {
                            variables.add(variable.name.text);
                            calls += 1;
                        }
                    }
                    continue;
                }
                if (!ts.isExpressionStatement(statement)) continue;
                const assertion = unwrap(statement.expression);
                if (isMethodCall(assertion)) { calls += 1; continue; }
                if (!ts.isCallExpression(assertion) || !ts.isPropertyAccessExpression(assertion.expression) || assertion.arguments.length !== 1) continue;
                const expect = assertion.expression.expression;
                if (!ts.isCallExpression(expect) || expect.expression.getText(steps) !== 'expect' || expect.arguments.length !== 1) continue;
                const actual = unwrap(expect.arguments[0]);
                const compared = (ts.isIdentifier(actual) && variables.has(actual.text)) || isMethodCall(actual);
                if (!compared) continue;
                if (isMethodCall(actual)) calls += 1;
                comparisons.push({ operator: assertion.expression.name.text, expected: assertion.arguments[0], parameters });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(steps);
    return { calls, comparisons };
}

/**
 * Verifica evidencia explícita, no palabras del XPath ni comentarios del agente.
 *
 * Cada acción con `textAssertion` exige, dentro del método trazado: (1) el
 * helper `readRecordedText` idéntico al del contrato en su clase, (2) una
 * lectura `const x = await this.readRecordedText(this.<getter>, '<fuente>')`
 * y (3) la comparación `toContain|toBe(<esperado grabado>)`, que puede vivir
 * en dos sitios: en el propio método (forma heredada) o, como Page Object
 * puro, en el Step que recibe la lectura devuelta por el método
 * (`return x`) —el diseño elegido para el pipeline (05-09-2026). Un solo
 * mensaje genérico dejaba al autor adivinando qué corregir (TC-10239: 30
 * turnos y dos rondas sin converger); el error dice cuál falla, cómo se
 * escribe y apunta al archivo del autor responsable: Screen para Zorem,
 * Steps para Lorem.
 */
export function textAssertionRules(context: ResponseRuleContext, report: RuleReport): void {
    inspectTextAssertions(context, report);
}

/** Only complete, checked Screen → Steps text assertions establish getter consumption. */
export function validatedTextAssertionGetters(context: ResponseRuleContext): Map<number, string> {
    const verified = inspectTextAssertions(context, { errors: [], warnings: [] });
    // Legacy VERIFICAR_TEXTO reads the element itself. Runtime used includes;
    // generated framework tests used exact text. Recognize both established
    // comparisons without changing the recording or inferring a container.
    const legacy = context.scenario.actions.filter(action => action.action === 'VERIFICAR_TEXTO' && !action.textAssertion);
    if (legacy.length) for (const operator of ['contains', 'equals'] as const) {
        const scenario = { ...context.scenario, actions: legacy.map(action => ({ ...action,
            textAssertion: { version: 1 as const, source: 'element' as const, operator } })) };
        for (const [sequence, getter] of inspectTextAssertions({ ...context, scenario }, { errors: [], warnings: [] })) verified.set(sequence, getter);
    }
    return verified;
}

function inspectTextAssertions({ scenario, response }: ResponseRuleContext, report: RuleReport): Map<number, string> {
    const verified = new Map<number, string>();
    const actions = scenario.actions.filter(action => action.textAssertion);
    if (!actions.length) return verified;
    const file = response.files.find(file => file.layer === 'screen');
    const stepsFile = response.files.find(file => file.layer === 'steps');
    const source = ts.createSourceFile('screen.ts', file?.content || '', ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const steps = ts.createSourceFile('steps.ts', stepsFile?.content || '', ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const template = ts.createSourceFile('template.ts', `class Template { ${RECORDED_TEXT_READER} }`, ts.ScriptTarget.Latest, true);
    const expectedHelper = canonical((template.statements[0] as ts.ClassDeclaration).members[0], template);
    const classes = source.statements.filter(ts.isClassDeclaration);
    for (const action of actions) {
        const assertion = action.textAssertion!;
        const trace = response.actionTrace.find(trace => trace.sequence === action.sequence);
        const operator = assertion.operator === 'contains' ? 'toContain' : 'toBe';
        const parameter = /^<([A-Za-z_][A-Za-z0-9_]*)>$/.exec(action.value || '')?.[1];
        const expectedLiteral = parameter ? parameter : JSON.stringify(action.value ?? '');
        const prefix = `La acción ${action.sequence}`;
        const suffix = 'El XPath solo localiza; no reemplaza la aserción.';
        const fail = (detail: string) => report.errors.push({
            code: 'recorded-text-assertion', file: file?.path,
            message: `${prefix}: ${detail} ${suffix}`,
        });
        // La comparación en Steps es de Lorem: el archivo decide el enrutado
        // del feedback antes que cualquier tabla de códigos.
        const failSteps = (detail: string) => report.errors.push({
            code: 'recorded-text-assertion-steps', file: stepsFile?.path,
            message: `${prefix}: ${detail} ${suffix}`,
        });
        if (!trace?.screenMethod || !trace.locatorName) {
            fail(`debe trazar screenMethod y locatorName para leer ${assertion.source} con ${HELPER} y comparar mediante ${assertion.operator} con el valor grabado.`);
            continue;
        }
        const owners = classes
            .map(declaration => ({
                declaration,
                method: declaration.members.filter(ts.isMethodDeclaration)
                    .find(method => method.name.getText(source) === trace.screenMethod),
            }))
            .filter(owner => owner.method?.body);
        if (!owners.length) {
            fail(`traza el método ${trace.screenMethod}, que no existe en el Screen Object; debe leer ${assertion.source} con ${HELPER} desde this.${trace.locatorName} y comparar mediante ${assertion.operator} con el valor grabado.`);
            continue;
        }
        // Si alguna clase cumple las tres condiciones, la accion es valida.
        // Si ninguna, se reporta la primera condicion que falla en la primera.
        let detail: string | undefined;
        let stepsDetail: string | undefined;
        let valid = false;
        for (const { declaration, method } of owners) {
            const className = declaration.name?.text || 'del Screen Object';
            const helper = declaration.members.filter(ts.isMethodDeclaration)
                .find(candidate => candidate.name.getText(source) === HELPER);
            if (!helper) {
                detail ??= `la clase ${className} no declara el helper ${HELPER}; cópialo idéntico desde ${HELPER_SOURCE}.`;
                continue;
            }
            if (canonical(helper, source) !== expectedHelper) {
                detail ??= `el helper ${HELPER} de ${className} difiere del contrato; cópialo idéntico desde ${HELPER_SOURCE} sin cambiar tipos, límites ni lectura.`;
                continue;
            }
            const reads = readsOf(method!, source);
            const expectedRead = `const actual = await this.${HELPER}(this.${trace.locatorName}, '${assertion.source}');`;
            const matching = reads.filter(read => read.target === `this.${trace.locatorName}` && read.source === assertion.source);
            if (!matching.length) {
                const seen = reads[0];
                detail ??= !seen
                    ? `el método ${trace.screenMethod} no lee el texto con el helper; escribe ${expectedRead}`
                    : seen.target !== `this.${trace.locatorName}`
                        ? `el método ${trace.screenMethod} lee desde ${seen.target || '(sin objetivo)'} en vez del getter trazado; escribe ${expectedRead}`
                        : `el método ${trace.screenMethod} lee con la fuente '${seen.source ?? ''}' en vez de '${assertion.source}'; escribe ${expectedRead}`;
                continue;
            }
            const variables = new Set(matching.map(read => read.variable).filter(variable => variable !== RETURNED_READ));
            const expectedMatches = (expected: ts.Expression, parameters: Set<string>): boolean =>
                (ts.isStringLiteralLike(expected) && expected.text === action.value)
                || Boolean(parameter && ts.isIdentifier(expected) && expected.text === parameter && parameters.has(parameter));
            // Forma heredada: la comparación dentro del método.
            const assertions = assertionsOf(method!, source).filter(item => variables.has(item.variable));
            const methodParameters = new Set(method!.parameters.map(item => item.name.getText(source)));
            if (assertions.some(item => item.operator === operator && expectedMatches(item.expected, methodParameters))) {
                valid = true;
                break;
            }
            const returned = matching.some(read => read.variable === RETURNED_READ)
                || returnsRecordedRead(method!, source, variables, `this.${trace.locatorName}`, assertion.source);
            if (assertions.length && !returned) {
                const expectedAssertion = `await expect(${matching[0].variable}).${operator}(${expectedLiteral});`;
                const withOperator = assertions.filter(item => item.operator === operator);
                detail ??= !withOperator.length
                    ? `el método ${trace.screenMethod} compara con ${assertions[0].operator} y la grabación exige ${assertion.operator} (${operator}); escribe ${expectedAssertion}`
                    : `el método ${trace.screenMethod} compara con ${withOperator[0].expected.getText(source)} en vez del valor grabado ${expectedLiteral}; escribe ${expectedAssertion}`;
                continue;
            }
            if (!returned) {
                detail ??= `el método ${trace.screenMethod} lee el texto pero no lo devuelve; termina con return ${matching[0].variable}; (Promise<string>) para que el Step compare con ${operator}(${expectedLiteral}).`;
                continue;
            }
            // Diseño del pipeline: el Screen devuelve la lectura y el Step compara.
            const stepShape = `const actualText: string = await <screen>.${trace.screenMethod}(...); expect(actualText).${operator}(${expectedLiteral});`;
            const { calls, comparisons } = stepComparisons(steps, trace.screenMethod);
            if (!stepsFile) {
                // Sin capa Steps en la respuesta no hay a quién dirigir la
                // comparación: el aviso se queda en el Screen.
                detail ??= `el método ${trace.screenMethod} devuelve la lectura y no hay Steps que la comparen; escribe ${stepShape}`;
                continue;
            }
            if (!calls) {
                stepsDetail ??= `ningún Step invoca ${trace.screenMethod} para comparar el texto devuelto; escribe ${stepShape}`;
                continue;
            }
            if (!comparisons.length) {
                stepsDetail ??= `el Step que invoca ${trace.screenMethod} no compara el texto devuelto; escribe ${stepShape}`;
                continue;
            }
            const stepWithOperator = comparisons.filter(item => item.operator === operator);
            if (!stepWithOperator.length) {
                stepsDetail ??= `el Step compara ${trace.screenMethod} con ${comparisons[0].operator} y la grabación exige ${assertion.operator} (${operator}); escribe ${stepShape}`;
                continue;
            }
            if (!stepWithOperator.some(item => expectedMatches(item.expected, item.parameters))) {
                stepsDetail ??= `el Step compara ${trace.screenMethod} con ${stepWithOperator[0].expected.getText(steps)} en vez del valor grabado ${expectedLiteral}; escribe ${stepShape}`;
                continue;
            }
            valid = true;
            break;
        }
        if (valid) { verified.set(action.sequence, trace.locatorName); continue; }
        if (stepsDetail && !detail) failSteps(stepsDetail);
        else fail(detail || stepsDetail || `debe leer ${assertion.source} con ${HELPER} desde this.${trace.locatorName} y comparar mediante ${assertion.operator} con el valor grabado.`);
    }
    return verified;
}
