import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
    AgentGeneratedFile,
    AutomationAgentResponse,
    AUTOMATION_AGENT_RESPONSE_SCHEMA_VERSION,
    AutomationPackageResult,
    AutomationScenario,
    DEFAULT_AGENT_EXECUTION_MODE,
    DEFAULT_AGENT_OPERATIONAL_BUDGETS,
    GenerationPlan,
    normalizeAgentOperationalBudgets,
    ResolvedContext,
    UnresolvedContext,
    UnresolvedGap,
    FRAMEWORK_CONTEXT_QUERIES,
} from '../contracts';
import { AutomationMemory } from '../application/automationMemory';
import { AutomationResponseValidator } from '../../validation';
import { DeterministicResolver, ResolverResult, selectorNormalization } from './deterministicResolver';
import {
    domainTag,
    executionTag,
    FwkMobileGenerator,
    GeneratedPreview,
    ReusedLocator,
    scenarioRowMethodName,
} from '../../generation';
import { locatorImportIdentifier, screenObjectNames, signatureHint } from '../contracts';
import { frameworkHelpersOf } from '../../workspace';
import { ModuleDeclaration } from '../contracts';
import { FrameworkContract, frameworkContract } from '../../workspace';
import { projectPaths } from '../../workspace';
import { withGeneratedResponseMetadata } from '../../generation';
import {
    packageAutomationScenario,
    requireTrustedAutomationScenarioPackage,
} from '../domain/automationScenarioPackage';
import type { PackagedAutomationScenario } from '../domain/automationScenarioPackage';
import { AgentRunStore } from './agentRunStore';
import { deriveAutomationContextProjections, ProjectionInput } from '../domain/automationContextProjections';
import { emptyQueryResults, queryRequestsSchema } from '../domain/agentQueryContracts';
import { resolveAgentExecutionMode, resolvePackageArtifactPath } from './agentRuntimeGuards';
import { buildValidationRuleContractFromFile, defaultValidatorSourcePath } from '../../validation';
import { scenarioEnglishVocabulary } from '../domain/agentResponseEnglishNormalizer';
import { gapResolutionsSchema } from '../domain/gapResolutionContracts';
import { readJsonUtf8, readUtf8File, writeJsonUtf8, writeUtf8FileAtomic } from '../../shared';
import {
    AutomationPackageProvenance,
    createAutomationPackageProvenance,
    requireTrustedAutomationPackageSnapshot,
} from '../domain/automationPackageProvenance';
import { analyzeScenarioUiTextQuality } from '../domain/uiTextQualityObservations';

function writeJson(file: string, value: unknown): void {
    writeJsonUtf8(file, value);
}

/**
 * El paquete de automation es una salida derivada de la grabacion. Cada nueva
 * preparacion debe reconstruirlo: conservar respuestas, planes efectivos o
 * logs de una corrida anterior permite importar codigo que ya no corresponde
 * al scenario actual. El historial de refinamientos es auditoria inmutable y
 * se conserva salvo que el QA solicite una limpieza explicita.
 */
function resetAutomationPackage(
    packageDirectory: string,
    preserveHistory = true,
): void {
    if (!fs.existsSync(packageDirectory)) {
        fs.mkdirSync(packageDirectory, { recursive: true });
        return;
    }
    for (const entry of fs.readdirSync(packageDirectory, { withFileTypes: true })) {
        if (preserveHistory && entry.name === 'history' && entry.isDirectory()) continue;
        fs.rmSync(path.join(packageDirectory, entry.name), {
            recursive: entry.isDirectory(),
            force: true,
        });
    }
}

function writePackageArtifactJson(packageDirectory: string, fileName: string, value: unknown): void {
    writeJson(resolvePackageArtifactPath(packageDirectory, fileName), value);
}

function writeContextProjections(
    packageDirectory: string,
    input: ProjectionInput,
    runStore: AgentRunStore,
): void {
    const projections = deriveAutomationContextProjections(input);
    writeJson(path.join(packageDirectory, 'hints.json'), projections.hints);
    writeJson(path.join(packageDirectory, 'gaps.json'), projections.gaps);
    runStore.recordProjectionMetrics(projections.metrics);
}

function relative(file: string): string {
    return path.relative(projectPaths.frameworkRoot, file).replace(/\\/g, '/');
}

function baselineSymbols(layer: AgentGeneratedFile['layer'], content: string): string[] {
    if (layer === 'steps') {
        return [...content.matchAll(/(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g)]
            .map(match => match[1]);
    }
    if (layer === 'screen') {
        return [...content.matchAll(/public\s+async\s+([A-Za-z_$][\w$]*)\s*\(/g)]
            .map(match => match[1]);
    }
    if (layer === 'locators') {
        try {
            const document = JSON.parse(content) as Record<string, unknown>;
            return Object.entries(document).flatMap(([block, value]) =>
                block !== '_metadata' && value && typeof value === 'object' && !Array.isArray(value)
                    ? Object.keys(value as Record<string, unknown>).map(name => `${block}.${name}`)
                    : []
            );
        } catch {
            return [];
        }
    }
    return [];
}

function responseFromPreview(
    scenario: AutomationScenario,
    plan: GenerationPlan,
    preview: GeneratedPreview
): AutomationAgentResponse {
    const files: AgentGeneratedFile[] = [{
        layer: 'feature', path: relative(preview.featurePath), content: preview.featureContent,
    }];
    if (preview.stepPath && preview.stepContent) files.push({ layer: 'steps', path: relative(preview.stepPath), content: preview.stepContent });
    if (preview.screenPath && preview.screenContent) files.push({ layer: 'screen', path: relative(preview.screenPath), content: preview.screenContent });
    if (preview.locatorPath && preview.locatorContent) files.push({ layer: 'locators', path: relative(preview.locatorPath), content: preview.locatorContent });
    return {
        schemaVersion: AUTOMATION_AGENT_RESPONSE_SCHEMA_VERSION,
        recordingId: scenario.recordingId,
        planId: plan.planId,
        resolutions: [],
        actionTrace: scenario.request.scenarioRows?.filter(row => row.status === 'missing')
            .flatMap((row, index) =>
            (row.actions || []).map(action => ({
                sequence: action.sequence!,
                gherkinStep: `${row.keyword} ${row.text}`,
                screenMethod: scenarioRowMethodName(row, index),
                locatorName: plan.resolutions.find(item => item.sequence === action.sequence)?.locatorName,
            }))
        ) || [],
        files,
        assumptions: ['Salida producida completamente por el resolver determinista.'],
    };
}

function responseFromExistingFiles(
    scenario: AutomationScenario,
    plan: GenerationPlan
): AutomationAgentResponse {
    const files = plan.files.map(file => ({
        layer: file.layer,
        path: file.path,
        content: fs.readFileSync(path.join(projectPaths.frameworkRoot, file.path), 'utf-8'),
    }));
    return {
        schemaVersion: AUTOMATION_AGENT_RESPONSE_SCHEMA_VERSION,
        recordingId: scenario.recordingId,
        planId: plan.planId,
        resolutions: [],
        actionTrace: scenario.request.scenarioRows?.flatMap((row, index) =>
            (row.actions || []).map(action => ({
                sequence: action.sequence!,
                gherkinStep: `${row.keyword} ${row.text}`,
                screenMethod: row.status === 'missing'
                    ? scenarioRowMethodName(row, index)
                    : row.methodName,
                locatorName: plan.resolutions.find(item => item.sequence === action.sequence)?.locatorName,
            }))
        ) || [],
        files,
        assumptions: [
            `Caso equivalente reutilizado: ${plan.existingCase?.feature} / ${plan.existingCase?.scenario}.`,
            'Los cuatro archivos existentes se conservaron sin regeneración.',
        ],
    };
}

function responseSchema(): object {
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        required: ['schemaVersion', 'recordingId', 'planId', 'resolutions', 'actionTrace', 'files'],
        properties: {
            schemaVersion: { const: AUTOMATION_AGENT_RESPONSE_SCHEMA_VERSION },
            recordingId: { type: 'string' },
            planId: { type: 'string' },
            // Las formas van cerradas EN EL ESQUEMA, no solo en el validador.
            // El agente añadía campos propios (`reusedElement`, `candidateId`) y
            // se los rechazaba una regla que nunca se le publicó: gastaba su
            // unico intento de reparacion en algo que podia haber sabido antes.
            resolutions: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['gapId', 'decision'],
                    properties: {
                        gapId: { type: 'string' },
                        decision: { type: 'string' },
                        /** Por qué se decidió así; es la traza que lee el QA. */
                        reason: { type: 'string' },
                        needs: {
                            type: 'array',
                            minItems: 1,
                            maxItems: 6,
                            items: {
                                type: 'object',
                                required: ['query', 'args'],
                                properties: {
                                    query: { enum: FRAMEWORK_CONTEXT_QUERIES },
                                    args: { type: 'object' },
                                },
                                additionalProperties: false,
                            },
                        },
                    },
                    additionalProperties: false,
                },
            },
            actionTrace: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['sequence', 'gherkinStep'],
                    properties: {
                        sequence: { type: 'integer' },
                        gherkinStep: { type: 'string' },
                        screenMethod: { type: 'string' },
                        locatorName: { type: 'string' },
                    },
                    additionalProperties: false,
                },
            },
            files: {
                type: 'array',
                minItems: 4,
                maxItems: 4,
                items: {
                    type: 'object',
                    required: ['layer', 'path', 'content'],
                    properties: {
                        layer: { enum: ['feature', 'steps', 'screen', 'locators'] },
                        path: { type: 'string' },
                        content: { type: 'string' },
                    },
                    additionalProperties: false,
                },
            },
            completions: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['file', 'name', 'platform', 'sequence'],
                    properties: {
                        file: { type: 'string' },
                        name: { type: 'string' },
                        platform: { enum: ['android', 'ios'] },
                        sequence: { type: 'integer' },
                    },
                    additionalProperties: false,
                },
            },
            assumptions: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
    };
}

function frameworkApiDocument(
    contract: FrameworkContract,
    plan: Pick<GenerationPlan, 'files'>
): Record<string, unknown> {
    const prefixFor = (type: string): string => {
        const order: Array<'ios' | 'android'> = ['ios', 'android'];
        for (const platform of order) {
            const prefix = contract.locatorComposition?.[platform]?.[type]?.prefix;
            if (typeof prefix === 'string') return prefix;
        }
        return '';
    };
    return {
        textEncoding: {
            charset: 'UTF-8',
            unicodeNormalization: 'NFC',
            bom: false,
            preserveDiacritics: true,
        },
        helpers: frameworkHelpersOf(projectPaths.frameworkRoot),
        screenObjects: plan.files
            .filter(file => file.layer === 'screen')
            .map(file => {
                const names = screenObjectNames(file.path);
                return {
                    path: file.path,
                    className: names.className,
                    instanceName: names.instanceName,
                    importSource: `@screenobjects/${file.path.replace(/^screenobjects\//, '')}`,
                };
            }),
        locatorContract: {
            modules: plan.files
                .filter(file => file.layer === 'locators')
                .map(file => ({
                    path: file.path,
                    importSource: `@locators/${file.path.replace(/^resources\/locators\//, '')}`,
                    identifier: locatorImportIdentifier(file.path),
                })),
            accessPattern: {
                notation: 'dot-only',
                shape: '<LocatorIdentifier>.<moduleAndroid|moduleIos>.<locatorName>',
                validExample: 'LocatorMovements.movementsAndroid.showMovements',
                invalidExamples: [
                    'Locators["movementsAndroid"].showMovements',
                    'Locators.["showMovements"].locatorAndroid',
                ],
            },
            typeLocator: {
                symbol: contract.typeLocatorSymbol,
                import: contract.typeLocatorImport,
                exportKind: contract.typeLocatorExportKind,
                members: contract.typeLocatorMembers,
            },
            locatorProvider: {
                symbol: contract.locatorFactorySymbol,
                import: contract.locatorFactoryImport,
            },
            getElement: {
                parameterCount: contract.locatorSignature.parameterCount,
                platformOrder: contract.locatorSignature.platformOrder,
                signature: signatureHint({
                    typeLocatorSymbol: contract.typeLocatorSymbol,
                    platformOrder: contract.locatorSignature.platformOrder,
                }),
                arguments: contract.locatorSignature.platformOrder.map(platform => ({
                    platform,
                    type: `${contract.typeLocatorSymbol}.<${platform.toUpperCase()}>`,
                    value: `<valor ${platform}>`,
                })),
            },
            locatorComposition: contract.locatorComposition,
            constantsPrefixes: {
                ID: prefixFor('ID'),
                XPATH: prefixFor('XPATH'),
                ANDROID_LOCATOR: prefixFor('ANDROID'),
                PREDICATE_STRING: prefixFor('PREDICATESTRING'),
                CLASS_CHAIN: prefixFor('CLASSCHAIN'),
            },
        },
    };
}

function packageContractManifest(): Record<string, unknown> {
    return {
        schemaVersion: 1,
        integrityFiles: [
            'package-provenance.json',
            'application-receipt.json',
        ],
        contractFiles: [
            'agent-response.schema.json',
            'gap-resolutions.schema.json',
            'query-requests.schema.json',
            'framework-api.json',
            'english-vocabulary.json',
            'validation-contract.json',
            'screen-object-contract.js',
            'instructions.md',
        ],
        contentFiles: [
            'scenario.json',
            'qa-observations.json',
            'generation-plan.json',
            'hints.json',
            'gaps.json',
            'reuse-context.json',
            'collision-report.json',
            'query-results.json',
            'query-requests.json',
            'gap-resolutions.json',
            'resolved-context.json',
            'unresolved-context.json',
        ],
    };
}

function instructions(result: ResolverResult): string {
    const contract = frameworkContract(projectPaths.frameworkRoot);
    const queryRequestExample = {
        schemaVersion: '1.0',
        recordingId: result.scenario.recordingId,
        planId: result.plan.planId,
        requests: [
            {
                id: 'q-gap-duplicate-element-1-1',
                gapId: 'gap-duplicate-element-1',
                query: 'findExistingScreen',
                args: {
                    squad: result.scenario.squad,
                    symbol: 'lblSales',
                    limit: 5,
                },
            },
            {
                id: 'q-gap-duplicate-element-1-2',
                gapId: 'gap-duplicate-element-1',
                query: 'findExample',
                args: {
                    squad: result.scenario.squad,
                    term: 'ver ventas',
                    intent: 'boton de ventas',
                    limit: 3,
                },
            },
        ],
    };
    return `# Contrato del agente de automatización\n\n` +
        `Objetivo: resolver los gaps abiertos de \`gaps.json\`; en modo deterministic escribe \`gap-resolutions.json\` y el recorder genera \`agent-response.json\`.\n\n` +
        `Nota de modo: si RECORDER_GENERATION_MODE=deterministic, PASS 2 semántico escribe \`gap-resolutions.json\` y el recorder materializa \`agent-response.json\` de forma determinística.\n\n` +
        `Reglas:\n` +
        `- Prioriza exactitud y viabilidad del caso por encima de la rapidez.\n` +
        `- En deterministic solo escribe query-requests.json o gap-resolutions.json. No edites agent-response.json ni los archivos inmutables del paquete.\n` +
        `- Empieza por hints.json, gaps.json, generation-plan.json y scenario.json. resolved-context.json y unresolved-context.json se conservan solo por compatibilidad.\n` +
        `- NO SEARCH WITHOUT GAP: no solicites contexto si no hay un gap abierto; usa únicamente sus allowedQueries y respeta maxQueries. Un gap blocked-qa no se entrega al agente.\n` +
        `- Consulta reuse-context.json o collision-report.json solo cuando la evidencia de un hint/gap apunte a ellos.\n` +
        `- No explores el repositorio ni leas XML/capturas salvo que un gap lo pida explícitamente.\n` +
        `- CONTRATO (cerrado, siempre completo): ./agent-response.schema.json, ./gap-resolutions.schema.json, ./query-requests.schema.json, ./framework-api.json, ./english-vocabulary.json, ./validation-contract.json, ./screen-object-contract.js y ./instructions.md.\n` +
        `- CONTENIDO (bajo demanda por gap/query): ./scenario.json, ./generation-plan.json, ./hints.json, ./gaps.json, ./reuse-context.json, ./collision-report.json, ./query-results.json, ./resolved-context.json y ./unresolved-context.json.\n` +
        `- No uses búsquedas globales ni shell para descubrir archivos.\n` +
        `- Usa rutas RELATIVAS al directorio actual.\n` +
        `- Usa SIEMPRE rutas RELATIVAS al directorio actual: \`scenario.json\`, \`gaps.json\`, \`agent-response.schema.json\`. Nunca uses rutas absolutas como \`<ruta-absoluta>/scenario.json\`.\n` +
        `- Las rutas exactas que puedes leer son las de este manifiesto local.\n` +
        `- MANIFIESTO del paquete (ruta relativa -> propósito):\n` +
        `  - agent-response.schema.json -> schema obligatorio de la salida final.\n` +
        `  - query-requests.schema.json -> schema obligatorio de PASS 1 (query-requests.json).\n` +
        `  - gap-resolutions.schema.json -> schema obligatorio de PASS 2 semántico (gap-resolutions.json).\n` +
        `  - framework-api.json -> contrato de framework (helpers, locatorContract, screenObjects esperados).\n` +
        `  - english-vocabulary.json -> mapeo ES→EN de vocabulario del scenario (contextHint/objetivo/criterio) para nombrar en inglés sin adivinar.\n` +
        `  - validation-contract.json -> catálogo completo de reglas del validador con requisito y ejemplo.\n` +
        `  - screen-object-contract.js -> contrato ejecutable de Screen Object (nombres/estructura).\n` +
        `  - generation-plan.json -> rutas/capas/decisiones deterministas que no se cambian.\n` +
        `  - scenario.json -> acciones y contexto funcional de la grabación.\n` +
        `  - hints.json -> pistas de resolución por gap.\n` +
        `  - gaps.json -> gaps abiertos y allowedQueries por gap.\n` +
        `  - query-results.json -> resultados de queries aprobadas en PASS 1.\n` +
        `  - reuse-context.json -> evidencia de reuso y completionTargets permitidos.\n` +
        `  - collision-report.json -> colisiones de steps/selectores que prohíben duplicar.\n` +
        `  - resolved-context.json/unresolved-context.json -> compatibilidad y diagnóstico puntual.\n` +
        `  - query-requests.json -> lo escribes tú en PASS 1 cumpliendo query-requests.schema.json.\n` +
        `  - gap-resolutions.json -> (modo deterministic) lo escribes tú en PASS 2 semántico cumpliendo gap-resolutions.schema.json.\n` +
        `  - agent-response.json -> (modo legacy) lo escribes tú en PASS 2 cumpliendo agent-response.schema.json.\n` +
        `- EJEMPLO COMPLETO de \`query-requests.json\` válido (PASS 1):\n\`\`\`json\n${JSON.stringify(queryRequestExample, null, 2)}\n\`\`\`\n` +
        `- \`query-results.json\` tiene forma exacta: \`{ "schemaVersion": "1.0", "results": [ { "requestId": "q-gap-duplicate-element-4-1", "gapId": "gap-duplicate-element-4", "status": "resolved", "data": { "items": [ { "type": "screenObject", "name": "MovementsScreen", "path": "screenobjects/payment/movements.screen.ts" } ] } } ] }\`.\n` +
        `- Todo está en esta carpeta. Si falta información, no la busques afuera: declara ese gap unresolved en gap-resolutions.json con reason y needs para que el orquestador consulte.\n` +
        `- No existe una ruta al framework en tu contexto: usa framework-api.json, query-results.json y las referencias exactas de reuse-context.json.\n` +
        `- Si en PASS 2 te falta contexto del framework para cerrar un gap, decláralo en esa resolución unresolved con \`needs\`, por ejemplo: \`\"needs\":[{\"query\":\"findExistingStep\",\"args\":{\"squad\":\"${result.scenario.squad}\",\"term\":\"login\"}}]\`. El orquestador ejecuta esas queries y te reinvoca una sola vez con query-results.json actualizado.\n` +
        `- Para escribir archivos usa la herramienta de escritura del CLI. NO uses comandos de shell (cat, echo, redirecciones) para crear o modificar archivos.\n` +
        `- Conserva exactamente recordingId, planId y las cuatro rutas del plan.\n` +
        `- Los selectores verificados y las decisiones reuse/create del plan son definitivos. Los nombres logicos NO: si existe el gap gap-english-naming, renombralos a ingles conservando selector y decision.\n` +
        `- contextHint/elementIntent es solo una pista libre escrita por el QA para comprender el elemento. No la copies literalmente ni la conviertas uno-a-uno en un Step; sintetiza comportamientos declarativos usando el objetivo, criterio de aceptación y secuencia completa.\n` +
        `- No dupliques ninguna expresión o selector listado en collision-report.json; reutiliza su ruta y nombre lógico.\n` +
        `- REUSO: si TypeLocator + selector normalizado coinciden, reutiliza ruta y nombre lógico existentes; el nombre no define identidad.\n` +
        `- Reemplazo pedido por QA: decision:'replace-existing', selectedCandidate y replacement:{platform:'${result.scenario.platform}',sequence:<acción>}. Tipo/selector salen de la grabación y se conserva la otra plataforma.\n` +
        `- CORRECCIÓN: modifica gap-resolutions.json, nunca agent-response.json; al reimportar el recorder rematerializa y valida las cuatro capas.\n` +
        `- collision-report.json incluye \`reservedStepExpressions\`: expresiones ya ocupadas en el framework (forma canónica). Debes evitar regex/texto equivalente aunque cambie ^$, mayúsculas o agregues DataTable: DataTable NO desambigua definiciones idénticas.\n` +
        `- Si reuse-context.json identifica un caso equivalente, conserva sus cuatro rutas y contenido.\n` +
        `- Un locator existente puede tener su hueco vacio en ${result.scenario.platform}, que es la plataforma de esta grabacion (casi el 40% de las claves compartidas de este framework estan asi). Adoptar esa clave sin rellenarla deja el getter resolviendo a "" y el caso falla al ejecutar. Para adoptarla, declara el relleno en \`completions\`: \`{ "file": "<ruta del .locator.json>", "name": "<clave>", "platform": "${result.scenario.platform}", "sequence": <accion que capturo ese elemento> }\`. NO escribas el selector: lo copia el recorder de esa accion de la grabacion. Solo vale si la clave YA existe en el bloque de ${result.scenario.platform} y esta vacia; si la clave no esta en ese bloque, ese modulo no declara el elemento para esa plataforma y hay que crear el locator en el modulo de este caso.\n` +
        '- Cada completion debe coincidir exactamente con un `completionTargets` del plan; file, modulo, bloque, key, plataforma y secuencia son inmutables. El `screenMethod` trazado debe consumir ese getter importado. Una key homonima de otro archivo o bloque no autoriza el relleno.\n' +
        `- \`reuse-context.json\` trae \`elements\`: los locators que ya existen y que este caso toca, agrupados por modulo. Cada modulo dice su \`import\`, su \`identifier\` y sus \`groups\` (el bloque por plataforma); cada elemento su \`name\` y, por plataforma, \`type\`, \`value\` y la expresion \`reference\` lista para escribir. La clave del JSON es el \`name\`. Reutilizar significa importar ese modulo y usar \`reference\` en el getter; NUNCA copiar el \`value\` a un bloque nuevo. Reutilizar tambien implica adoptar el nombre existente. Si una plataforma trae \`status: "missing"\`, ese locator todavia no existe ahi: completalo en su archivo original en vez de duplicar el elemento. La lista es completa: si un elemento no esta, no existe en el squad ni en Home. Si un elemento trae \`usedBy\`, otros Screen Objects o Steps ya dependen de el: reutilizarlo esta bien, cambiar su valor los afecta.\n` +
        `- Si reuse-context.json contiene updateBaselines, abre únicamente su archivo reference dentro de baselines/, parte de ese contenido y añade solo lo faltante; no reemplaces ni borres APIs existentes.\n` +
        `- Una capa con operation "update" NO obliga a crear APIs: primero reutiliza los métodos, getters y claves existentes enumerados en generation-plan.json/reuse-context.json. Si cubren la acción, conserva esa capa sin cambios; agrega únicamente el símbolo que realmente falte.\n` +
        `- Steps solo orquestan; Screen Object extiende ${contract.baseScreenClass}; un nombre lógico sirve para Android/iOS.\n` +
        `- El alias importado del Screen Object debe derivarse de su archivo (ej.: movements.screen.ts → movementsScreen); nunca uses generatedScreen, screen, page, screenObject u obj.\n` +
        `- Imports obligatorios del Screen Object, resueltos del framework de esta grabacion. Copia estas lineas LITERALES, con sus llaves y su extension — ${contract.locatorFactorySymbol} es export por defecto y ${contract.typeLocatorSymbol} es export NOMBRADO, invertirlo no compila: \`import ${contract.baseScreenClass} from '${contract.baseScreenImport}';\` , \`import ${contract.locatorFactorySymbol} from '${contract.locatorFactoryImport}';\` , \`import { ${contract.typeLocatorSymbol} } from '${contract.typeLocatorImport}';\`. No uses rutas relativas ni el nombre que recuerdes de otro repo (la clase se llama ${contract.locatorFactorySymbol}, no LocatorFactory).\n` +
        `- \`getElement\` tiene UNA firma y no admite variantes: \`${signatureHint({ typeLocatorSymbol: contract.typeLocatorSymbol, platformOrder: contract.locatorSignature.platformOrder })}\`. Son ${contract.locatorSignature.parameterCount} argumentos SIEMPRE. Cada valor debe referenciar una clave del locator JSON para esa plataforma; nunca uses literales vacios en la llamada. Si una plataforma aun no tiene selector, deja \`''\` en su clave del JSON y referencia esa clave en \`getElement\`. El ${contract.locatorSignature.platformOrder[0]} va primero, y el tipo va antes que el valor — nunca al reves.\n` +
        `- Todo import de un .locator.json se escribe con alias y con atributo de tipo: \`import <Identificador> from '@locators/<squad>/<modulo>.locator.json' with { type: 'json' };\`. Sin el atributo Node lanza al cargar el JSON y el caso no corre. Aplica igual a los modulos reutilizados: nunca rutas relativas.\n` +
        `- REGLA DE ACCESO A LOCATORS: deriva el identificador del archivo (\`movements.locator.json\` → \`LocatorMovements\`) y usa exclusivamente notacion de punto: \`LocatorMovements.movementsAndroid.showMovements\` / \`LocatorMovements.movementsIos.showMovements\`. Estan prohibidos \`Locators["movementsAndroid"].showMovements\`, cualquier \`LocatorX["bloque"]\` y la forma invalida \`LocatorX.["locator"]\`. \`framework-api.json > locatorContract.modules\` entrega el identificador exacto; no lo adivines.\n` +
        `- TEXTO: conserva tildes y Unicode; escribe los JSON editables como UTF-8 NFC sin BOM. No conviertas \`ó\` en \`Ã³\`.\n` +
        `- \`reuse-context.json\` trae, por cada modulo, \`importLine\` y, por cada elemento, \`getter\`: son el import y el getter COMPLETOS, ya escritos con la firma y el atributo correctos. Copialos literalmente en vez de componerlos.\n` +
        `- candidateId y completionTargets del plan forman una allowlist verificada e inmutable: no inventes targets ni variantes fuera de esa lista.\n` +
        `- \`framework-api.json\` contiene tres contratos: \`helpers\` (BaseScreen y sus metodos), \`locatorContract\` (TypeLocator, LocatorProvider, firma/orden de getElement y composicion por estrategia) y \`screenObjects\` (por cada Screen Object del plan: path, className, instanceName e importSource exactos). Usa SOLO esos datos y NO busques esos simbolos en el framework con shell ni lecturas fuera de este paquete. Ojo con el helper correcto — por ejemplo \`scrollDown\` esta en \`gestureHelper\`, no en \`uiHelper\`. Si el caso necesita algo que ningun helper cubre, escribelo como un metodo del propio Screen Object para que quede reutilizable; nunca inventes una llamada al helper.\n` +
        `- Usa \`english-vocabulary.json\` para traducir vocabulario funcional a identificadores de código en inglés de forma consistente (headers de Examples, variables, métodos, getters y keys de locators).\n` +
        `- Cada getter del Screen Object resuelve el locator y devuelve \`$(locator)\`: \`public get x() { const locator = ${contract.locatorFactorySymbol}.getElement(...); return $(locator); }\`. Es el patron del framework y lo que revisa el PR. Importa de @wdio/globals solo lo que uses: \`$\` siempre que haya getters, \`expect\` si hay aserciones, \`browser\` solo si hay una llamada browser.; no dejes imports sin uso.\n` +
        `- Ninguna espera por tiempo: nada de browser.pause ni driver.pause, en ningun getter, metodo ni step. Toda espera va anclada a un elemento con this.uiHelper.waitForElementExistByLocator(elemento, true) antes de interactuar${
            contract.timeoutHelperSymbol
                ? `, y las verificaciones con this.uiHelper.waitForElementDisplayedAndExpect(elemento, timeout, 'mensaje'), donde \`timeout\` sale de \`const timeout: number = ${contract.timeoutHelperSymbol}();\` importado de ${contract.timeoutHelperImport}`
                : ''
        }. El Then tiene que AFIRMAR, no solo esperar.\n` +
        `- El archivo .locator.json contiene unicamente los bloques <modulo>Android y <modulo>Ios. Nada de \`_metadata\` ni ninguna otra clave: JSON no admite comentarios y el review lo marca.\n` +
        `- Incluye trazabilidad para las ${result.scenario.actions.length} acciones en orden.\n` +
        `- Tags del Feature, tal como los exige el estandar del repo: sobre la linea \`Feature:\` va el tag de dominio del producto (\`@${domainTag(result.scenario.squad)}\`); sobre el Scenario van el tag de funcionalidad (\`@${result.scenario.request.tag}\`), el tier de ejecucion (\`@${executionTag(result.scenario.request)}\`) y \`@${result.scenario.platform}\`. No omitas los tags de plataforma cuando haya cobertura en locators. Falta de tier bloquea el merge. El nombre del Scenario lleva [TC-N][Happy|Unhappy Path][AUTO-FRONT] y el caso un Then real.\n` +
        `- La grabacion solo exige cobertura ${result.scenario.platform.toUpperCase()}. No inventes selectores para la plataforma contraria: conserva sus mismas claves de locator y dejalas en \`''\` hasta completar otra ejecucion.\n` +
        `- Las filas de scenarioRows con status "reused" se copian LITERALES, caracter por caracter (tildes incluidas). Ya existen como step definition en el framework: si las reescribes o reemplazas su parametro por un literal, Cucumber las reporta como undefined al ejecutar. Ejemplo: \`Given el usuario <username> inicia sesión en Yape\` se copia tal cual, nunca con el nombre del usuario dentro.\n` +
        `- Todo <parametro> que dejes en un step obliga a \`Scenario Outline:\` y a una tabla \`Examples:\` con esa columna. Toma los valores de request.examples de scenario.json; si falta la columna, el parametro llega literal al step y no enlaza.\n` +
        `- Todo el codigo va en INGLES: metodos y getters del Screen Object, claves de locator, variables y parametros. El espanol se reserva para la prosa que lee el QA: la linea Feature, el nombre del Scenario y el texto de los steps. Ejemplo: el step "el usuario consulta todos sus movimientos" se resuelve con \`movementsScreen.openAllMovements()\`, nunca con \`elUsuarioConsultaTodosSusMovimientos()\`.\n` +
        `- Una fila de scenarioRows con \`wording: "template"\` es la unica cuyo texto salio de una plantilla con el slug tecnico, no de una frase redactada: reescribela en espanol declarativo usando el objetivo y el criterio de aceptacion. Las filas \`domain\` y \`qa\` ya estan redactadas, no las toques.\n` +
        `- Redacta Gherkin declarativo: describe intención, capacidad y resultado de negocio; no narres clicks, botones, campos, scrolls, swipes ni esperas.\n` +
        `- Agrupa acciones técnicas consecutivas dentro de un único step funcional. Varias secuencias pueden apuntar al mismo gherkinStep en actionTrace.\n` +
        `- Para cada acción create, actionTrace debe declarar locatorName y screenMethod. Ese método debe consumir el getter del locator (directamente o mediante una variable local); no uses selectores literales ni otro getter.\n` +
        `- Toda lectura y escritura se hace únicamente sobre los archivos del manifiesto, con rutas relativas dentro de esta carpeta.\n` +
        `- No ejecutes comandos de shell para validar ni para escribir; entrega \`agent-response.json\` usando solo herramientas nativas del CLI.\n`;
}

function regenerationInstructions(
    scenario: AutomationScenario,
    plan: GenerationPlan,
    refinement: string
): string {
    return `# Refinamiento de una automatización existente\n\n` +
        `Objetivo: mejorar el caso ya generado usando \`baseline-response.json\` y escribir una nueva versión completa en \`agent-response.json\`.\n\n` +
        `Empieza por hints.json y gaps.json. NO SEARCH WITHOUT GAP: no busques contexto sin un gap abierto y respeta allowedQueries/maxQueries.\n` +
        `Solicitud del QA: ${refinement}\n\n` +
        `Reglas:\n` +
        `- Prioriza exactitud y viabilidad del caso por encima de la rapidez.\n` +
        `- Solo escribe agent-response.json. No modifiques scenario.json, generation-plan.json, package-provenance.json ni application-receipt.json.\n` +
        `- Lee solo: baseline-response.json, generation-plan.json, scenario.json, reuse-context.json, collision-report.json y unresolved-context.json.\n` +
        `- Conserva exactamente recordingId=${scenario.recordingId}, planId=${plan.planId} y las cuatro rutas del plan.\n` +
        `- Parte del contenido de baseline-response.json; modifica únicamente lo necesario para el refinamiento.\n` +
        `- Usa un alias de dominio derivado del archivo Screen Object; están prohibidos generatedScreen, screen, page, screenObject y obj.\n` +
        `- Conserva los imports por alias que ya trae el baseline, nunca rutas relativas. browser solo se importa cuando se utiliza.\n` +
        `- No explores el repositorio ni cambies selectores verificados o decisiones deterministas.\n` +
        `- contextHint/elementIntent es contexto no vinculante del QA: no lo copies literalmente como Step; conserva o mejora la síntesis declarativa del comportamiento completo.\n` +
        `- Redacta Gherkin declarativo y agrupa clicks, scrolls, swipes y esperas dentro de steps funcionales.\n` +
        `- Conserva los tags de plataforma: @android si Android está completo y @ios si iOS está completo.\n` +
        `- Conserva literales las filas reused (login incluido) y su tabla Examples: son steps que ya existen en el framework.\n` +
        `- Los identificadores nuevos van en ingles (metodos, getters, locators, variables); no renombres los que ya existen en el baseline.\n` +
        `- Conserva una entrada actionTrace para cada secuencia; varias secuencias pueden compartir gherkinStep.\n` +
        `- Cada create conserva locatorName y screenMethod en actionTrace; el método trazado consume el getter correspondiente, sin selectores inline ni rutas alternativas.\n` +
        `- Mantén la firma de getElement con ambos lados (iOS/Android) y referencia claves del locator JSON en ambos argumentos de valor; nunca uses literales vacíos dentro de getElement.\n` +
        `- Los locators usan identificador semantico y notacion de punto: \`movements.locator.json\` se importa como \`LocatorMovements\` y se accede con \`LocatorMovements.movementsAndroid.showMovements\` / \`LocatorMovements.movementsIos.showMovements\`. No uses \`Locators["bloque"]\` ni \`LocatorX.["locator"]\`.\n` +
        `- Conserva tildes, eñes y demas Unicode del baseline/recording. Guarda \`agent-response.json\` en UTF-8 NFC sin BOM; no transliteres ni produzcas mojibake como \`Ã³\`.\n` +
        `- Incluye una resolución para gap-regeneration-refinement y entrega exactamente las cuatro capas.\n` +
        `- \`agent-response.json\` tiene forma CERRADA: la define agent-response.schema.json y no admite campos extra. En cada resolucion van \`gapId\`, \`decision\` y opcionalmente \`reason\`; en cada archivo solo \`layer\`, \`path\` y \`content\` — la operacion la fija el plan, no la repitas. Explica lo que quieras en \`reason\` o en \`assumptions\`, nunca en campos inventados.\n` +
        `- Si un gap de duplicado te ofrece locators existentes, adoptar uno de ESOS nombres esta permitido y el plan lo acepta: trazalo en actionTrace.locatorName. Adoptar cualquier otro nombre, o renombrar por tu cuenta un locator del plan, no.\n` +
        `- No escribas fuera de esta carpeta ni uses comandos de shell para validar/escribir. Entrega \`agent-response.json\` usando solo herramientas nativas del CLI.\n`;
}

/**
 * Escribe el verificador y, a su lado, el modulo de reglas del Screen Object.
 *
 * Se copia el compilado en vez de reescribir las reglas dentro del verificador:
 * duplicar logica entre el sandbox y el validador fue lo que dejo divergir el
 * resto del pipeline.
 */
function writeVerifier(packageDirectory: string): void {
    const contract = frameworkContract(projectPaths.frameworkRoot);
    writeUtf8FileAtomic(path.join(packageDirectory, 'verify-package.js'), verifierSource(contract));
    fs.copyFileSync(
        path.join(__dirname, '..', 'contracts', 'screenObjectContract.js'),
        path.join(packageDirectory, 'screen-object-contract.js')
    );
}

function verifierSource(contract: FrameworkContract): string {
    return `'use strict';\nconst FRAMEWORK_CONTRACT=${JSON.stringify({
        baseScreenClass: contract.baseScreenClass,
        locatorFactorySymbol: contract.locatorFactorySymbol,
        typeLocatorSymbol: contract.typeLocatorSymbol,
        typeLocatorImport: contract.typeLocatorImport,
        locatorSignature: contract.locatorSignature,
        helpers: frameworkHelpersOf(projectPaths.frameworkRoot).map(helper => ({
            property: helper.property,
            methods: helper.methods.map(method => method.name),
        })),
        requiredScreenImports: [
            contract.baseScreenImport,
            contract.locatorFactoryImport,
            contract.typeLocatorImport,
        ],
    })};` + String.raw`
const plan=require('./generation-plan.json');
const scenario=require('./scenario.json');
const frameworkApi=require('./framework-api.json');
const fs=require('fs');
const reuse=require('./reuse-context.json');
let response;
try{response=require('./agent-response.json')}catch(e){console.error('Falta agent-response.json');process.exit(1)}
const errors=[];
const warnings=[];
if(response.recordingId!==scenario.recordingId)errors.push('recordingId no coincide');
if(response.planId!==plan.planId)errors.push('planId no coincide');
for(const f of plan.files){const got=(response.files||[]).find(x=>x.layer===f.layer);if(!got)errors.push('Falta '+f.layer);else if(got.path!==f.path)errors.push('Ruta inválida '+got.path)}
for(const id of plan.unresolvedGapIds){if(!(response.resolutions||[]).some(x=>x.gapId===id))errors.push('Gap no resuelto '+id)}
for(const a of scenario.actions){if(!(response.actionTrace||[]).some(x=>x.sequence===a.sequence))errors.push('Acción sin traza '+a.sequence)}
const feature=(response.files||[]).find(x=>x.layer==='feature')?.content||'';
const steps=(response.files||[]).find(x=>x.layer==='steps')?.content||'';
const screen=(response.files||[]).find(x=>x.layer==='screen')?.content||'';
const locator=(response.files||[]).find(x=>x.layer==='locators')?.content||'';
const screenBaseline=(reuse.updateBaselines||[]).find(x=>x.layer==='screen');
let inheritedScreen='';try{if(screenBaseline)inheritedScreen=fs.readFileSync(screenBaseline.reference,'utf8')}catch(e){}
const screenSymbols=value=>[...String(value||'').matchAll(/(?:public|private|protected)\s+(?:async\s+)?(?:get\s+)?([A-Za-z_$][\w$]*)\s*\(/g)].map(x=>x[1]);
const inheritedScreenSymbols=new Set(screenSymbols(inheritedScreen));
const reusesScreenWithoutChanges=Boolean(screenBaseline)&&!screenSymbols(screen).some(name=>!inheritedScreenSymbols.has(name));
const unicodeProblems=value=>{const text=String(value||'');const result=[];if(/\uFFFD/.test(text))result.push('contiene U+FFFD (carácter de reemplazo)');if(/(?:Ã[\u0080-\u00BF]|Â[\u0080-\u00BF])/.test(text))result.push('contiene mojibake probable (por ejemplo, ó convertida en Ã³)');if(text!==text.normalize('NFC'))result.push('no está normalizado como NFC');return result};
for(const file of response.files||[]){for(const problem of unicodeProblems(file.content))errors.push('Codificación Unicode inválida en '+file.path+': '+problem+'. Conserva UTF-8 NFC sin BOM y los diacríticos del recording')}
let ts;
try{ts=require('typescript')}catch(e){ts=null}
const reportTypeScriptSyntax=(filePath,content)=>{
if(!ts||!content)return;
const kind=filePath.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS;
const source=ts.createSourceFile(filePath,content,ts.ScriptTarget.Latest,true,kind);
for(const diagnostic of source.parseDiagnostics||[]){
const message=ts.flattenDiagnosticMessageText(diagnostic.messageText,'\n');
const start=typeof diagnostic.start==='number'?diagnostic.start:0;
const pos=source.getLineAndCharacterOfPosition(start);
errors.push('Sintaxis TypeScript inválida: '+filePath+':'+(pos.line+1)+':'+(pos.character+1)+' '+message);
}}
const stepsPath=(response.files||[]).find(x=>x.layer==='steps')?.path||'steps.ts';
const screenPath=(response.files||[]).find(x=>x.layer==='screen')?.path||'screen.ts';
reportTypeScriptSyntax(stepsPath,steps);
reportTypeScriptSyntax(screenPath,screen);
try{const document=JSON.parse(locator);const active=scenario.platform;const hasActive=Object.entries(document).some(([name,value])=>name.toLowerCase().endsWith(active)&&value&&typeof value==='object'&&!Array.isArray(value));if(!hasActive)errors.push('Locators sin bloque '+active+' activo')}catch(e){}
for(const baseline of reuse.updateBaselines||[]){const proposed=(response.files||[]).find(x=>x.layer===baseline.layer)?.content||'';const content=fs.readFileSync(baseline.reference,'utf8');let tokens=[];if(baseline.layer==='steps')tokens=[...content.matchAll(/(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g)].map(x=>x[1]);else if(baseline.layer==='screen')tokens=[...content.matchAll(/public\s+async\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(x=>x[1]);else if(baseline.layer==='locators'){try{tokens=Object.entries(JSON.parse(content)).filter(([name,value])=>name!=='_metadata'&&value&&typeof value==='object'&&!Array.isArray(value)).flatMap(([,value])=>Object.keys(value))}catch(e){}}const missing=tokens.filter(token=>!proposed.includes(token));if(missing.length)errors.push('Update destructivo '+baseline.path+': '+missing.slice(0,5).join(', '))}
if(!/^\s*@[-A-Za-z0-9_]+/m.test(feature))errors.push('Feature sin tag válido');
const requiredPlatforms=new Set([scenario.platform]);
try{const document=JSON.parse(locator);for(const platform of ['android','ios']){const values=Object.entries(document).filter(([name,value])=>name.toLowerCase().endsWith(platform)&&value&&typeof value==='object'&&!Array.isArray(value)).flatMap(([,value])=>Object.values(value));if(values.length&&values.every(value=>typeof value==='string'&&value.trim()))requiredPlatforms.add(platform)}}catch(e){}
for(const platform of requiredPlatforms){if(!new RegExp('^\\s*@[^\\n]*@'+platform+'(?:\\s|$)','mi').test(feature))errors.push('Falta tag @'+platform)}
if(!/Scenario(?: Outline)?: \[TC-\d+\]\[(?:Happy|Unhappy) Path\]\[AUTO-FRONT\]/.test(feature))errors.push('Formato Scenario inválido');
if(!/^\s*Then\s+\S+/m.test(feature))errors.push('Scenario sin Then');
const normStep=v=>String(v||'').replace(/\s+/g,' ').trim();
const featureLines=[...feature.matchAll(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/gmi)].map(x=>x[1].trim());
const presentSteps=new Set(featureLines.map(normStep));
for(const row of (scenario.request&&scenario.request.scenarioRows)||[]){if(row.status!=='reused')continue;if(!presentSteps.has(normStep(row.text)))errors.push('Step reutilizado reescrito: "'+row.text+'". Copialo literal: lo resuelve un step definition que ya existe')}
const params=[...new Set(featureLines.flatMap(x=>[...x.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)].map(y=>y[1])))];
if(params.length){if(!/^\s*Scenario\s+Outline\s*:/mi.test(feature))errors.push('El Feature usa <'+params.join('>, <')+'> pero declara "Scenario:": debe ser "Scenario Outline:" con su tabla Examples');const cols=new Set();const flines=feature.split(/\r?\n/);for(let i=0;i<flines.length;i++){if(!/^\s*Examples\s*:/i.test(flines[i]))continue;const head=flines.slice(i+1).find(x=>x.trim().startsWith('|'));if(!head)continue;head.split('|').slice(1,-1).map(x=>x.trim()).filter(Boolean).forEach(x=>cols.add(x))}const missingCols=params.filter(x=>!cols.has(x));if(missingCols.length)errors.push('Faltan columnas en Examples para: <'+missingCols.join('>, <')+'>')}
const imperative=/^\s*(?:Given|When|Then|And|But)\s+.*(?:\b(?:hace|hacer|da|dar)\s+(?:clic|click)\b|\b(?:presiona|presionar|pulsa|pulsar|toca|tocar)\s+(?:el\s+)?(?:bot[oó]n|elemento|campo)\b|\b(?:scroll|swipe|desplaza|desplazar|arrastra|arrastrar)\b|\b(?:espera|esperar)\s+\d+\s*segundos?\b|\b(?:escribe|escribir|ingresa|ingresar)\s+(?:en\s+)?(?:el\s+)?campo\b)/gmi;
for(const match of feature.matchAll(imperative))errors.push('Gherkin técnico/imperativo: '+match[0].trim());
const normalizeText=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/<[^>]+>/g,'<param>').replace(/[^a-z0-9<>]+/g,' ').replace(/\s+/g,' ').trim();
const featureSteps=[...feature.matchAll(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/gmi)].map(match=>normalizeText(match[1]));
for(const action of scenario.actions){const hint=normalizeText(action.contextHint||action.elementIntent||action.description);if(hint&&featureSteps.includes(hint))errors.push('Pista contextual copiada literalmente como Step en acción '+action.sequence)}
const traceBySequence=new Map((response.actionTrace||[]).map(x=>[x.sequence,x.gherkinStep]));
const technical=new Set(['SCROLL_DOWN','SCROLL_UP','SWIPE','ESPERAR','SCREENSHOT']);
for(const action of scenario.actions.filter(x=>technical.has(x.action))){const current=traceBySequence.get(action.sequence);const grouped=current&&[action.sequence-1,action.sequence+1].some(x=>traceBySequence.get(x)===current);if(!grouped)errors.push('Acción técnica sin agrupar '+action.sequence+' ('+action.action+')')}
const defs=[...steps.matchAll(/(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g)].map(x=>x[1]);
const esFn=new Set(['el','la','los','las','un','una','unos','unas','del','al','de','por','para','con','se','su','sus','lo','que','cual','cuando','donde','como','ver','este','esta','estos','estas','ese','esa','esos','esas']);
const esDom=new Set(['usuario','usuarios','boton','botones','pantalla','pantallas','mostrar','muestra','muestran','todo','todos','todas','mas','filtrar','filtro','filtros','buscar','busca','validar','valida','verificar','verifica','ingresar','ingresa','seleccionar','selecciona','escribir','escribe','contenedor','pagina','cuenta','cuentas','saldo','monto','correo','clave','contrasena','numero','nombre','fecha','campo','campos','lista','listas','mensaje','mensajes','guardar','enviar','cerrar','abrir','continuar','aceptar','cancelar','siguiente','anterior','inicio','periodo','periodos','fallo','fallos','fila','filas','movimiento','movimientos','titulo','opcion','opciones','esperado','esperados','esperada','esperadas','deberia','debe','consulta','consultar']);
const esTokens=name=>{const t=[...new Set(String(name||'').replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').split(/[^a-z0-9]+/).filter(w=>w.length>1))];const d=t.filter(w=>esDom.has(w));const f=t.filter(w=>esFn.has(w));return(!d.length&&f.length<2)?[]:[...d,...f]};
const declared=[];
for(const m of screen.matchAll(/public\s+(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/g))declared.push(['metodo',m[1]]);
for(const m of screen.matchAll(/(?:private|protected|public)\s+get\s+([A-Za-z_$][\w$]*)\s*\(/g))declared.push(['getter',m[1]]);
for(const m of screen.matchAll(/(?:private|protected)\s+(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/g))declared.push(['miembro',m[1]]);
for(const body of [steps,screen]){for(const m of body.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*[=:]/g))declared.push(['variable',m[1]]);for(const m of body.matchAll(/\bfor\s*\(\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s+of\b/g))declared.push(['variable',m[1]])}
try{const doc=JSON.parse(locator);for(const [block,value] of Object.entries(doc)){if(block==='_metadata'||!value||typeof value!=='object'||Array.isArray(value))continue;for(const key of Object.keys(value))declared.push(['locator',key])}}catch(e){}
const inheritedNames=new Set();
for(const baseline of reuse.updateBaselines||[]){let content='';try{content=fs.readFileSync(baseline.reference,'utf8')}catch(e){continue}
for(const m of content.matchAll(/(?:public|private|protected)\s+(?:async\s+)?(?:get\s+)?([A-Za-z_$][\w$]*)\s*\(/g))inheritedNames.add(m[1]);
if(baseline.layer==='locators'){try{const doc=JSON.parse(content);for(const [block,value] of Object.entries(doc)){if(block==='_metadata'||!value||typeof value!=='object'||Array.isArray(value))continue;for(const key of Object.keys(value))inheritedNames.add(key)}}catch(e){}}}
const reportedEs=new Set();
for(const [kind,name] of declared){if(inheritedNames.has(name)||reportedEs.has(name))continue;const markers=esTokens(name);if(!markers.length)continue;reportedEs.add(name);warnings.push('Identificador en espanol ('+kind+'): '+name+' ['+markers.join(', ')+']. El codigo va en ingles; el espanol solo en el Gherkin')}
if(defs.some((x,i)=>defs.indexOf(x)!==i))errors.push('Definición Gherkin duplicada');
const methods=[...screen.matchAll(/public\s+async\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(x=>x[1]);
if(methods.some((x,i)=>methods.indexOf(x)!==i))errors.push('Método Screen Object duplicado');
const screenSources=[...screen.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)].map(x=>x[1]);
const usesLocators=/import\s+[A-Za-z_$][\w$]*\s+from\s+['"][^'"]+\.locator\.json['"]/.test(screen);
if(!reusesScreenWithoutChanges){for(const required of FRAMEWORK_CONTRACT.requiredScreenImports){if(!usesLocators&&required!==FRAMEWORK_CONTRACT.requiredScreenImports[0])continue;if(!screenSources.includes(required))errors.push('Falta el import del framework: '+required)}
if(usesLocators){for(const [symbol,label] of [[FRAMEWORK_CONTRACT.locatorFactorySymbol,'resolutor de locators'],[FRAMEWORK_CONTRACT.typeLocatorSymbol,'enum de estrategias']]){if(!new RegExp('\\b'+symbol+'\\b').test(screen))errors.push('El Screen Object no usa el '+label+' del framework: se llama '+symbol)}}}
// Reglas mecanicas del Screen Object. Se cargan del modulo compartido que se
// copia junto a este verificador: la misma implementacion que corre al importar
// la propuesta, no una segunda copia que pueda divergir.
// Cobertura de plataforma: reuse-context.json marca status missing en la
// plataforma sin valor. Si el Screen Object referencia esa clave y no hay un
// relleno declarado en completions, el getter resolveria a vacio en ejecucion.
const recordedPlatform=scenario.platform;const completionTarget=c=>{const targets=((plan.resolutions||[]).find(r=>r.sequence===c.sequence)?.completionTargets||[]).filter(t=>t.file===c.file&&t.name===c.name&&t.platform===c.platform&&String(t.block).toLowerCase().endsWith(c.platform));return targets.length===1?targets[0]:undefined};const authorizedCompletions=(response.completions||[]).map(c=>({completion:c,target:completionTarget(c)}));const declaredCompletions=new Set(authorizedCompletions.filter(x=>x.target&&x.target.platform===recordedPlatform).map(x=>x.target.file+'#'+x.target.platform+'#'+x.target.block+'#'+x.target.name));
for(const mod of (reuse.elements||[])){const block=(mod.groups||{})[recordedPlatform];const file=String(mod.import||'').replace(/^@locators\//,'resources/locators/');if(!block)continue;for(const el of (mod.elements||[])){const slot=(el.locators||{})[recordedPlatform];if(!slot||slot.status!=='missing')continue;const referenced=new RegExp('\\b'+mod.identifier+'\\s*\\.\\s*'+block+'\\s*\\.\\s*'+el.name+'\\b').test(screen);const identity=file+'#'+recordedPlatform+'#'+block+'#'+el.name;if(referenced&&!declaredCompletions.has(identity))errors.push('Cobertura de plataforma: '+mod.identifier+'.'+block+'.'+el.name+' no tiene valor en '+recordedPlatform+'. Rellenalo declarandolo en completions con la accion que lo capturo, o usa un locator del modulo de este caso.')}}
for(const x of authorizedCompletions){const c=x.completion;if(!x.target)errors.push('Completion no autorizado: '+c.file+'#'+c.name+' ('+c.platform+') accion '+c.sequence);if(!(scenario.actions||[]).some(a=>a.sequence===c.sequence&&a.selector))errors.push('completions apunta a la accion '+c.sequence+', que no capturo ningun elemento')}
if(!reusesScreenWithoutChanges)try{const {screenObjectProblems,locatorImportIdentifier}=require('./screen-object-contract.js');const expectedImports={};const expectedIdentifiers={};const locPlan=(plan.files||[]).find(x=>x.layer==='locators');if(locPlan&&locPlan.path){const spec='@locators/'+String(locPlan.path).replace(/^resources\/locators\//,'');const file=spec.split('/').pop();expectedImports[file]=spec;expectedIdentifiers[file]=locatorImportIdentifier(locPlan.path)}for(const mod of (reuse.elements||[])){if(mod&&mod.import){const file=String(mod.import).split('/').pop();expectedImports[file]=mod.import;expectedIdentifiers[file]=mod.identifier||locatorImportIdentifier(mod.import)}}const expectedScreen=(frameworkApi.screenObjects||[]).find(x=>x.path===screenPath)||{};for(const problem of screenObjectProblems(screen,{typeLocatorSymbol:FRAMEWORK_CONTRACT.typeLocatorSymbol,typeLocatorImport:FRAMEWORK_CONTRACT.typeLocatorImport,helpers:FRAMEWORK_CONTRACT.helpers,platformOrder:FRAMEWORK_CONTRACT.locatorSignature.platformOrder,parameterCount:FRAMEWORK_CONTRACT.locatorSignature.parameterCount,expectedImports,expectedIdentifiers,stepsContent:steps,expectedNames:{className:expectedScreen.className,instanceName:expectedScreen.instanceName,importSource:expectedScreen.importSource,baseScreenClass:FRAMEWORK_CONTRACT.baseScreenClass}}))errors.push(problem.message)}catch(e){errors.push('No se pudo verificar el contrato del Screen Object: '+e.message)}
const importSources=content=>[...content.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)].map(x=>x[1]);
for(const [label,content] of [['Steps',steps],['ScreenObject',screen]]){if(label==='ScreenObject'&&reusesScreenWithoutChanges)continue;const relative=importSources(content).filter(source=>source.startsWith('.'));if(relative.length)errors.push(label+' usa imports relativos: '+relative.join(', '))}
const importsBrowser=/import\s*\{[^}]*\bbrowser\b[^}]*\}\s*from\s*['"]@wdio\/globals['"]/.test(screen);
const usesBrowser=/\bbrowser\./.test(screen);
if(!reusesScreenWithoutChanges&&importsBrowser&&!usesBrowser)errors.push('ScreenObject importa browser pero no lo utiliza');
if(!reusesScreenWithoutChanges&&usesBrowser&&!importsBrowser)errors.push('ScreenObject utiliza browser sin importarlo desde @wdio/globals');
if(warnings.length){console.warn(warnings.join('\n'))}
if(errors.length){console.error(errors.join('\n'));process.exit(1)}console.log('PASS: contrato del paquete válido');
`;
}

/**
 * [visual-recorder] Se lanza cuando el resolver marca un gap `blocking`.
 * A diferencia del resto de gaps, este no viaja al agente: el paquete no llega
 * a escribirse y el QA tiene que corregir la grabacion primero.
 */
export class BlockingGapError extends Error {
    constructor(readonly gaps: UnresolvedGap[]) {
        super(gaps.map(gap => `${gap.description} ${gap.requiredOutput}`).join(' | '));
        this.name = 'BlockingGapError';
    }
}


/**
 * Traduce las resoluciones `reuse` a lo que el generador necesita para
 * referenciar el locator en su modulo de origen en vez de copiarlo.
 *
 * Sale de las mismas declaraciones que ya viajan al agente en
 * `reuse-context.json`: una sola fuente para los dos caminos.
 */
function reusedLocators(result: ResolverResult): ReusedLocator[] {
    const declarations = (result.resolvedContext.elementDeclarations || []) as ModuleDeclaration[];
    const byName = new Map<string, ReusedLocator>();
    for (const group of declarations) {
        for (const element of group.elements) {
            byName.set(`${group.module}#${element.name}`, {
                name: element.name,
                import: group.import,
                identifier: group.identifier,
                reference: {
                    android: element.locators.android?.reference,
                    ios: element.locators.ios?.reference,
                },
                type: {
                    android: element.locators.android?.type,
                    ios: element.locators.ios?.type,
                },
            });
        }
    }
    const own = result.plan.files.find(file => file.layer === 'locators')?.path;
    return result.plan.resolutions
        .filter(resolution => resolution.resolution === 'reuse' && resolution.source && resolution.locatorName)
        // Si el locator ya vive en el archivo que este caso escribe, no hay nada
        // que importar: se referencia con el bloque propio como siempre.
        .filter(resolution => resolution.source!.file !== own)
        .map(resolution => byName.get(`${resolution.source!.module}#${resolution.locatorName}`))
        .filter((item): item is ReusedLocator => Boolean(item));
}

export class AutomationPackageBuilder {
    constructor(
        private readonly resolver = new DeterministicResolver(),
        private readonly memory = new AutomationMemory(),
        private readonly generator = new FwkMobileGenerator(),
        private readonly validator = new AutomationResponseValidator(),
        private readonly frameworkRoot = projectPaths.frameworkRoot,
    ) {}

    requireTrustedScenarioPackage(
        recordingScenario: AutomationScenario,
        packagedScenario: PackagedAutomationScenario,
        packageDirectory?: string,
    ): AutomationScenario {
        const started = process.hrtime.bigint();
        try {
            const provenanceFile = packageDirectory
                ? path.join(packageDirectory, 'package-provenance.json')
                : '';
            if (provenanceFile && fs.existsSync(provenanceFile)) {
                const provenance = readJsonUtf8<AutomationPackageProvenance>(provenanceFile);
                const plan = readJsonUtf8<GenerationPlan>(
                    path.join(packageDirectory!, 'generation-plan.json')
                );
                return requireTrustedAutomationPackageSnapshot(
                    recordingScenario,
                    packagedScenario,
                    plan,
                    provenance,
                );
            }
            if (packageDirectory) {
                const statusFile = path.join(packageDirectory, 'status.json');
                const status = fs.existsSync(statusFile)
                    ? readJsonUtf8<Record<string, unknown>>(statusFile)
                    : {};
                if (status.state === 'generated') {
                    throw new Error(
                        'Esta automatización fue aplicada con una versión anterior que no generaba ' +
                        'package-provenance.json. Reprocesa la grabación una sola vez; las siguientes ' +
                        'correcciones podrán reimportarse sin volver a grabar.'
                    );
                }
            }
            const resolved = this.resolver.resolve(recordingScenario);
            if (packageDirectory) {
                const run = new AgentRunStore(packageDirectory);
                run.addDuration('resolverDurationMs', Number(process.hrtime.bigint() - started) / 1_000_000);
                run.recordFrameworkAccess(resolved.frameworkMetrics);
            }
            return requireTrustedAutomationScenarioPackage(resolved.scenario, packagedScenario);
        } catch (error) {
            if (packageDirectory) {
                const run = new AgentRunStore(packageDirectory);
                run.addDuration('resolverDurationMs', Number(process.hrtime.bigint() - started) / 1_000_000);
            }
            throw error;
        }
    }

    prepareRecordedScenario(
        recordingDirectory: string,
        cleanPackage = false
    ): AutomationPackageResult {
        const scenarioFile = path.join(recordingDirectory, 'scenario.json');
        if (!fs.existsSync(scenarioFile)) {
            throw new Error('La grabación no contiene scenario.json');
        }
        const scenario = readJsonUtf8<AutomationScenario>(scenarioFile);
        if (!scenario.actions.length) throw new Error('La grabación no contiene acciones para reprocesar');
        const packageDirectory = path.join(recordingDirectory, 'generation', 'automation');
        // prepare() siempre reinicia los artefactos de la corrida. La opcion
        // explicita de limpieza tambien descarta el historial de refinamientos.
        if (cleanPackage) resetAutomationPackage(packageDirectory, false);
        return this.prepare(scenario, recordingDirectory);
    }

    prepareRegeneration(
        recordingDirectory: string,
        refinement: string
    ): AutomationPackageResult {
        const packageDirectory = path.join(recordingDirectory, 'generation', 'automation');
        const read = <T>(name: string): T => readJsonUtf8<T>(path.join(packageDirectory, name));
        const normalizedRefinement = refinement.trim() ||
            'Realizar una revisión general del caso y mejorar claridad, mantenibilidad y consistencia sin cambiar su comportamiento.';
        if (!fs.existsSync(path.join(packageDirectory, 'agent-response.json'))) {
            throw new Error('La grabación no tiene una propuesta validada para regenerar');
        }
        const scenario = read<AutomationScenario>('scenario.json');
        const previousPlan = read<GenerationPlan>('generation-plan.json');
        const runStore = new AgentRunStore(packageDirectory);
        const baseline = read<AutomationAgentResponse>('agent-response.json');
        const previousValidation = fs.existsSync(path.join(packageDirectory, 'validation.json'))
            ? read<any>('validation.json')
            : this.validator.validate(scenario, previousPlan, baseline);
        if (!previousValidation.valid || previousValidation.qualityScore !== 100) {
            throw new Error('Solo se puede regenerar una propuesta previamente validada al 100%');
        }
        if (previousPlan.files.length !== 4 || previousPlan.files.some(file =>
            !fs.existsSync(path.join(this.frameworkRoot, file.path))
        )) {
            throw new Error('Las cuatro capas todavía no fueron importadas en el workspace');
        }

        const statusFile = path.join(packageDirectory, 'status.json');
        const previousStatus = fs.existsSync(statusFile) ? read<any>('status.json') : {};
        const iteration = Number(previousStatus.regenerationIteration || 0) + 1;
        const plan: GenerationPlan = {
            ...previousPlan,
            planId: `plan-${crypto.randomUUID()}`,
            status: 'regeneration',
            files: previousPlan.files.map(file => {
                const source = path.join(this.frameworkRoot, file.path);
                return {
                    ...file,
                    operation: 'update',
                    baseHash: crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
                };
            }),
            unresolvedGapIds: ['gap-regeneration-refinement'],
            budgets: normalizeAgentOperationalBudgets(previousPlan.budgets || DEFAULT_AGENT_OPERATIONAL_BUDGETS),
        };
        const revisedScenario: AutomationScenario = {
            ...scenario,
            revision: scenario.revision + 1,
        };
        const unresolvedContext = {
            schemaVersion: revisedScenario.schemaVersion,
            recordingId: revisedScenario.recordingId,
            planId: plan.planId,
            gaps: [{
                id: 'gap-regeneration-refinement',
                type: 'refinement',
                description: normalizedRefinement,
                requiredOutput: 'Actualizar las cuatro capas conservando rutas, selectores verificados y trazabilidad.',
            }],
        };
        const instructions = regenerationInstructions(revisedScenario, plan, normalizedRefinement);
        const serializedContext = [baseline, revisedScenario, plan, unresolvedContext]
            .reduce((total, value) => total + Buffer.byteLength(
                `${JSON.stringify(value, null, 2)}\n`,
                'utf-8'
            ), Buffer.byteLength(instructions, 'utf-8'));
        const retainedContext = ['reuse-context.json', 'collision-report.json']
            .reduce((total, name) => {
                const file = path.join(packageDirectory, name);
                return total + (fs.existsSync(file) ? fs.statSync(file).size : 0);
            }, 0);
        let contextBytes = serializedContext + retainedContext;
        // El límite es un objetivo de coste, no una regla: el alcance del caso lo
        // decide el QA y una grabación larga necesita más contexto. Se informa el
        // sobrecosto y se continúa.
        let contextWarning = contextBytes > plan.budgets.maxContextBytes
            ? `El contexto del refinamiento es de ${contextBytes} bytes y supera el objetivo de ` +
              `${plan.budgets.maxContextBytes}. El agente costará más tokens.`
            : undefined;

        const historyDirectory = path.join(
            packageDirectory,
            'history',
            `regeneration-${String(iteration).padStart(3, '0')}`
        );
        if (fs.existsSync(historyDirectory)) {
            throw new Error(`La iteración de regeneración ${iteration} ya existe`);
        }
        fs.mkdirSync(historyDirectory, { recursive: true });
        for (const name of [
            'scenario.json', 'generation-plan.json',
            'qa-observations.json',
            'package-provenance.json', 'application-receipt.json',
            'agent-response.json', 'validation.json', 'status.json', 'agent-run.json',
            'hints.json', 'gaps.json',
            'query-requests.json', 'query-results.json',
        ]) {
            const source = path.join(packageDirectory, name);
            if (fs.existsSync(source)) fs.copyFileSync(source, path.join(historyDirectory, name));
        }

        // La propuesta anterior ya quedo versionada. A partir de aqui la nueva
        // iteracion no puede heredar ningun output mutable de Copilot ni de una
        // validacion/reparacion anterior.
        resetAutomationPackage(packageDirectory, true);

        const packagedScenario = packageAutomationScenario(revisedScenario);
        writeJson(path.join(packageDirectory, 'scenario.json'), packagedScenario);
        writeJson(path.join(packageDirectory, 'qa-observations.json'), analyzeScenarioUiTextQuality(revisedScenario));
        writeJson(path.join(packageDirectory, 'generation-plan.json'), plan);
        const recordingScenarioFile = path.resolve(packageDirectory, '..', '..', 'scenario.json');
        const sourceRecording = fs.existsSync(recordingScenarioFile)
            ? readJsonUtf8<AutomationScenario>(recordingScenarioFile)
            : revisedScenario;
        writeJson(
            path.join(packageDirectory, 'package-provenance.json'),
            createAutomationPackageProvenance(sourceRecording, packagedScenario, plan),
        );
        const baselinesDirectory = path.join(packageDirectory, 'baselines');
        fs.mkdirSync(baselinesDirectory, { recursive: true });
        const updateBaselines = plan.files.map(file => {
            const source = path.join(this.frameworkRoot, file.path);
            const reference = `baselines/${file.layer}-${path.basename(file.path)}`;
            fs.copyFileSync(source, path.join(packageDirectory, reference));
            const symbols = baselineSymbols(file.layer, readUtf8File(source));
            return {
                layer: file.layer,
                path: file.path,
                baseHash: file.baseHash,
                reference,
                bytes: fs.statSync(source).size,
                preserve: {
                    count: symbols.length,
                    sample: symbols.slice(0, 12),
                },
            };
        });
        writeJson(path.join(packageDirectory, 'reuse-context.json'), {
            schemaVersion: revisedScenario.schemaVersion,
            recordingId: revisedScenario.recordingId,
            decision: 'regeneration',
            candidates: [],
            elements: [],
            updateBaselines,
        });
        writeJson(path.join(packageDirectory, 'collision-report.json'), {
            schemaVersion: revisedScenario.schemaVersion,
            recordingId: revisedScenario.recordingId,
            exactStepDefinitions: [],
            reservedStepExpressions: [],
            selectorCollisions: [],
            requiresReuse: false,
            blocking: false,
        });
        writeJson(path.join(packageDirectory, 'baseline-response.json'), baseline);
        writeJson(path.join(packageDirectory, 'unresolved-context.json'), unresolvedContext);
        writeJson(path.join(packageDirectory, 'agent-response.schema.json'), responseSchema());
        writeJson(
            path.join(packageDirectory, 'gap-resolutions.schema.json'),
            gapResolutionsSchema(plan.budgets.maxTotalQueries)
        );
        writeJson(
            path.join(packageDirectory, 'query-requests.schema.json'),
            queryRequestsSchema(plan.budgets.maxTotalQueries)
        );
        writeJson(
            path.join(packageDirectory, 'validation-contract.json'),
            buildValidationRuleContractFromFile(defaultValidatorSourcePath())
        );
        writeJson(path.join(packageDirectory, 'agent-package-manifest.json'), packageContractManifest());
        writePackageArtifactJson(packageDirectory, 'query-results.json', emptyQueryResults());
        writeJson(
            path.join(packageDirectory, 'framework-api.json'),
            frameworkApiDocument(frameworkContract(projectPaths.frameworkRoot), plan)
        );
        writeJson(
            path.join(packageDirectory, 'english-vocabulary.json'),
            scenarioEnglishVocabulary(revisedScenario)
        );
        writeUtf8FileAtomic(path.join(packageDirectory, 'instructions.md'), instructions);
        writeVerifier(packageDirectory);
        for (const stale of ['agent-response.json', 'gap-resolutions.json', 'query-requests.json', 'validation.json', 'repair-context.json', 'effective-generation-plan.json']) {
            const file = path.join(packageDirectory, stale);
            if (fs.existsSync(file)) fs.unlinkSync(file);
        }
        writeJson(statusFile, {
            ...previousStatus,
            recordingId: revisedScenario.recordingId,
            planId: plan.planId,
            state: 'ready-for-agent',
            mode: 'regeneration',
            agentExecutionMode: resolveAgentExecutionMode(process.env.RECORDER_AGENT_EXECUTION_MODE || DEFAULT_AGENT_EXECUTION_MODE),
            regenerationIteration: iteration,
            refinement: normalizedRefinement,
            preparedAt: new Date().toISOString(),
            budgets: plan.budgets,
        });
        runStore.start(revisedScenario.recordingId, plan.planId);
        runStore.setExecutionMode(resolveAgentExecutionMode(process.env.RECORDER_AGENT_EXECUTION_MODE || DEFAULT_AGENT_EXECUTION_MODE));
        const resolvedContextFile = path.join(packageDirectory, 'resolved-context.json');
        writeContextProjections(packageDirectory, {
            scenario: revisedScenario,
            plan,
            resolvedContext: fs.existsSync(resolvedContextFile) ? read<ResolvedContext>('resolved-context.json') : undefined,
            unresolvedContext: unresolvedContext as UnresolvedContext,
        }, runStore);
        contextBytes += ['hints.json', 'gaps.json'].reduce((total, name) =>
            total + fs.statSync(path.join(packageDirectory, name)).size, 0);
        contextWarning = contextBytes > plan.budgets.maxContextBytes
            ? `El contexto del refinamiento es de ${contextBytes} bytes y supera el objetivo de ` +
              `${plan.budgets.maxContextBytes}. El agente costará más tokens.`
            : undefined;
        runStore.setContextBytes(contextBytes);
        runStore.mark('ready-for-agent');
        return {
            packageDirectory,
            recordingId: revisedScenario.recordingId,
            planId: plan.planId,
            status: plan.status,
            deterministicCoverage: plan.deterministicCoverage,
            unresolvedGaps: 1,
            agentRequired: true,
            responseAvailable: false,
            contextBytes,
            contextWarning,
            ...(frameworkContract(projectPaths.frameworkRoot).warnings.length
                ? { frameworkWarnings: frameworkContract(projectPaths.frameworkRoot).warnings }
                : {}),
        };
    }

    prepare(scenario: AutomationScenario, recordingDirectory: string): AutomationPackageResult {
        const packageDirectory = path.join(recordingDirectory, 'generation', 'automation');
        // Aplica tanto a un caso nuevo como a una grabacion retomada. Se hace
        // antes del resolver para que incluso un fallo temprano invalide una
        // respuesta anterior y nunca pueda reimportarse por accidente.
        resetAutomationPackage(packageDirectory, true);
        const runStore = new AgentRunStore(packageDirectory);
        runStore.start(scenario.recordingId);
        runStore.setExecutionMode(resolveAgentExecutionMode(process.env.RECORDER_AGENT_EXECUTION_MODE || DEFAULT_AGENT_EXECUTION_MODE));
        const resolverStarted = process.hrtime.bigint();
        let result: ResolverResult;
        try {
            result = this.resolver.resolve(scenario);
            runStore.addDuration('resolverDurationMs', Number(process.hrtime.bigint() - resolverStarted) / 1_000_000);
            runStore.recordFrameworkAccess(result.frameworkMetrics);
            runStore.setPlan(result.plan.planId);
        } catch (error) {
            runStore.addDuration('resolverDurationMs', Number(process.hrtime.bigint() - resolverStarted) / 1_000_000);
            runStore.mark('resolver-failed', true);
            throw error;
        }
        // [visual-recorder] Un gap bloqueante corta antes de crear el paquete:
        // si se escribiera, el agente arrancaria igual y gastaria tokens en un
        // caso que el verificador va a rechazar mas adelante de todos modos.
        const blocking = result.unresolvedContext.gaps.filter(gap => gap.blocking);
        writeContextProjections(packageDirectory, result, runStore);
        if (blocking.length) {
            runStore.mark('blocked', true);
            throw new BlockingGapError(blocking);
        }
        try {
        fs.mkdirSync(packageDirectory, { recursive: true });
        const memoryHit = this.memory.find(result.scenario.fingerprint);
        if (memoryHit) result.plan.status = 'memory-hit';
        const packagedScenario = packageAutomationScenario(result.scenario);
        writeJson(path.join(packageDirectory, 'scenario.json'), packagedScenario);
        writeJson(path.join(packageDirectory, 'qa-observations.json'), analyzeScenarioUiTextQuality(result.scenario));
        writeJson(path.join(packageDirectory, 'generation-plan.json'), result.plan);
        writeJson(
            path.join(packageDirectory, 'package-provenance.json'),
            createAutomationPackageProvenance(scenario, packagedScenario, result.plan),
        );
        writeJson(path.join(packageDirectory, 'resolved-context.json'), result.resolvedContext);
        writeJson(path.join(packageDirectory, 'unresolved-context.json'), result.unresolvedContext);
        const baselinesDirectory = path.join(packageDirectory, 'baselines');
        fs.rmSync(baselinesDirectory, { recursive: true, force: true });
        const updateBaselines = result.plan.files
            .filter(file => file.operation === 'update')
            .map(file => {
                const source = path.join(this.frameworkRoot, file.path);
                const content = fs.readFileSync(source, 'utf-8');
                const reference = `baselines/${file.layer}-${path.basename(file.path)}`;
                const destination = path.join(packageDirectory, reference);
                fs.mkdirSync(path.dirname(destination), { recursive: true });
                fs.copyFileSync(source, destination);
                const symbols = baselineSymbols(file.layer, content);
                return {
                    layer: file.layer,
                    path: file.path,
                    baseHash: file.baseHash,
                    reference,
                    bytes: Buffer.byteLength(content, 'utf-8'),
                    preserve: {
                        count: symbols.length,
                        sample: symbols.slice(0, 12),
                    },
                };
            });
        const reuseCandidates = (result.resolvedContext.frameworkAwareness?.candidates || [])
            .slice(0, 3)
            .map(candidate => ({
                feature: candidate.feature,
                scenario: candidate.scenario,
                caseId: candidate.caseId,
                file: candidate.file,
                score: candidate.score,
                selectorCoverage: candidate.selectorCoverage,
                matchedSteps: candidate.matchedSteps.slice(0, 3),
                paths: candidate.paths,
            }));
        writeJson(path.join(packageDirectory, 'reuse-context.json'), {
            schemaVersion: result.resolvedContext.schemaVersion,
            recordingId: result.scenario.recordingId,
            decision: result.resolvedContext.frameworkAwareness?.decision || 'create-new',
            existingCase: result.plan.existingCase,
            reuseTarget: result.plan.reuseTarget,
            candidates: reuseCandidates,
            // Tipo, bloque, valor y expresión exacta de cada elemento existente
            // que el caso toca, agrupados por módulo: es lo que permite
            // referenciarlo en vez de copiar su valor a un módulo nuevo.
            elements: result.resolvedContext.elementDeclarations || [],
            updateBaselines,
        });
        writeJson(path.join(packageDirectory, 'collision-report.json'), {
            schemaVersion: result.resolvedContext.schemaVersion,
            recordingId: result.scenario.recordingId,
            exactStepDefinitions: result.resolvedContext.frameworkAwareness?.exactStepDefinitions || [],
            reservedStepExpressions: (result.resolvedContext.frameworkAwareness?.exactStepDefinitions || [])
                .map(item => ({
                    expression: item.expression,
                    canonical: selectorNormalization.canonicalStepExpression(item.expression),
                    file: item.file,
                    scope: item.scope,
                    reason: 'Expresión reservada en framework; una variante equivalente produce step ambiguo.',
                })),
            selectorCollisions: result.resolvedContext.frameworkAwareness?.selectorCollisions || [],
            requiresReuse: Boolean(result.resolvedContext.frameworkAwareness?.selectorCollisions?.length),
            blocking: !result.plan.existingCase && Boolean(
                result.resolvedContext.frameworkAwareness?.exactStepDefinitions?.length
            ),
        });
        writeJson(path.join(packageDirectory, 'agent-response.schema.json'), responseSchema());
        writeJson(
            path.join(packageDirectory, 'gap-resolutions.schema.json'),
            gapResolutionsSchema(result.plan.budgets.maxTotalQueries)
        );
        writeJson(
            path.join(packageDirectory, 'query-requests.schema.json'),
            queryRequestsSchema(result.plan.budgets.maxTotalQueries)
        );
        writeJson(
            path.join(packageDirectory, 'validation-contract.json'),
            buildValidationRuleContractFromFile(defaultValidatorSourcePath())
        );
        writeJson(path.join(packageDirectory, 'agent-package-manifest.json'), packageContractManifest());
        writePackageArtifactJson(packageDirectory, 'query-results.json', emptyQueryResults());
        writeJson(
            path.join(packageDirectory, 'framework-api.json'),
            frameworkApiDocument(frameworkContract(projectPaths.frameworkRoot), result.plan)
        );
        writeJson(
            path.join(packageDirectory, 'english-vocabulary.json'),
            scenarioEnglishVocabulary(result.scenario)
        );
        writeUtf8FileAtomic(path.join(packageDirectory, 'instructions.md'), instructions(result));
        writeVerifier(packageDirectory);
        for (const stale of ['agent-response.json', 'gap-resolutions.json', 'query-requests.json', 'validation.json', 'repair-context.json', 'effective-generation-plan.json']) {
            const file = path.join(packageDirectory, stale);
            if (fs.existsSync(file)) fs.unlinkSync(file);
        }

        let response: AutomationAgentResponse | undefined;
        let memoryVersion: number | undefined;
        if (memoryHit) {
            memoryVersion = memoryHit.entry.version;
            response = {
                ...memoryHit.response,
                recordingId: result.scenario.recordingId,
                planId: result.plan.planId,
            };
        } else if (result.plan.existingCase) {
            response = responseFromExistingFiles(result.scenario, result.plan);
        } else if (!result.plan.unresolvedGapIds.length) {
            // El camino sin agente tambien tiene que reutilizar: hasta ahora
            // copiaba el valor a su propio modulo, o sea que el duplicado lo
            // producia el propio recorder y nadie estaba ahi para notarlo.
            const preview = this.generator.preview(
                result.scenario.request,
                result.scenario.actions,
                reusedLocators(result)
            );
            response = responseFromPreview(result.scenario, result.plan, preview);
        }

        let validation;
        if (response) {
            if (!result.plan.existingCase) {
                response = withGeneratedResponseMetadata(response, result.scenario.createdAt);
            }
            writePackageArtifactJson(packageDirectory, 'agent-response.json', response);
            const validationStarted = process.hrtime.bigint();
            validation = this.validator.validate(result.scenario, result.plan, response);
            runStore.addDuration('validatorDurationMs', Number(process.hrtime.bigint() - validationStarted) / 1_000_000);
            writeJson(path.join(packageDirectory, 'validation.json'), validation);
            runStore.setResponseBytes(Buffer.byteLength(JSON.stringify(response), 'utf-8'));
        }
        writeJson(path.join(packageDirectory, 'status.json'), {
            recordingId: result.scenario.recordingId,
            planId: result.plan.planId,
            state: response ? (validation?.valid ? 'ready-for-review' : 'needs-repair') : 'ready-for-agent',
            agentExecutionMode: resolveAgentExecutionMode(process.env.RECORDER_AGENT_EXECUTION_MODE || DEFAULT_AGENT_EXECUTION_MODE),
            preparedAt: new Date().toISOString(),
            budgets: result.plan.budgets,
        });
        const contextBytes = [
            'scenario.json', 'generation-plan.json', 'hints.json', 'gaps.json',
            'reuse-context.json', 'collision-report.json',
            'instructions.md'
        ]
            .reduce((total, file) => total + fs.statSync(path.join(packageDirectory, file)).size, 0);
        // El presupuesto es un objetivo de coste, no una condición de correctitud:
        // una grabación larga necesita legítimamente más contexto. Lanzar dejaba el
        // paquete escrito a medias y bloqueaba al QA sin alternativa.
        const contextWarning = contextBytes > result.plan.budgets.maxContextBytes
            ? `El contexto del paquete es de ${contextBytes} bytes y supera el objetivo de ` +
              `${result.plan.budgets.maxContextBytes}. El agente costará más tokens; ` +
              `considera dividir la grabación en casos más cortos.`
            : undefined;
        runStore.setContextBytes(contextBytes);
        runStore.mark(response ? (validation?.valid ? 'ready-for-review' : 'needs-repair') : 'ready-for-agent');
        return {
            packageDirectory,
            recordingId: result.scenario.recordingId,
            planId: result.plan.planId,
            status: result.plan.status,
            deterministicCoverage: result.plan.deterministicCoverage,
            unresolvedGaps: result.plan.unresolvedGapIds.length,
            memoryVersion,
            agentRequired: !response,
            responseAvailable: Boolean(response),
            validation,
            contextBytes,
            contextWarning,
            ...(frameworkContract(projectPaths.frameworkRoot).warnings.length
                ? { frameworkWarnings: frameworkContract(projectPaths.frameworkRoot).warnings }
                : {}),
        };
        } catch (error) {
            runStore.mark('prepare-failed', true);
            throw error;
        }
    }
}
