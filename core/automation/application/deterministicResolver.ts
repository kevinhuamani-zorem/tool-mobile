import crypto from 'crypto';
import path from 'path';
import {
    ActionResolution,
    DEFAULT_AGENT_OPERATIONAL_BUDGETS,
    AutomationScenario,
    GenerationPlan,
    GenerationRequest,
    ResolvedContext,
    UnresolvedContext,
    UnresolvedGap,
    AUTOMATION_PIPELINE_VERSION,
    AUTOMATION_SCHEMA_VERSION,
    normalizeAgentOperationalBudgets,
    RecordedStep,
    recordedStepContext,
    normalizeFeatureScope,
    declareElements,
    detectRepetition,
    candidateAllowlist,
} from '../contracts';
import { ReuseAnalyzer, SquadReuseCatalog, CodeGraph, importsOf, indexModuleImports, roundTrip } from '../../indexing';
import {
    canonicalStepExpression as canonicalStepExpressionShared,
    spanishTokens,
    translateToEnglish,
    translateToSlug,
    unknownTokens,
    selectorCannotIdentifyElement,
} from '../../shared';
import { frameworkContract, projectPaths } from '../../workspace';
import { ElementIdentityIndex } from '../domain/elementIdentity';
import type { BaselineSnapshotPort } from '../ports/baselineSnapshotPort';
import type { MemoryFragmentsPort } from '../ports/memoryFragmentsPort';
import { InteractionFragment, actionIdentity } from '../domain/memoryFragments';


export interface ResolverResult {
    scenario: AutomationScenario;
    plan: GenerationPlan;
    resolvedContext: ResolvedContext;
    unresolvedContext: UnresolvedContext;
    frameworkMetrics?: SquadReuseCatalog['frameworkMetrics'];
}

/**
 * Sin adaptador real por defecto (ver nota del constructor): construir
 * `DeterministicResolver` sin pasar `baselineSnapshot` explícito es un error
 * de programación, no un modo soportado. Los consumidores existentes pasan
 * por `automation/infrastructure/deterministicResolver.ts`, que sí inyecta
 * el adaptador basado en `fs`.
 */
function requireBaselineSnapshotPort(): BaselineSnapshotPort {
    throw new Error(
        'DeterministicResolver requiere un BaselineSnapshotPort explícito; ' +
        'usa automation/infrastructure/deterministicResolver.ts fuera de automation/application.',
    );
}

interface CatalogProvider {
    getCatalog(squad: string, platform: 'android' | 'ios', featureScope?: string): SquadReuseCatalog;
}

import {
    SELECTOR_ACTIONS,
    normalizeSelector,
    selectorAliases,
    words,
    similarity,
    slug,
    camel,
    genericName,
    actionIntent,
    compactTechnicalName,
    titleFromSlug,
} from './resolver/naming';
import {
    qaSentence,
    domainBehaviorText,
    intentBehaviorText,
    intentAssertionText,
    behaviorTemplate,
    domainAssertionText,
    assertionTemplate,
    inputParameterName,
} from './resolver/wording';
import {
    exactLocators,
    REUSE_SCOPE_ORDER,
    CANDIDATE_STABILITY_ORDER,
    normalizeStepText,
    existingStepFor,
    disambiguateStepText,
    frameworkCandidates,
} from './resolver/stepReuse';
import {
    likelyDynamicText,
    selectorPinsAssertedValue,
    selectorUsesFakeWildcard,
    conceptSimilarity,
    similarExistingMethods,
} from './resolver/selectorHeuristics';
import {
    REVIEW_METHOD_THRESHOLD,
    bestArtifactBundle,
    plannedFile,
    attachRepetitionDataTable,
    consolidateRepeatedValidationCycle,
} from './resolver/artifactPlanning';

export class DeterministicResolver {
    /**
     * `baselineSnapshot` no tiene default aquí: `application` no puede
     * importar `automation/infrastructure` (regla de capas del ADR-0001).
     * `automation/infrastructure/deterministicResolver.ts` provee el
     * adaptador real (`FsBaselineSnapshotAdapter`) para conservar el
     * constructor de 0/1 argumentos que ya usan los consumidores existentes.
     */
    constructor(
        private readonly catalog: CatalogProvider = new ReuseAnalyzer(),
        private readonly baselineSnapshot: BaselineSnapshotPort = requireBaselineSnapshotPort(),
    ) {}

    resolve(rawScenario: AutomationScenario, options: { memory?: MemoryFragmentsPort } = {}): ResolverResult {
        const memory = options.memory;
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(rawScenario.squad)) {
            throw new Error(`Squad inválido: ${rawScenario.squad}`);
        }
        const featureScope = normalizeFeatureScope(rawScenario.request.featureScope);
        const catalog = this.catalog.getCatalog(rawScenario.squad, rawScenario.platform, featureScope);
        const objectiveSlug = slug(rawScenario.objective, `caso-${rawScenario.recordingId.slice(-8)}`);
        // El vocabulario que ya usa el framework es ingles valido por definicion
        // (`yapero`, `tapp`, claves y metodos existentes): una palabra que ni el
        // diccionario ni el framework conocen no se da por buena en silencio.
        const frameworkTokens = new Set<string>([
            ...catalog.locators.flatMap(locator => words(locator.name)),
            ...(catalog.screenMethods || []).flatMap(method => words(method.name)),
        ]);
        // Sin el vocabulario del framework a proposito: un caso encadenado sin
        // commit deja nombres logicos aun no revisados en el catalogo, y si
        // contaran como ingles el segundo caso con el mismo objetivo caeria en
        // otra ruta de Feature que el primero. El nombre de archivo debe ser
        // estable entre grabaciones; solo diccionario e ingles habitual.
        const compactName = compactTechnicalName(rawScenario);
        const technicalName = slug(compactName, objectiveSlug);
        // El nombre de archivo va en ingles como el resto del framework
        // (show-balance-happy-path.feature), aunque la linea `Feature:` que
        // deriva del mismo texto se quede en espanol.
        const technicalSlug = translateToSlug(compactName, technicalName);
        const requestFileName = translateToSlug(rawScenario.request.fileName, slug(rawScenario.request.fileName, objectiveSlug));
        const requestLocatorModule = translateToSlug(rawScenario.request.locatorModule, slug(rawScenario.request.locatorModule, objectiveSlug));
        const requestFeatureName = slug(rawScenario.request.featureName, objectiveSlug);
        const autoGeneratedFeatureName = genericName(rawScenario.request.featureName) || requestFeatureName === objectiveSlug;
        const autoGeneratedFileName = genericName(rawScenario.request.fileName) || requestFileName === objectiveSlug;
        const autoGeneratedLocatorModule = genericName(rawScenario.request.locatorModule) || requestLocatorModule === objectiveSlug;
        const normalizedRequest: GenerationRequest = {
            ...rawScenario.request,
            featureScope,
            featureName: autoGeneratedFeatureName
                ? titleFromSlug(technicalName)
                : rawScenario.request.featureName,
            scenarioName: genericName(rawScenario.request.scenarioName)
                ? titleFromSlug(technicalName)
                : rawScenario.request.scenarioName,
            fileName: autoGeneratedFileName ? technicalSlug : requestFileName,
            locatorModule: autoGeneratedLocatorModule ? technicalSlug : requestLocatorModule,
            dataName: rawScenario.request.dataName?.trim() || 'Usuario QA Temporal',
        };
        const gaps: UnresolvedGap[] = [];

        // [visual-recorder] Regla ISTQB: un caso sin resultado esperado no es un
        // caso de prueba. Se emite como gap bloqueante y va primero para que el
        // builder lo vea antes de escribir nada: sin Then no hay nada que el
        // agente pueda proponer, solo tokens gastados en un caso invalido.
        if (!rawScenario.actions.some(step => /^VERIFICAR_/.test(step.action))) {
            gaps.push({
                id: 'gap-missing-assertion',
                type: 'missing-assertion',
                blocking: true,
                description:
                    'La grabacion no contiene ninguna verificacion, asi que el caso no tiene Then. ' +
                    'Sin resultado esperado solo se comprueba que los controles son tapeables, no que la funcionalidad haga lo que debe.',
                requiredOutput:
                    'Vuelve a grabar (o continua la grabacion) marcando la verificacion del resultado esperado ' +
                    'con VERIFICAR_TEXTO / VERIFICAR_EXISTE / VERIFICAR_NO_EXISTE sobre el elemento que prueba que la operacion ocurrio.',
            });
        }
        const usedNames = new Set<string>();
        // Locators que esta misma grabacion ya decidio crear, indexados por el
        // par (TypeLocator, valor). `exactLocator` solo mira el catalogo del
        // framework, asi que sin esto un boton pulsado cinco veces creaba cinco
        // locators distintos —filterMovementsButton, filterMovements, filter…—
        // apuntando todos a `~Botón de filtrar`. Es la misma regla de siempre:
        // el mismo par (TypeLocator, valor normalizado) representa el mismo
        // elemento, aunque el intent sugiera otro nombre.
        const createdByLocator = new Map<string, { name: string; sequence: number }>();
        const resolutions: ActionResolution[] = rawScenario.actions.map((step, index) => {
            const sequence = index + 1;
            const intent = actionIntent(step, sequence);
            const selector = normalizeSelector(step.selector, rawScenario.platform);
            if (!SELECTOR_ACTIONS.has(step.action)) {
                return {
                    sequence, action: step.action, intent, selector,
                    resolution: 'builtin', confidence: 1,
                    reason: 'La acción usa un helper del framework y no requiere locator.',
                };
            }
            const selectorChoices = candidateAllowlist(step, rawScenario.platform);
            const reuseMatches = selectorChoices.flatMap(candidate =>
                exactLocators(catalog, candidate.selector).map(match => ({ ...match, candidate }))
            ).sort((left, right) =>
                REUSE_SCOPE_ORDER[left.locator.scope as 'squad' | 'home']
                    - REUSE_SCOPE_ORDER[right.locator.scope as 'squad' | 'home']
                || CANDIDATE_STABILITY_ORDER[left.candidate.stability]
                    - CANDIDATE_STABILITY_ORDER[right.candidate.stability]
                || left.candidate.priority - right.candidate.priority
                || left.candidate.candidateId.localeCompare(right.candidate.candidateId)
                || left.locator.module.localeCompare(right.locator.module)
                || left.locator.name.localeCompare(right.locator.name)
            );
            const [reused] = reuseMatches;
            const materiallyTied = reused
                ? reuseMatches.filter(match =>
                    match.locator.scope === reused.locator.scope
                    && match.candidate.stability === reused.candidate.stability
                    && match.candidate.priority === reused.candidate.priority
                    && `${match.locator.module}#${match.locator.name}`
                        !== `${reused.locator.module}#${reused.locator.name}`
                )
                : [];
            if (reused && materiallyTied.length) {
                gaps.push({
                    id: `gap-locator-candidate-ambiguity-${sequence}`,
                    sequence,
                    type: 'qa-decision',
                    blocking: true,
                    description:
                        `La acción ${sequence} tiene candidatos verificados que coinciden con varios locators ` +
                        `del mismo rango: ${[reused, ...materiallyTied].map(match =>
                            `${match.locator.module}.${match.locator.name} (${match.candidate.candidateId})`
                        ).join(', ')}.`,
                    requiredOutput:
                        'El QA debe elegir explícitamente cuál locator existente representa el elemento; el agente no puede decidirlo.',
                });
            } else if (reused) {
                return {
                    sequence, action: step.action, intent,
                    resolution: 'reuse', locatorName: reused.locator.name,
                    selector: reused.locator.selector, confidence: 1,
                    matchedCandidateId: reused.candidate.candidateId,
                    matchedPrimaryCandidate: reused.candidate.primary,
                    source: {
                        file: reused.locator.file,
                        module: reused.locator.module,
                        scope: reused.locator.scope as 'squad' | 'home',
                    },
                    reason: `Mismo par TypeLocator/selector normalizado (${reused.strategy}) que ` +
                        `${reused.locator.module}.${reused.locator.name}; coincidencia causada por ` +
                        `${reused.candidate.candidateId}${reused.candidate.primary ? ' (primary)' : ' (backup)'}.`,
                };
            }
            const primary = selectorChoices.find(candidate => candidate.primary);
            if (selector && primary) {
                const pair = roundTrip(primary.selector, rawScenario.platform);
                const identity = `${pair.type}\u0000${pair.value}`;
                const already = createdByLocator.get(identity);
                if (already) {
                    // Se conserva `create`: el locator es nuevo, solo que una
                    // sola vez. El generador colapsa las entradas por nombre.
                    return {
                        sequence, action: step.action, intent,
                        resolution: 'create', locatorName: already.name, selector: primary.selector,
                        confidence: 1,
                        reason: `Mismo par TypeLocator/selector normalizado (${pair.type}) que la accion ` +
                            `${already.sequence}: es el mismo elemento, no se duplica el locator.`,
                    };
                }
                // El intent lo escribe el QA en espanol; el nombre logico va en
                // ingles como el resto del codigo del framework.
                let locatorName = translateToEnglish(intent).name || camel(intent, `element${sequence}`);
                while (usedNames.has(locatorName)) locatorName = `${locatorName}${sequence}`;
                usedNames.add(locatorName);
                createdByLocator.set(identity, { name: locatorName, sequence });
                return {
                    sequence, action: step.action, intent,
                    resolution: 'create', locatorName, selector: primary.selector,
                    confidence: 1,
                    reason: `Selector primary verificado (${primary.candidateId}); se crea un locator lógico nuevo.`,
                };
            }
            const intentCandidate = catalog.locators
                .filter(locator => locator.scope === 'squad' || locator.scope === 'home')
                .map(locator => ({ locator, score: similarity(intent, locator.name) }))
                .sort((a, b) => b.score - a.score)[0];
            const gapId = `gap-action-${sequence}`;
            gaps.push({
                id: gapId,
                sequence,
                type: selector ? 'missing-intent' : 'missing-selector',
                description: selector
                    ? `La acción ${sequence} necesita una intención funcional estable.`
                    : `La acción ${sequence} requiere locator pero no tiene selector verificado.`,
                requiredOutput: intentCandidate?.score >= 0.8
                    ? `Confirmar reutilización de ${intentCandidate.locator.name} o proponer locator.`
                    : 'Proponer nombre lógico y selector usando únicamente evidencia puntual.',
            });
            return {
                sequence, action: step.action, intent, selector,
                resolution: 'unresolved', confidence: 0,
                gapId,
                reason: gaps[gaps.length - 1].description,
            };
        });

        rawScenario.actions.forEach((step, index) => {
            if (!/^VERIFICAR_/.test(step.action)) return;
            if (step.textAssertion) return; // El QA ya definió fuente y operador; no sustituirlos por inferencias.
            const pinned = selectorPinsAssertedValue(step);
            if (!likelyDynamicText(step.value) && !pinned) return;
            // La misma verificacion sobre el mismo elemento ya se decidio en
            // otro caso validado a 100: se replica esa decision y el gap nace
            // resuelto. El agente no vuelve a juzgarlo; el QA lo ve trazado.
            const remembered = memory?.recallGap(
                rawScenario.squad,
                'verification-semantics',
                actionIdentity(step, rawScenario.platform),
            );
            gaps.push({
                id: `gap-verification-${index + 1}`,
                sequence: index + 1,
                type: 'verification-semantics',
                description: pinned
                    ? `El selector de la acción ${index + 1} fija el mismo texto que valida ("${step.value}"): el locator dejaría de servir en cuanto cambie el dato.`
                    : `El texto grabado "${step.value}" parece dinámico.`,
                requiredOutput: pinned
                    ? 'Apunta el locator al contenedor del valor (id, accessibility id o relación estructural) y compara el texto contra el parámetro del Examples.'
                    : 'Validar existencia o contenido no vacío; usar igualdad exacta solo si el criterio de aceptación lo exige.',
                ...(remembered ? {
                    status: 'resolved' as const,
                    resolvedBy: 'memory' as const,
                    reason: `Decisión "${remembered.decision}" replicada desde la memoria del caso ${remembered.caseId || remembered.fingerprint.slice(0, 8)}: ${remembered.reason}`,
                } : {}),
            });
        });

        rawScenario.actions.forEach((step, index) => {
            if (!/^VERIFICAR_/.test(step.action)) return;
            if (step.textAssertion) return;
            if (!selectorCannotIdentifyElement(step.selector)) return;
            gaps.push({
                id: `gap-weak-assertion-${index + 1}`,
                sequence: index + 1,
                type: 'verification-semantics',
                description: `La acción ${index + 1} verifica con "${step.selector}", un XPath sin ningún ` +
                    'predicado: engancha el primer nodo de ese tipo, que existe en casi cualquier pantalla. ' +
                    'La aserción pasaría igual aunque el filtro no se haya aplicado.',
                requiredOutput: 'Aviso, no bloqueo: el selector grabado se conserva tal cual. Si el QA lo ' +
                    'eligió para iterar en código, refina la verificación dentro del Screen Object ' +
                    '(un predicado que distinga el resultado, o el texto del título del contenedor) y ' +
                    'explica en el Then qué prueba ese elemento. El locator grabado no se reemplaza.',
            });
        });

        rawScenario.actions.forEach((step, index) => {
            if (!selectorUsesFakeWildcard(step.selector)) return;
            gaps.push({
                id: `gap-selector-wildcard-${index + 1}`,
                sequence: index + 1,
                type: 'missing-selector',
                description: `El selector de la acción ${index + 1} usa un comodín que UiSelector no interpreta: "${step.selector}" busca ese asterisco de forma literal y nunca coincide.`,
                requiredOutput: 'Usa el texto exacto del nodo, o cambia a textContains/descriptionContains si de verdad hace falta una coincidencia parcial.',
            });
        });

        rawScenario.actions.forEach((step, index) => {
            if (step.action !== 'ESCRIBIR' || !/^<valor>$/i.test(step.value || '')) return;
            gaps.push({
                id: `gap-input-data-${index + 1}`,
                sequence: index + 1,
                type: 'test-input',
                description: `El valor funcional digitado por la acción ${index + 1} no está disponible en el recording.`,
                requiredOutput: 'Indicar el mismo valor utilizado durante la grabación; no inventarlo.',
            });
        });

        // Los nombres logicos salen de `camel(intent)`, y el intent lo escribe el
        // QA en espanol: `lista de movimientos` -> `listaDeMovimientos`. El
        // resolver no puede traducir, asi que propone y el agente renombra. Los
        // `reuse` quedan fuera: esos nombres ya viven en el framework.
        // Lo que el diccionario no supo traducir. Solo eso llega al agente: el
        // resto ya salio en ingles sin gastar un token.
        const createdNames = [...new Set(resolutions
            .filter(item => item.resolution === 'create' && item.locatorName)
            .map(item => item.locatorName as string))];
        const spanishNames = createdNames.filter(name => spanishTokens(name).length);
        // Los nombres de archivo y de modulo tambien terminan en ingles. Cuando
        // el QA los escribio a mano y el diccionario no supo traducirlos, no se
        // renombran por el (la ruta ya esta fijada en el plan): se avisa.
        const spanishFileNames = [...new Set([normalizedRequest.fileName, normalizedRequest.locatorModule])]
            .filter(name => spanishTokens(name).length || unknownTokens(name, frameworkTokens).length);
        const unknownByName = new Map(createdNames
            .filter(name => !spanishTokens(name).length)
            .map(name => [name, unknownTokens(name, frameworkTokens)] as const)
            .filter(([, unknown]) => unknown.length));
        if (spanishNames.length || unknownByName.size || spanishFileNames.length) {
            const unknownSummary = [...unknownByName]
                .map(([name, unknown]) => `${name} (${unknown.join(', ')})`);
            gaps.push({
                id: 'gap-english-naming',
                type: 'semantic-naming',
                description: [
                    spanishFileNames.length
                        ? 'El nombre de archivo o modulo de locators conserva palabras que el diccionario ' +
                          `no reconoce como ingles: ${spanishFileNames.join(', ')}. La ruta ya esta fijada ` +
                          'en el plan: no la cambies; el QA puede corregir el nombre en el formulario y ' +
                          'volver a preparar el paquete.'
                        : '',
                    spanishNames.length
                        ? 'Estos nombres logicos conservan palabras en espanol que no se pudieron ' +
                          `traducir automaticamente: ${spanishNames.join(', ')}.`
                        : '',
                    unknownSummary.length
                        ? 'Estos nombres contienen palabras que ni el diccionario ni el framework ' +
                          `reconocen: ${unknownSummary.join('; ')}. Si son ingles o vocabulario propio, ` +
                          'consérvalas; si son español, tradúcelas.'
                        : '',
                ].filter(Boolean).join(' '),
                requiredOutput: 'Renombralos a ingles y usa el mismo nombre en las tres capas (clave del ' +
                    'locator, getter y metodo del Screen Object). El selector y la decision reuse/create no ' +
                    'cambian, solo el nombre. El Gherkin sigue en espanol.',
            });
        }

        // Una espera fija es sincronizacion no determinista y el estandar la
        // prohibe (`driver.pause`/`browser.pause`). Cuando la accion siguiente
        // tiene locator, el generador la convierte en espera explicita sobre
        // ese elemento; cuando no lo tiene no hay nada a que anclarla.
        rawScenario.actions.forEach((step, index) => {
            if (step.action !== 'ESPERAR') return;
            const next = rawScenario.actions[index + 1];
            if (next?.selector) return;
            const sequence = index + 1;
            gaps.push({
                id: `gap-fixed-wait-${sequence}`,
                sequence,
                type: 'refinement',
                description:
                    `La accion ${sequence} es una espera fija y no hay una accion posterior con elemento ` +
                    'a la que anclarla. Una pausa por tiempo pasa o falla segun la carga del dispositivo.',
                requiredOutput:
                    'Indica que elemento deberia aparecer al terminar esa espera y capturalo, o elimina la ' +
                    'espera si el elemento siguiente ya la cubre. No se generara ninguna pausa por tiempo.',
            });
        });

        // Red de seguridad del contrato de locators: el par (TypeLocator, valor)
        // que se va a escribir tiene que reconstruir el selector grabado. Es
        // bloqueante porque un locator que provablemente no resuelve no es algo
        // que el agente pueda arreglar adivinando: hay que volver a capturarlo.
        // Solo los locators que este caso va a escribir. Un `reuse` apunta a un
        // valor que ya vive en el JSON, y ahi el tipo lo declara el getter del
        // Screen Object, no la sintaxis del valor: `"Ver todos"` pelado es ID
        // valido y XPath invalido a la vez, asi que reinferirlo daria un falso
        // positivo sobre codigo que ya funciona.
        const broken = resolutions
            .filter(resolution => resolution.resolution === 'create' && resolution.selector)
            .map(resolution => ({
                resolution,
                check: roundTrip(String(resolution.selector), rawScenario.platform),
            }))
            .filter(entry => !entry.check.ok);
        if (broken.length) {
            gaps.push({
                id: 'gap-locator-roundtrip',
                sequence: broken[0].resolution.sequence,
                type: 'missing-selector',
                blocking: true,
                description:
                    'Estos selectores no se pueden reconstruir con el contrato de locators del framework, ' +
                    'asi que el codigo generado no encontraria el elemento: ' +
                    broken.map(entry =>
                        `accion ${entry.resolution.sequence} (${entry.resolution.selector}): ${entry.check.reason}`
                    ).join('; ') + '.',
                requiredOutput:
                    'Vuelve a capturar esos elementos eligiendo un candidato que el framework sepa componer ' +
                    `(${rawScenario.platform === 'ios'
                        ? 'ID por accessibility id, XPATH, PREDICATESTRING o CLASSCHAIN'
                        : 'ID por accessibility id, XPATH o ANDROID con UiSelector'}), ` +
                    'o corrige el selector a mano y vuelve a verificarlo contra el dispositivo.',
            });
        }

        // Duplicados por identidad de elemento, no por cadena de selector. Es lo
        // que dejo pasar el PR de Tapp: `~Tapp` y el `content-desc="Tapp"` de
        // home apuntan al mismo boton pero no se parecen como texto.
        const duplicateCandidates = new Set<string>();
        const identityIndex = new ElementIdentityIndex(
            catalog.locators.filter(locator => locator.scope === 'squad' || locator.scope === 'home')
        );
        const ownModule = `${rawScenario.squad}/${normalizedRequest.locatorModule}`;
        // Un locator que aparece en varias acciones se revisa una vez: cinco
        // copias del mismo consejo solo gastan contexto del agente.
        const reviewed = new Set<string>();
        for (const resolution of resolutions) {
            if (resolution.resolution !== 'create' || !resolution.selector) continue;
            if (resolution.locatorName && reviewed.has(resolution.locatorName)) continue;
            if (resolution.locatorName) reviewed.add(resolution.locatorName);
            const platformValue = (candidate: { androidSelector: string; iosSelector: string }) =>
                rawScenario.platform === 'ios' ? candidate.iosSelector : candidate.androidSelector;
            const matches = identityIndex
                .find(resolution.selector, candidate => candidate.module === ownModule)
                // Primero los que ya sirven en esta plataforma: reutilizarlos es
                // un cambio de una linea. Los vacios exigen completarlos antes.
                .sort((a, b) => Number(Boolean(platformValue(b))) - Number(Boolean(platformValue(a))));
            if (!matches.length) continue;
            const candidates = matches.slice(0, 4);
            // Lo que el gap ofrece queda tambien como dato, no solo como prosa:
            // el validador tiene que poder autorizar la reutilizacion que el
            // propio gap pide.
            resolution.reuseCandidates = candidates.map(candidate => ({
                file: candidate.file,
                module: candidate.module,
                name: candidate.name,
            }));
            resolution.completionTargets = candidates
                .filter(candidate => !platformValue(candidate))
                .flatMap(candidate => {
                    const block = rawScenario.platform === 'ios'
                        ? candidate.iosBlock
                        : candidate.androidBlock;
                    return block ? [{
                        file: candidate.file,
                        module: candidate.module,
                        name: candidate.name,
                        platform: rawScenario.platform,
                        block,
                    }] : [];
                });
            const omitted = matches.length - candidates.length;
            candidates.forEach(candidate =>
                duplicateCandidates.add(`${candidate.module}#${candidate.name}`));
            const gapId = `gap-duplicate-element-${resolution.sequence}`;
            resolution.gapId = resolution.gapId || gapId;
            gaps.push({
                id: gapId,
                sequence: resolution.sequence,
                type: 'semantic-naming',
                description:
                    `La accion ${resolution.sequence} crearia "${resolution.locatorName}" con el selector ` +
                    `${resolution.selector}, pero ya existen locators que fijan el mismo valor: ` +
                    candidates.map(candidate =>
                        `${candidate.module}.${candidate.name} (${candidate.scope}, "${candidate.sharedValue}"` +
                        `${candidate.androidSelector ? '' : ', sin valor Android'})`
                    ).join('; ') +
                    (omitted ? ` y ${omitted} mas.` : '.'),
                requiredOutput:
                    'Comprueba si alguno es el mismo elemento. Si lo es, reutilizalo en vez de crear otra ' +
                    'fuente de verdad. Si son elementos distintos que comparten el texto, explica en que ' +
                    'se diferencian y conserva el locator nuevo.' +
                    // Adoptar una clave vacia en la plataforma grabada deja el
                    // getter resolviendo a "" y el caso falla al ejecutar, no al
                    // generar. La salida es rellenarla, no duplicar el elemento.
                    (candidates.some(candidate => !platformValue(candidate))
                        ? ' Los candidatos sin valor en ' + rawScenario.platform + ' no se adoptan tal cual: ' +
                          'para usarlos hay que rellenar su hueco declarandolo en `completions`, por ejemplo ' +
                          candidates.filter(candidate => !platformValue(candidate)).slice(0, 2).map(candidate =>
                              `{ "file": "${candidate.file}", "name": "${candidate.name}", ` +
                              `"platform": "${rawScenario.platform}", "sequence": ${resolution.sequence} }`
                          ).join(' , ') +
                          '. El selector lo copia el recorder de esa accion: no lo escribas tu. Si la clave ' +
                          'no existe en el bloque de ' + rawScenario.platform + ', ese modulo no declara el ' +
                          'elemento ahi y hay que crear el locator en el modulo de este caso.'
                        : ''),
            });
        }

        // Regla determinística: cuando hay ciclo repetitivo, se sintetiza una
        // DataTable en el step funcional para exponer claramente las variantes
        // sin multiplicar escenarios ni depender del agente.
        const repetition = detectRepetition(rawScenario.actions);

        const scenarioRows: NonNullable<GenerationRequest['scenarioRows']> = [{
            keyword: 'Given',
            text: 'el usuario <username> inicia sesión en Yape',
            status: 'reused',
            actions: [],
        }];
        const examples: Record<string, string> = {
            ...(normalizedRequest.examples || {}),
            username: normalizedRequest.dataName || 'Usuario QA Temporal',
        };
        const chunks: { assertion: boolean; entries: { step: RecordedStep; resolution: ActionResolution }[] }[] = [];
        rawScenario.actions.forEach((step, index) => {
            const assertion = /^VERIFICAR_/.test(step.action);
            const current = chunks[chunks.length - 1];
            if (!current || current.assertion !== assertion) chunks.push({ assertion, entries: [] });
            chunks[chunks.length - 1].entries.push({ step, resolution: resolutions[index] });
        });
        // Memoria de fragmentos: un tramo del bloque que otro caso validado a
        // 100 ya redacto (misma secuencia de elementos) se separa como fila
        // propia con ese wording y ese metodo; el resto del bloque sigue el
        // camino normal. Asi B = A + un paso hereda los steps de A y solo
        // redacta el paso nuevo.
        type Chunk = typeof chunks[number] & { memory?: InteractionFragment };
        const usedMemoryTexts = new Set<string>();
        const memoryChunks: Chunk[] = chunks.flatMap((chunk): Chunk[] => {
            const recalled = memory?.recallInteractions(
                rawScenario.squad,
                chunk.entries.map(entry => actionIdentity(entry.step, rawScenario.platform)),
                usedMemoryTexts,
            );
            if (!recalled) return [chunk];
            return recalled.map(segment => ({
                assertion: chunk.assertion,
                entries: chunk.entries.slice(segment.from, segment.to + 1),
                ...(segment.fragment ? { memory: segment.fragment } : {}),
            }));
        });
        const behaviorChunks = memoryChunks.filter(chunk => !chunk.assertion && !chunk.memory).length;
        const assertionChunks = memoryChunks.filter(chunk => chunk.assertion && !chunk.memory).length;
        let behaviorSeen = false;
        let assertionSeen = false;
        memoryChunks.forEach(chunk => {
            const intents = chunk.entries.map(entry => entry.resolution.intent);
            const parameterizedActions = chunk.entries.map(({ step, resolution }) => {
                if (step.action !== 'ESCRIBIR') return {
                    ...step,
                    sequence: resolution.sequence,
                    selector: resolution.selector || step.selector,
                    variableName: resolution.locatorName || step.variableName,
                    contextHint: recordedStepContext(step),
                };
                const parameter = inputParameterName(resolution.intent, resolution.sequence);
                examples[parameter] = /^<valor>$/i.test(step.value || '')
                    ? 'PENDIENTE_QA'
                    : (step.value || '');
                return {
                    ...step,
                    sequence: resolution.sequence,
                    value: `<${parameter}>`,
                    selector: resolution.selector || step.selector,
                    variableName: resolution.locatorName || step.variableName,
                    contextHint: recordedStepContext(step),
                };
            });
            const inputParameter = (parameterizedActions.find(action => action.action === 'ESCRIBIR')
                ?.value || '').match(/^<([A-Za-z_][A-Za-z0-9_]*)>$/)?.[1];
            const behavior = inputParameter && intents.some(intent => /yapear/i.test(intent))
                ? `el usuario busca el número <${inputParameter}> para yapear`
                // Con un solo bloque de comportamiento, el objetivo del QA ES
                // ese comportamiento; con varios no se puede repartir y se
                // vuelve a la plantilla.
                // Orden deliberado: la frase de dominio esta redactada a mano y
                // gana; si no aplica, las palabras del QA; la plantilla solo
                // cuando no hay ninguna de las dos.
                : domainBehaviorText(chunk.entries.map(entry => entry.step), intents, technicalName)
                    || (behaviorChunks === 1 ? qaSentence(rawScenario.objective) : undefined)
                    || intentBehaviorText(chunk.entries.map(entry => entry.step), intents)
                    || behaviorTemplate(technicalName);
            const assertionRow = domainAssertionText(intents)
                || (assertionChunks === 1 ? qaSentence(rawScenario.acceptanceCriteria) : undefined)
                || intentAssertionText(chunk.entries.map(entry => entry.step), intents)
                || assertionTemplate(technicalName);
            const wording: 'domain' | 'qa' | 'template' = chunk.assertion
                ? (domainAssertionText(intents) ? 'domain'
                    : assertionRow === assertionTemplate(technicalName) ? 'template' : 'qa')
                : (domainBehaviorText(chunk.entries.map(entry => entry.step), intents, technicalName) ? 'domain'
                    : behavior === behaviorTemplate(technicalName) ? 'template' : 'qa');
            const keyword = chunk.assertion
                ? (assertionSeen ? 'And' : 'Then')
                : (behaviorSeen ? 'And' : 'When');
            scenarioRows.push(chunk.memory ? {
                keyword,
                text: chunk.memory.text,
                status: 'missing',
                wording: 'memory',
                actions: parameterizedActions,
                ...(chunk.memory.screenMethod ? { methodName: chunk.memory.screenMethod } : {}),
                memory: {
                    caseId: chunk.memory.caseId,
                    ...(chunk.memory.screenMethod ? { screenMethod: chunk.memory.screenMethod } : {}),
                },
            } : {
                keyword,
                text: chunk.assertion ? assertionRow : behavior,
                status: 'missing',
                wording,
                actions: parameterizedActions,
            });
            if (chunk.assertion) assertionSeen = true;
            else behaviorSeen = true;
        });
        const usedCanonicals = new Set<string>();
        const uniqueScenarioRows = scenarioRows.map(row => {
            if (row.status !== 'missing') return row;
            const existing = existingStepFor(row, catalog, resolutions);
            if (existing) {
                usedCanonicals.add(canonicalStepExpressionShared(existing.text));
                return {
                    ...row,
                    text: existing.text,
                    status: 'reused' as const,
                    wording: 'domain' as const,
                    ...(existing.methodName ? { methodName: existing.methodName } : {}),
                };
            }
            // Una fila de memoria cuyo texto ya exista en el framework con otros
            // locators, o que se repita en este caso, se desambigua igual que
            // cualquier otra: reutilizar es adoptar el step, nunca colisionar.
            return { ...row, text: disambiguateStepText(
                row.text,
                usedCanonicals,
                catalog.stepDefinitions,
                technicalName,
                normalizedRequest.caseId,
            ) };
        });
        const consolidatedValidationRows = repetition
            ? consolidateRepeatedValidationCycle(
                uniqueScenarioRows,
                repetition,
                rawScenario.actions,
                resolutions,
                rawScenario.acceptanceCriteria,
            )
            : undefined;
        normalizedRequest.scenarioRows = consolidatedValidationRows
            || (repetition ? attachRepetitionDataTable(uniqueScenarioRows, repetition) : uniqueScenarioRows);
        normalizedRequest.examples = examples;
        const scenario: AutomationScenario = { ...rawScenario, request: normalizedRequest };
        const candidates = frameworkCandidates(catalog, scenario, resolutions);
        const reusable = gaps.length === 0 ? candidates.find(candidate =>
            Boolean(candidate.paths) && candidate.selectorCoverage === 1 && candidate.score >= 0.78
        ) : undefined;
        const existingCase = reusable?.paths ? {
            feature: reusable.feature,
            scenario: reusable.scenario,
            caseId: reusable.caseId,
            score: reusable.score,
            selectorCoverage: reusable.selectorCoverage,
            paths: reusable.paths,
        } : undefined;
        const reusableBundle = existingCase ? undefined : bestArtifactBundle(catalog, scenario, resolutions);
        const featurePrefix = featureScope ? `${scenario.squad}/${featureScope}` : scenario.squad;
        const reuseTarget = reusableBundle ? {
            reason: reusableBundle.reason,
            score: reusableBundle.score,
            ...(reusableBundle.bundle.steps ? { steps: reusableBundle.bundle.steps } : {}),
            screen: reusableBundle.bundle.screens[0],
            locators: reusableBundle.bundle.locators[0],
        } : undefined;
        // Cobertura de plataforma del modulo que se va a extender.
        //
        // Casi el 40% de las claves compartidas de este framework tienen una
        // plataforma vacia: un modulo escrito grabando en iOS y reutilizado
        // grabando en Android es el caso normal. Adoptar esas claves sin
        // rellenarlas deja el getter apuntando a "" y el caso falla en
        // ejecucion, no al generar. El bundle no se descarta —reutilizar sigue
        // siendo lo correcto— pero las claves vacias se ponen sobre la mesa.
        if (reuseTarget?.locators) {
            const targetModule = reuseTarget.locators
                .replace(/^resources\/locators\//, '')
                .replace(/\.locator\.json$/, '');
            const empty = catalog.locators
                .filter(locator => locator.module === targetModule)
                .filter(locator => {
                    const block = rawScenario.platform === 'ios' ? locator.iosBlock : locator.androidBlock;
                    const value = rawScenario.platform === 'ios' ? locator.iosSelector : locator.androidSelector;
                    // Sin bloque, el modulo ni siquiera declara esa plataforma:
                    // eso no se completa, se decide aparte.
                    return Boolean(block) && !value;
                })
                .map(locator => locator.name);
            if (empty.length) {
                gaps.push({
                    id: 'gap-platform-coverage',
                    type: 'missing-selector',
                    blocking: true,
                    description:
                        `El modulo ${targetModule} que este caso extiende tiene ${empty.length} clave(s) ` +
                        `sin valor en ${rawScenario.platform}: ${empty.join(', ')}. ` +
                        'Adoptar una de ellas sin rellenarla deja el getter apuntando a "" y el caso ' +
                        'falla al ejecutar, no al generar.',
                    requiredOutput:
                        'Si adoptas alguna de esas claves, declara su relleno en `completions` de la ' +
                        'respuesta: `{ file, name, platform, sequence }`, donde `sequence` es la accion ' +
                        'de la grabacion que capturo ese elemento. El selector lo copia el recorder de ' +
                        'esa accion — no lo escribas tu. Si ninguna corresponde a un elemento que ' +
                        'grabaste, no la adoptes: crea el locator en el modulo de este caso.',
                });
            }
        }
        if (reuseTarget && !gaps.some(gap => gap.id === 'gap-extend-existing-artifacts')) {
            gaps.push({
                id: 'gap-extend-existing-artifacts',
                type: 'semantic-naming',
                description: 'El caso debe extender artefactos existentes relacionados en vez de crear duplicados.',
                requiredOutput: 'Conservar el contenido existente y agregar únicamente definitions, methods y locators faltantes.',
            });
        }
        const files = existingCase ? [
            plannedFile('feature', existingCase.paths.feature, 'update', this.baselineSnapshot),
            plannedFile('steps', existingCase.paths.steps, 'update', this.baselineSnapshot),
            plannedFile('screen', existingCase.paths.screen, 'update', this.baselineSnapshot),
            plannedFile('locators', existingCase.paths.locators, 'update', this.baselineSnapshot),
        ] : [
            // Un Feature que ya existe en esa ruta (otro caso con el mismo
            // objetivo, normalmente sin commitear) se amplia con un Scenario
            // mas; crearlo lo pisaria y el caso anterior desapareceria.
            plannedFile(
                'feature',
                `features/yape-features/${featurePrefix}/${normalizedRequest.fileName}.feature`,
                this.baselineSnapshot.read(`features/yape-features/${featurePrefix}/${normalizedRequest.fileName}.feature`).exists
                    ? 'update'
                    : 'create',
                this.baselineSnapshot,
            ),
            plannedFile('steps', reuseTarget?.steps || `features/yape-steps-definitions/${scenario.squad}/${normalizedRequest.fileName}.steps.ts`, reuseTarget?.steps ? 'update' : 'create', this.baselineSnapshot),
            plannedFile('screen', reuseTarget?.screen || `screenobjects/${scenario.squad}/${normalizedRequest.locatorModule}.screen.ts`, reuseTarget?.screen ? 'update' : 'create', this.baselineSnapshot),
            plannedFile('locators', reuseTarget?.locators || `resources/locators/${scenario.squad}/${normalizedRequest.locatorModule}.locator.json`, reuseTarget?.locators ? 'update' : 'create', this.baselineSnapshot),
        ];
        // El módulo target ya puede cubrir la intención: reutilizar el método
        // existente evita el duplicado semántico dentro del mismo Screen Object.
        if (reuseTarget?.screen) {
            for (const resolution of resolutions) {
                if (resolution.resolution !== 'create') continue;
                const [best] = similarExistingMethods(catalog, reuseTarget.screen, resolution);
                if (!best || best.score < REVIEW_METHOD_THRESHOLD) continue;
                resolution.existingMethod = best;
                const methodLocators = catalog.locators.filter(locator =>
                    best.locatorKeys.includes(locator.name)
                    && (catalog.screenMethods || []).some(method =>
                        method.file === best.file
                        && method.name === best.name
                        && method.locatorFiles.includes(locator.file)
                    )
                );
                if (methodLocators.length) {
                    const locatorScores = methodLocators.map(locator => ({
                        locator,
                        score: conceptSimilarity(resolution.intent, locator.name),
                    }));
                    const bestLocatorScore = Math.max(...locatorScores.map(item => item.score));
                    const relevantLocators = bestLocatorScore > 0
                        ? locatorScores
                            .filter(item => item.score >= bestLocatorScore - 0.001)
                            .map(item => item.locator)
                        : methodLocators;
                    // Una vez elegido un método existente, su propio grafo de
                    // getters es la allowlist. Conservar aquí otro candidato
                    // que comparte selector pero que el método no consume
                    // produce una traza imposible: el agente puede adoptarlo,
                    // pero tendría que reescribir el Screen para usarlo.
                    const offered = new Map<
                        string,
                        NonNullable<ActionResolution['reuseCandidates']>[number]
                    >();
                    for (const locator of relevantLocators) {
                        const candidate = {
                            file: locator.file,
                            module: locator.module,
                            name: locator.name,
                        };
                        offered.set(`${candidate.module}#${candidate.name}`, candidate);
                        duplicateCandidates.add(`${candidate.module}#${candidate.name}`);
                    }
                    resolution.reuseCandidates = [...offered.values()];
                }
                const gapId = `gap-duplicate-${resolution.sequence}`;
                resolution.gapId = gapId;
                gaps.push({
                    id: gapId,
                    sequence: resolution.sequence,
                    type: 'semantic-naming',
                    description: `${reuseTarget.screen} ya expone ${best.signature}, con un nombre parecido a ` +
                        `"${resolution.intent}" (${best.score}). El parecido es solo del nombre: ` +
                        'no dice nada sobre si su locator sirve para este caso.',
                    requiredOutput: `Usa ${best.name} como evidencia para comprobar si apunta al mismo elemento ` +
                        'con el mismo identificador y la misma estrategia. Si coincide, responde decision "reuse" y copia ' +
                        'como selectedCandidate uno de los locators exactos ofrecidos en reuseCandidates; ' +
                        'selectedCandidate nunca debe ser el metodo del Screen Object. Si no coincide, responde ' +
                        'decision "create" y conserva el locator nuevo con un nombre que lo distinga.',
                });
            }
        }
        // Elementos existentes que este caso toca: los que reutiliza, los que se
        // le proponen como duplicado y los del modulo que va a actualizar. El
        // catalogo completo son 700 claves y el paquete tiene 20 KB.
        const touched = new Set<string>([
            ...resolutions
                .filter(item => item.resolution === 'reuse' && item.source)
                .map(item => `${item.source!.module}#${item.locatorName}`),
            ...duplicateCandidates,
        ]);
        const targetScreen = files.find(file => file.layer === 'screen' && file.operation === 'update');
        const targetImports = targetScreen
            ? importsOf(path.join(projectPaths.frameworkRoot, targetScreen.path))
            : new Map<string, string>();

        // Acotar por modulo dejaba huecos: 14 de los 104 Screen Objects importan
        // mas de un JSON de locators, y el agente puede duplicar justamente los
        // que su pantalla ya usa desde otro modulo. El subgrafo los trae todos.
        const graph = new CodeGraph();
        if (targetScreen) {
            for (const node of graph.subgraphOf({ files: [targetScreen.path], depth: 3 }).nodes) {
                if (node.type !== 'locator') continue;
                const module = node.file
                    .replace(/^resources\/locators\//, '')
                    .replace(/\.locator\.json$/i, '');
                touched.add(`${module}#${node.name}`);
            }
        }
        const declarations = declareElements(
            catalog.locators.filter(locator => touched.has(`${locator.module}#${locator.name}`)),
            indexModuleImports(),
            targetImports,
            locator => {
                // Solo cuenta lo que queda FUERA del caso: que sus propios
                // archivos lo usen no es radio de impacto, es ruido que ademas
                // se paga en contexto.
                const own = new Set(files.map(file => file.path));
                const dependents = graph.dependentsOfLocator(locator.file, locator.name);
                return {
                    screens: dependents.screens.filter(file => !own.has(file)),
                    steps: dependents.steps.filter(file => !own.has(file)),
                };
            }
        );

        const planId = `plan-${crypto.createHash('sha256').update(JSON.stringify({
            recordingId: scenario.recordingId,
            fingerprint: scenario.fingerprint,
            resolutions,
            files,
            existingCase,
            reuseTarget,
        })).digest('hex').slice(0, 24)}`;
        const unresolved = resolutions.filter(item => item.resolution === 'unresolved').length;
        // Un gap que nace resuelto (memoria) queda en unresolved-context como
        // traza, pero no abre el paquete al agente ni exige resolucion.
        const openGaps = gaps.filter(gap => gap.status !== 'resolved');
        const plan: GenerationPlan = {
            schemaVersion: AUTOMATION_SCHEMA_VERSION,
            pipelineVersion: AUTOMATION_PIPELINE_VERSION,
            planId,
            recordingId: scenario.recordingId,
            fingerprint: scenario.fingerprint,
            deterministicCoverage: resolutions.length
                ? (resolutions.length - unresolved) / resolutions.length
                : 0,
            status: openGaps.length ? 'needs-agent' : 'deterministic',
            resolutions,
            files,
            existingCase,
            reuseTarget,
            ...(repetition ? { repetition } : {}),
            unresolvedGapIds: openGaps.map(gap => gap.id),
            budgets: normalizeAgentOperationalBudgets(DEFAULT_AGENT_OPERATIONAL_BUDGETS),
        };
        return {
            scenario,
            plan,
            frameworkMetrics: catalog.frameworkMetrics,
            resolvedContext: {
                schemaVersion: AUTOMATION_SCHEMA_VERSION,
                recordingId: scenario.recordingId,
                planId,
                reusedLocators: resolutions.filter(item => item.resolution === 'reuse'),
                elementDeclarations: declarations,
                frameworkAwareness: {
                    candidates,
                    exactStepDefinitions: catalog.stepDefinitions.filter(definition =>
                        uniqueScenarioRows.some(row => {
                            if (
                                selectorNormalization.canonicalStepExpression(definition.expression)
                                === selectorNormalization.canonicalStepExpression(row.text)
                            ) return true;
                            try {
                                return new RegExp(definition.expression).test(row.text);
                            } catch {
                                return false;
                            }
                        })
                    ).map(definition => ({
                        expression: definition.expression,
                        file: definition.file,
                        scope: definition.scope,
                    })),
                    selectorCollisions: resolutions.filter(item => item.resolution === 'reuse' && item.source)
                        .map(item => ({
                            sequence: item.sequence,
                            locatorName: item.locatorName!,
                            file: item.source!.file,
                            module: item.source!.module,
                            scope: item.source!.scope,
                        })),
                    decision: existingCase ? 'reuse-existing' : reuseTarget ? 'extend-existing' : 'create-new',
                    reuseTarget,
                },
                frameworkContract: {
                    stepsOnlyOrchestrate: true,
                    screenExtendsBaseScreen: true,
                    sharedLocatorNameAcrossPlatforms: true,
                    allowedScopes: ['squad', 'home'],
                    ...(({ baseScreenClass, baseScreenImport, locatorFactoryImport, typeLocatorImport }) => ({
                        baseScreenClass, baseScreenImport, locatorFactoryImport, typeLocatorImport,
                    }))(frameworkContract(projectPaths.frameworkRoot)),
                },
            },
            unresolvedContext: {
                schemaVersion: AUTOMATION_SCHEMA_VERSION,
                recordingId: scenario.recordingId,
                planId,
                gaps,
            },
        };
    }
}

export const selectorNormalization = {
    normalizeSelector,
    selectorAliases,
    normalizeStepText,
    canonicalStepExpression: canonicalStepExpressionShared,
    slug,
    camel,
};
