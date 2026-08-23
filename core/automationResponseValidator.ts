import path from 'path';
import fs from 'fs';
import {
    AutomationAgentResponse,
    AutomationScenario,
    AutomationValidation,
    GenerationPlan,
} from './automationContracts';
import { GeneratedPreview } from './fwkMobileGenerator';
import { OutputValidator } from './outputValidator';
import { projectPaths } from './projectPaths';
import { ReuseAnalyzer } from './reuseAnalyzer';
import { selectorNormalization } from './deterministicResolver';
import { isGenericScreenAlias, screenObjectNames } from './semanticNaming';
import { recordedStepContext } from './models';
import { featureStepLines, missingExamples, rewrittenReusedSteps } from './gherkinContract';
import { declaredIdentifiers, spanishTokens } from './englishIdentifiers';
import { frameworkContract } from './frameworkContract';

function responseLocatorValues(content: string): Array<{ name: string; selector: string }> {
    try {
        const document = JSON.parse(content) as Record<string, unknown>;
        return Object.entries(document).flatMap(([blockName, block]) =>
            blockName !== '_metadata' &&
            block && typeof block === 'object' && !Array.isArray(block)
                ? Object.entries(block as Record<string, unknown>)
                    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1].trim()))
                    .map(([name, selector]) => ({ name, selector }))
                : []
        );
    } catch {
        return [];
    }
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

function importsFrom(content: string, source: string): boolean {
    return [...content.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)]
        .some(match => match[1] === source);
}

export class AutomationResponseValidator {
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
        if (response.schemaVersion !== 1) errors.push({ code: 'schema', message: 'schemaVersion no soportado' });
        if (response.recordingId !== scenario.recordingId) errors.push({ code: 'recording-id', message: 'recordingId no coincide' });
        if (response.planId !== plan.planId) errors.push({ code: 'plan-id', message: 'planId no coincide' });

        const planned = new Map(plan.files.map(file => [file.layer, file.path]));
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

        const resolvedGaps = new Set(response.resolutions.map(item => item.gapId));
        for (const gapId of plan.unresolvedGapIds) {
            if (!resolvedGaps.has(gapId)) errors.push({ code: 'unresolved-gap', message: `Gap no resuelto: ${gapId}` });
        }
        const traced = new Set(response.actionTrace.map(item => item.sequence));
        for (const action of scenario.actions) {
            if (!traced.has(action.sequence)) errors.push({ code: 'trace', message: `Acción ${action.sequence} sin trazabilidad` });
        }

        if (!errors.some(error => ['missing-layer', 'path', 'extra-layer'].includes(error.code))) {
            try {
                const preview = this.toPreview(response);
                const output = this.outputValidator.validate(preview);
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
                const platformLocatorFile = response.files.find(file => file.layer === 'locators');
                const requiredPlatforms = new Set<'android' | 'ios'>([scenario.platform]);
                if (platformLocatorFile) {
                    completeLocatorPlatforms(platformLocatorFile.content)
                        .forEach(platform => requiredPlatforms.add(platform));
                }
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
                        errors.push({
                            code: 'non-english-identifier',
                            message: `El ${symbol.kind} "${symbol.name}" está en español (${markers.join(', ')}). ` +
                                'El código del framework se nombra en inglés; el español solo va en el Gherkin.',
                        });
                    }
                }
                const screenPlan = plan.files.find(file => file.layer === 'screen');
                const stepsPlan = plan.files.find(file => file.layer === 'steps');
                if (screenPlan && stepsPlan) {
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
                    if (!alias) {
                        errors.push({
                            code: 'screen-alias',
                            message: `Steps debe importar el Screen Object como ${expected.instanceName}.`,
                            file: stepsPlan.path,
                        });
                    } else if (isGenericScreenAlias(alias) || alias !== expected.instanceName) {
                        errors.push({
                            code: 'screen-alias',
                            message: `Alias de Screen Object inválido: ${alias}. Esperado: ${expected.instanceName}.`,
                            file: stepsPlan.path,
                        });
                    }
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
                    for (const requiredSource of requiredSources) {
                        if (!importsFrom(screenContent, requiredSource)) {
                            errors.push({
                                code: 'framework-import-alias',
                                message: `Screen Object debe importar ${requiredSource}.`,
                                file: screenPlan.path,
                            });
                        }
                    }
                    if (!new RegExp(`class\\s+${expected.className}\\s+extends\\s+${contract.baseScreenClass}\\b`).test(screenContent)) {
                        errors.push({
                            code: 'screen-class-name',
                            message: `Clase Screen Object inválida. Esperado: ${expected.className}.`,
                            file: screenPlan.path,
                        });
                    }
                    if (!new RegExp(`export\\s+default\\s+new\\s+${expected.className}\\s*\\(`).test(screenContent)) {
                        errors.push({
                            code: 'screen-singleton-name',
                            message: `El singleton debe exportar new ${expected.className}().`,
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
                    const collision = catalog.stepDefinitions.find(existing =>
                        existing.expression === definition && existing.file !== stepsPath
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
                for (const proposed of responseLocatorValues(locatorFile?.content || '')) {
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
                repairContext: { attempt, errors: unique, affectedFiles },
            }),
        };
    }
}
