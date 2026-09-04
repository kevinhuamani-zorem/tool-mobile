/**
 * Familia estructura del codigo: Screen Object y Steps enganchan con el
 * framework destino.
 *
 * Metodos sin duplicar, identificadores en ingles, alias e imports de Screen
 * Object y locators segun el contrato del framework, los simbolos vigentes del
 * resolutor y del enum, las reglas mecanicas de `screenObjectProblems`, la
 * cobertura de claves en la plataforma grabada y el acceso valido a bloques
 * con guiones.
 */
import path from 'path';
import fs from 'fs';
import {
    locatorImportIdentifier,
    screenObjectNames,
    screenObjectProblems,
} from '../../../automation/contracts';
import { declaredIdentifiers, spanishTokens } from '../../../shared';
import { frameworkContract, frameworkHelpersOf, projectPaths } from '../../../workspace';
import { completionTarget } from './locatorInspection';
import { emptyOnRecordedPlatform, importsFrom, importsModuleLike, plannedAlias, screenClassNameFor } from './screenInspection';
import { PreviewRuleContext, RuleReport } from './ruleContext';

export function codeStructureRules(context: PreviewRuleContext, report: RuleReport): void {
    const { scenario, plan, response, preview, reusesScreenWithoutChanges, updateBaselines } = context;
    const { errors, warnings } = report;
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
                // Un `update` sobre un Screen escrito a mano por el equipo trae
                // su propia clase, sus imports relativos y su deuda. Nada de eso
                // es del agente ni puede corregirlo sin reescribir el baseline
                // (prohibido): se juzga solo lo que agrega.
                const screenBaseline = screenPlan.operation === 'update'
                    ? updateBaselines.get('screen')
                    : undefined;
                const contract = frameworkContract(projectPaths.frameworkRoot);
                const expected = {
                    ...screenObjectNames(screenPlan.path),
                    ...(screenBaseline
                        ? { className: screenClassNameFor(screenBaseline, screenPlan.path, contract.baseScreenClass) }
                        : {}),
                };
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
                        // El baseline ya importaba ese modulo por ruta relativa y
                        // el agente lo conservo: no es un import que falte.
                        if (screenBaseline
                            && importsModuleLike(screenBaseline, requiredSource)
                            && importsModuleLike(screenContent, requiredSource)) continue;
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
                const screenRules = {
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
                };
                const inheritedProblems = new Set(
                    (screenBaseline ? screenObjectProblems(screenBaseline, screenRules) : [])
                        .filter(problem => problem.code !== 'screen-alias')
                        .map(problem => `${problem.code}\u0000${problem.message}`),
                );
                for (const problem of screenObjectProblems(screenContent, screenRules)) {
                    if (inheritedProblems.has(`${problem.code}\u0000${problem.message}`)) continue;
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
}
