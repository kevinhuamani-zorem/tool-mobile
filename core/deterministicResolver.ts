import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
    ActionResolution,
    AutomationScenario,
    FrameworkReuseCandidate,
    GenerationPlan,
    ResolvedContext,
    UnresolvedContext,
    UnresolvedGap,
    AUTOMATION_PIPELINE_VERSION,
    AUTOMATION_SCHEMA_VERSION,
} from './automationContracts';
import { GenerationRequest } from './fwkMobileGenerator';
import { ArtifactBundle, FeatureScenarioInfo, LocatorInfo, ReuseAnalyzer, SquadReuseCatalog } from './reuseAnalyzer';
import { Action, RecordedStep, recordedStepContext } from './models';
import { normalizeFeatureScope } from './featureScope';
import { TECHNICAL_STOP_WORDS } from './selectorNormalization';
import { spanishTokens, translateToEnglish, translateToSlug } from './englishIdentifiers';
import { detectRepetition } from './repetitionDetector';
import { projectPaths } from './projectPaths';

export interface ResolverResult {
    scenario: AutomationScenario;
    plan: GenerationPlan;
    resolvedContext: ResolvedContext;
    unresolvedContext: UnresolvedContext;
}

interface CatalogProvider {
    getCatalog(squad: string, platform: 'android' | 'ios', featureScope?: string): SquadReuseCatalog;
}

const SELECTOR_ACTIONS = new Set<Action>([
    'CLICK', 'ESCRIBIR', 'LIMPIAR', 'SCROLL_HASTA', 'PRESION_LARGA',
    'VERIFICAR_TEXTO', 'VERIFICAR_EXISTE', 'VERIFICAR_NO_EXISTE',
]);

function normalizeSelector(value = '', platform: 'android' | 'ios'): string {
    let normalized = value.trim().replace(/\s+/g, ' ');
    if (platform === 'android' && /^new\s+UiSelector\(\)/.test(normalized)) {
        normalized = `android=${normalized}`;
    }
    return normalized;
}

function selectorAliases(value = '', platform: 'android' | 'ios'): Set<string> {
    const normalized = normalizeSelector(value, platform);
    if (!normalized) return new Set();
    const aliases = new Set([normalized]);
    const withoutPrefix = normalized.replace(/^(?:id=|~)/, '').trim();
    if (withoutPrefix) aliases.add(withoutPrefix);
    if (normalized.startsWith('android=new UiSelector()')) {
        aliases.add(normalized.replace(/^android=/, ''));
    }
    return aliases;
}

function words(value: string): string[] {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9]+/)
        .filter(word => word.length > 1);
}

function similarity(left: string, right: string): number {
    const a = new Set(words(left));
    const b = new Set(words(right));
    if (!a.size || !b.size) return 0;
    const common = [...a].filter(word => b.has(word)).length;
    return common / Math.max(a.size, b.size);
}

function slug(value: string, fallback: string): string {
    const output = value.toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
        .replace(/-+$/g, '');
    return output || fallback;
}

function camel(value: string, fallback: string): string {
    const parts = words(value);
    if (!parts.length) return fallback;
    return parts[0] + parts.slice(1).map(part => part[0].toUpperCase() + part.slice(1)).join('');
}

function genericName(value: string): boolean {
    return !value.trim() || /^(?:flujo-mobile|nueva-pantalla|escenario[- ]grabado|flujo mobile)$/i.test(value.trim());
}

function actionIntent(step: RecordedStep, sequence: number): string {
    const intent = recordedStepContext(step) || String(step.variableName || '').trim();
    const semanticIntent = /^VERIFICAR_/.test(step.action)
        ? intent.replace(/^(?:verificar|validar)(?:\s+que)?\s+/i, '')
        : intent;
    return semanticIntent || `${step.action.toLowerCase()} elemento ${sequence}`;
}

function compactTechnicalName(scenario: AutomationScenario): string {
    const candidates = [
        scenario.acceptanceCriteria,
        ...scenario.actions.map(recordedStepContext),
        scenario.objective,
    ];
    const meaningful: string[] = [];
    for (const candidate of candidates) {
        for (const word of words(candidate)) {
            if (word.length < 3 || TECHNICAL_STOP_WORDS.has(word) || meaningful.includes(word)) continue;
            meaningful.push(word);
            if (meaningful.length === 4) break;
        }
        if (meaningful.length === 4) break;
    }
    return meaningful.join('-') || `caso-${scenario.recordingId.slice(-8)}`;
}

function titleFromSlug(value: string): string {
    const text = value.replace(/-/g, ' ');
    const qualified = text.match(/^(filtro|lista|detalle|consulta)\s+(.+)$/i);
    if (qualified) {
        return `${qualified[1][0].toUpperCase()}${qualified[1].slice(1)} de ${qualified[2]}`;
    }
    return text ? text[0].toUpperCase() + text.slice(1) : 'Automatización móvil';
}

function behaviorText(actions: RecordedStep[], intents: string[], technicalName: string): string {
    const relevantIndex = actions.map(action => !['SCROLL_DOWN', 'SCROLL_UP', 'SWIPE'].includes(action.action))
        .lastIndexOf(true);
    const intent = intents[relevantIndex >= 0 ? relevantIndex : intents.length - 1] || titleFromSlug(technicalName).toLowerCase();
    const all = intents.join(' ');
    if (/movimiento/i.test(all)) {
        return /todos/i.test(all)
            ? 'el usuario consulta todos sus movimientos'
            : 'el usuario consulta sus movimientos';
    }
    if (/^mostrar\s+/i.test(intent)) return `el usuario consulta ${intent.replace(/^mostrar\s+/i, '')}`;
    if (/^ver\s+/i.test(intent)) return `el usuario consulta ${intent.replace(/^ver\s+/i, '')}`;
    return `el usuario completa ${titleFromSlug(technicalName).toLowerCase()}`;
}

function assertionText(intents: string[], technicalName: string): string {
    const context = intents.filter(Boolean).join(' ');
    if (/movimiento/i.test(context)) return 'se muestran los movimientos esperados';
    if (/saldo/i.test(context)) return 'se muestra la información de saldo esperada';
    return `se obtiene el resultado esperado de ${titleFromSlug(technicalName).toLowerCase()}`;
}

// El nombre del parametro viaja al Gherkin como <param>, a la columna de
// Examples y a la variable del step, asi que va en ingles como <username>.
function inputParameterName(intent: string, sequence: number): string {
    const ignored = new Set(['input', 'campo', 'nuevo', 'nueva', 'ingresar', 'escribir']);
    const parts = words(intent).filter(word => !ignored.has(word));
    if (parts.includes('numero')) return 'number';
    if (parts.includes('telefono') || parts.includes('celular')) return 'phone';
    return translateToEnglish(parts.join(' ')).name || camel(parts.join(' '), `value${sequence}`);
}

function exactLocator(catalog: SquadReuseCatalog, selector: string): LocatorInfo | undefined {
    const target = selectorAliases(selector, catalog.platform);
    return catalog.locators.find(locator =>
        (locator.scope === 'squad' || locator.scope === 'home') &&
        [...selectorAliases(locator.selector, catalog.platform)].some(alias => target.has(alias))
    );
}

function normalizeStepText(value: string): string {
    return value.toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/<[^>]+>/g, '<param>')
        .replace(/[^a-z0-9<>]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stepSimilarity(left: string[], right: string[]): number {
    const a = new Set(left.map(normalizeStepText).filter(Boolean));
    const b = new Set(right.map(normalizeStepText).filter(Boolean));
    if (!a.size || !b.size) return 0;
    const common = [...a].filter(step => b.has(step)).length;
    return (2 * common) / (a.size + b.size);
}

function frameworkCandidates(
    catalog: SquadReuseCatalog,
    scenario: AutomationScenario,
    resolutions: ActionResolution[]
): FrameworkReuseCandidate[] {
    const generatedSteps = (scenario.request.scenarioRows || []).map(row => row.text);
    const selectorResolutions = resolutions.filter(resolution => Boolean(resolution.selector));
    return (catalog.scenarios || []).map((candidate: FeatureScenarioInfo) => {
        const locatorsPath = candidate.artifacts?.locators;
        const matchingSelectors = selectorResolutions.filter(resolution =>
            catalog.locators.some(locator =>
                (!locatorsPath || locator.file === locatorsPath) &&
                [...selectorAliases(locator.selector, catalog.platform)]
                    .some(alias => selectorAliases(resolution.selector, catalog.platform).has(alias))
            )
        ).length;
        const selectorCoverage = selectorResolutions.length
            ? matchingSelectors / selectorResolutions.length
            : 0;
        const candidateSteps = candidate.steps.map(step => step.text);
        const semanticScore = stepSimilarity(generatedSteps, candidateSteps);
        const score = Number((semanticScore * 0.6 + selectorCoverage * 0.4).toFixed(3));
        return {
            feature: candidate.feature,
            scenario: candidate.name,
            caseId: candidate.caseId,
            file: candidate.file,
            score,
            selectorCoverage,
            matchedSteps: generatedSteps.filter(step =>
                candidateSteps.some(existing => normalizeStepText(existing) === normalizeStepText(step))
            ),
            paths: candidate.artifacts,
            relatedPaths: candidate.relatedArtifacts,
        };
    }).filter(candidate => candidate.score >= 0.35)
        .sort((left, right) => right.score - left.score || right.selectorCoverage - left.selectorCoverage)
        .slice(0, 5);
}

function likelyDynamicText(value = ''): boolean {
    const text = value.trim();
    return /(?:S\/|\$|€|£)\s*\d|\b\d+[.,]\d{2}\b|\b\d{6,}\b/.test(text);
}

/** Literales entre comillas dentro de un selector. */
function selectorLiterals(selector = ''): string[] {
    return [...selector.matchAll(/["']([^"']+)["']/g)].map(match => match[1].trim());
}

/**
 * El selector fija el mismo texto que la acción valida.
 *
 * Es el patrón que produce un locator inservible: el dato observado deja de ser
 * lo que se verifica y pasa a ser la forma de encontrar el elemento, así que el
 * `Then` solo pasa mientras el dato no cambie. Un nombre propio no lo detecta
 * `likelyDynamicText`, que solo mira montos y números largos.
 */
function selectorPinsAssertedValue(step: RecordedStep): boolean {
    const value = String(step.value || '').trim().toLowerCase();
    if (value.length < 3) return false;
    return selectorLiterals(step.selector).some(literal => {
        const bare = literal.replace(/[*%]+$/, '').trim().toLowerCase();
        if (!bare) return false;
        return bare === value || (bare.length >= 4 && (bare.includes(value) || value.includes(bare)));
    });
}

/**
 * Un XPath solo de tipos de nodo, sin ningun predicado, no identifica nada:
 * `//android.view.View` engancha la primera View generica del arbol, que existe
 * en practicamente cualquier pantalla. Como asercion siempre pasa, y el caso
 * queda verde sin haber comprobado nada.
 */
function selectorCannotIdentifyElement(selector = ''): boolean {
    const value = String(selector).trim();
    if (!/^\/{1,2}[^/]/.test(value) && value !== '//*') return false;
    // Cualquier predicado, atributo o funcion ya lo hace especifico.
    if (/[\[\]@=]|contains\(|text\(\)|starts-with\(/.test(value)) return false;
    return true;
}

/** `UiSelector().text()` es coincidencia exacta: un `*` final nunca actúa como comodín. */
function selectorUsesFakeWildcard(selector = ''): boolean {
    return /\.(?:text|description)\(\s*["'][^"']*[*%]["']\s*\)/.test(selector);
}

/**
 * Métodos del módulo target que ya cubren la intención de una acción.
 *
 * Detectar el módulo correcto no basta: el caso que se generó reutilizó el
 * archivo y aun así creó `validarNombreDelUsuarioYapero` junto al ya existente
 * `validarNombreDelYapero`. Se compara la intención contra el nombre del método
 * y contra las claves de locator que consume, con un bono si ambos son del
 * mismo tipo de acción.
 */
/**
 * Similitud entre conceptos, ignorando el relleno del idioma.
 *
 * `similarity` a secas cuenta palabras como "por" o "del", suficientes para que
 * "compartir constancia por correo" pareciera "buscar yapero por numero".
 */
function conceptSimilarity(left: string, right: string): number {
    const meaningful = (value: string) =>
        new Set(words(value).filter(word => !TECHNICAL_STOP_WORDS.has(word)));
    const a = meaningful(left);
    const b = meaningful(right);
    if (!a.size || !b.size) return 0;
    const common = [...a].filter(word => b.has(word)).length;
    return common / Math.max(a.size, b.size);
}

function similarExistingMethods(
    catalog: SquadReuseCatalog,
    screenFile: string,
    resolution: ActionResolution
): NonNullable<ActionResolution['existingMethod']>[] {
    const assertion = /^VERIFICAR_/.test(resolution.action);
    return (catalog.screenMethods || [])
        .filter(method => method.file === screenFile)
        .map(method => {
            const byName = conceptSimilarity(resolution.intent, method.name);
            const byLocator = Math.max(0, ...(method.locatorKeys || [])
                .map(key => conceptSimilarity(resolution.intent, key)));
            // El bono solo aplica entre aserciones: que dos acciones cualesquiera
            // "no sean aserción" no dice nada sobre si hacen lo mismo.
            const bothAssert = assertion && /^(?:validar|verificar|valida|verifica)/i.test(method.name);
            const score = Math.min(1, Math.max(byName, byLocator) + (bothAssert ? 0.15 : 0));
            return {
                name: method.name,
                signature: method.signature,
                file: method.file,
                locatorKeys: method.locatorKeys || [],
                score: Number(score.toFixed(3)),
            };
        })
        .filter(candidate => candidate.score > 0)
        .sort((left, right) => right.score - left.score);
}

const REUSE_METHOD_THRESHOLD = 0.7;
const REVIEW_METHOD_THRESHOLD = 0.35;

function bestArtifactBundle(
    catalog: SquadReuseCatalog,
    scenario: AutomationScenario,
    resolutions: ActionResolution[]
): { bundle: ArtifactBundle; score: number; reason: string } | undefined {
    const reusedFiles = new Set(resolutions
        .filter(resolution => resolution.resolution === 'reuse' && resolution.source?.scope === 'squad')
        .map(resolution => resolution.source!.file));
    const semanticContext = [
        scenario.objective,
        scenario.acceptanceCriteria,
        ...resolutions.map(resolution => resolution.intent),
    ].join(' ');
    const ranked = (catalog.artifactBundles || []).flatMap(bundle => {
        if (bundle.screens.length !== 1 || bundle.locators.length !== 1) return [];
        const exactLocatorHits = bundle.locators.filter(file => reusedFiles.has(file)).length;
        const bundleContext = [bundle.steps, ...bundle.screens, ...bundle.locators,
            ...bundle.stepExpressions, ...bundle.screenMethods].join(' ');
        const semanticScore = similarity(semanticContext, bundleContext);
        const score = Math.min(1, exactLocatorHits > 0 ? 0.85 + semanticScore * 0.15 : semanticScore);
        return [{
            bundle,
            score: Number(score.toFixed(3)),
            reason: exactLocatorHits > 0
                ? 'El Screen Object existente ya consume un locator reutilizado por el recording.'
                : 'Coincidencia semántica con métodos y archivos existentes del alcance.',
        }];
    }).sort((left, right) => right.score - left.score);
    return ranked[0]?.score >= 0.45 ? ranked[0] : undefined;
}

function plannedFile(
    layer: 'feature' | 'steps' | 'screen' | 'locators',
    relativePath: string,
    operation: 'create' | 'update'
) {
    const absolute = path.join(projectPaths.frameworkRoot, relativePath);
    return {
        layer,
        path: relativePath,
        operation,
        ...(operation === 'update' && fs.existsSync(absolute) ? {
            baseHash: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),
        } : {}),
    };
}

export class DeterministicResolver {
    constructor(private readonly catalog: CatalogProvider = new ReuseAnalyzer()) {}

    resolve(rawScenario: AutomationScenario): ResolverResult {
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(rawScenario.squad)) {
            throw new Error(`Squad inválido: ${rawScenario.squad}`);
        }
        const featureScope = normalizeFeatureScope(rawScenario.request.featureScope);
        const catalog = this.catalog.getCatalog(rawScenario.squad, rawScenario.platform, featureScope);
        const objectiveSlug = slug(rawScenario.objective, `caso-${rawScenario.recordingId.slice(-8)}`);
        const technicalName = slug(compactTechnicalName(rawScenario), objectiveSlug);
        // El nombre de archivo va en ingles como el resto del framework
        // (show-balance-happy-path.feature), aunque la linea `Feature:` que
        // deriva del mismo texto se quede en espanol.
        const technicalSlug = translateToSlug(compactTechnicalName(rawScenario), technicalName);
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
            const reused = selector ? exactLocator(catalog, selector) : undefined;
            if (reused) {
                return {
                    sequence, action: step.action, intent,
                    resolution: 'reuse', locatorName: reused.name,
                    selector: reused.selector, confidence: 1,
                    source: {
                        file: reused.file,
                        module: reused.module,
                        scope: reused.scope as 'squad' | 'home',
                    },
                    reason: 'Coincidencia exacta del selector normalizado en squad/Home.',
                };
            }
            if (selector && step.selectorVerified !== false) {
                // El intent lo escribe el QA en espanol; el nombre logico va en
                // ingles como el resto del codigo del framework.
                let locatorName = translateToEnglish(intent).name || camel(intent, `element${sequence}`);
                while (usedNames.has(locatorName)) locatorName = `${locatorName}${sequence}`;
                usedNames.add(locatorName);
                return {
                    sequence, action: step.action, intent,
                    resolution: 'create', locatorName, selector,
                    confidence: step.selectorVerified ? 1 : 0.9,
                    reason: 'Selector ejecutado/verificado por el QA; se crea un locator lógico nuevo.',
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
            const pinned = selectorPinsAssertedValue(step);
            if (!likelyDynamicText(step.value) && !pinned) return;
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
            });
        });

        rawScenario.actions.forEach((step, index) => {
            if (!/^VERIFICAR_/.test(step.action)) return;
            if (!selectorCannotIdentifyElement(step.selector)) return;
            gaps.push({
                id: `gap-weak-assertion-${index + 1}`,
                sequence: index + 1,
                type: 'verification-semantics',
                description: `La acción ${index + 1} verifica con "${step.selector}", un XPath sin ningún ` +
                    'predicado: engancha el primer nodo de ese tipo, que existe en casi cualquier pantalla. ' +
                    'La aserción pasaría igual aunque el filtro no se haya aplicado.',
                requiredOutput: 'Apunta la verificación a algo propio del resultado (accessibility id, ' +
                    'texto del título del contenedor, o el XPath con un predicado que lo distinga) y ' +
                    'explica en el Then qué prueba ese elemento.',
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
        const spanishNames = [...new Set(resolutions
            .filter(item => item.resolution === 'create' && item.locatorName)
            .map(item => item.locatorName as string)
            .filter(name => spanishTokens(name).length))];
        if (spanishNames.length) {
            gaps.push({
                id: 'gap-english-naming',
                type: 'semantic-naming',
                description: 'Estos nombres logicos conservan palabras en espanol que no se pudieron ' +
                    `traducir automaticamente: ${spanishNames.join(', ')}.`,
                requiredOutput: 'Renombralos a ingles y usa el mismo nombre en las tres capas (clave del ' +
                    'locator, getter y metodo del Screen Object). El selector y la decision reuse/create no ' +
                    'cambian, solo el nombre. El Gherkin sigue en espanol.',
            });
        }

        // Un ciclo repetido casi siempre significa "probar todas las opciones",
        // pero convertirlo en Examples cambia el caso a N ejecuciones completas.
        // El recorder lo detecta y lo propone; la lectura la elige el QA.
        const repetition = detectRepetition(rawScenario.actions);
        if (repetition) {
            const last = repetition.startSequence + repetition.length * repetition.repetitions - 1;
            gaps.push({
                id: 'gap-repetition',
                sequence: repetition.startSequence,
                type: 'repetition',
                description:
                    `Las acciones ${repetition.startSequence}-${last} repiten ${repetition.repetitions} veces ` +
                    `el mismo ciclo de ${repetition.length} accion(es), variando solo <${repetition.parameter}>: ` +
                    `${repetition.values.join(', ')}.`,
                requiredOutput: [
                    `Recomendado: un solo escenario con una data table de Cucumber en el step, iterando los ` +
                    `${repetition.repetitions} valores de <${repetition.parameter}>. El step acumula los fallos y ` +
                    'lanza uno solo al final nombrando cual fallo, asi se evaluan todos y se sabe cual rompio ' +
                    'sin repetir el login. El framework ya usa DataTable en marketplace, nexus y home.',
                    `Alternativa: Scenario Outline con ${repetition.repetitions} filas de Examples, solo si cada ` +
                    'valor necesita correr aislado y eso justifica repetir el login completo en cada fila.',
                    `Alternativa: encadenar las ${repetition.repetitions} vueltas sin tabla, solo si lo que se ` +
                    'valida es la acumulacion y no cada valor por separado.',
                    `En cualquiera, el locator va parametrizado con {${repetition.parameter}} y .replace(), ` +
                    'como ya hacen home.locator.json y pautas.locator.json.',
                ].join(' '),
            });
        }

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
        let behaviorSeen = false;
        let assertionSeen = false;
        chunks.forEach(chunk => {
            const intents = chunk.entries.map(entry => entry.resolution.intent);
            const parameterizedActions = chunk.entries.map(({ step, resolution }) => {
                if (step.action !== 'ESCRIBIR') return {
                    ...step,
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
                : behaviorText(chunk.entries.map(entry => entry.step), intents, technicalName);
            scenarioRows.push({
                keyword: chunk.assertion
                    ? (assertionSeen ? 'And' : 'Then')
                    : (behaviorSeen ? 'And' : 'When'),
                text: chunk.assertion
                    ? assertionText(intents, technicalName)
                    : behavior,
                status: 'missing',
                actions: parameterizedActions,
            });
            if (chunk.assertion) assertionSeen = true;
            else behaviorSeen = true;
        });
        normalizedRequest.scenarioRows = scenarioRows;
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
            steps: reusableBundle.bundle.steps,
            screen: reusableBundle.bundle.screens[0],
            locators: reusableBundle.bundle.locators[0],
        } : undefined;
        if (reuseTarget && !gaps.some(gap => gap.id === 'gap-extend-existing-artifacts')) {
            gaps.push({
                id: 'gap-extend-existing-artifacts',
                type: 'semantic-naming',
                description: 'El caso debe extender artefactos existentes relacionados en vez de crear duplicados.',
                requiredOutput: 'Conservar el contenido existente y agregar únicamente definitions, methods y locators faltantes.',
            });
        }
        const files = existingCase ? [
            plannedFile('feature', existingCase.paths.feature, 'update'),
            plannedFile('steps', existingCase.paths.steps, 'update'),
            plannedFile('screen', existingCase.paths.screen, 'update'),
            plannedFile('locators', existingCase.paths.locators, 'update'),
        ] : [
            plannedFile('feature', `features/yape-features/${featurePrefix}/${normalizedRequest.fileName}.feature`, 'create'),
            plannedFile('steps', reuseTarget?.steps || `features/yape-steps-definitions/${scenario.squad}/${normalizedRequest.fileName}.steps.ts`, reuseTarget?.steps ? 'update' : 'create'),
            plannedFile('screen', reuseTarget?.screen || `screenobjects/${scenario.squad}/${normalizedRequest.locatorModule}.screen.ts`, reuseTarget?.screen ? 'update' : 'create'),
            plannedFile('locators', reuseTarget?.locators || `resources/locators/${scenario.squad}/${normalizedRequest.locatorModule}.locator.json`, reuseTarget?.locators ? 'update' : 'create'),
        ];
        // El módulo target ya puede cubrir la intención: reutilizar el método
        // existente evita el duplicado semántico dentro del mismo Screen Object.
        if (reuseTarget?.screen) {
            for (const resolution of resolutions) {
                if (resolution.resolution !== 'create') continue;
                const [best] = similarExistingMethods(catalog, reuseTarget.screen, resolution);
                if (!best || best.score < REVIEW_METHOD_THRESHOLD) continue;
                resolution.existingMethod = best;
                if (best.score >= REUSE_METHOD_THRESHOLD) {
                    resolution.resolution = 'reuse';
                    resolution.confidence = best.score;
                    resolution.locatorName = best.locatorKeys[0] || resolution.locatorName;
                    resolution.reason = `${reuseTarget.screen} ya expone ${best.signature} para esta intención.`;
                    continue;
                }
                const gapId = `gap-duplicate-${resolution.sequence}`;
                resolution.gapId = gapId;
                gaps.push({
                    id: gapId,
                    sequence: resolution.sequence,
                    type: 'semantic-naming',
                    description: `${reuseTarget.screen} ya expone ${best.signature}, parecido a "${resolution.intent}" (${best.score}).`,
                    requiredOutput: `Reutiliza ${best.name} si valida lo mismo; si no, explica en qué se diferencia y usa un nombre que lo distinga.`,
                });
            }
        }
        const planId = `plan-${crypto.createHash('sha256').update(JSON.stringify({
            recordingId: scenario.recordingId,
            fingerprint: scenario.fingerprint,
            resolutions,
            files,
            existingCase,
            reuseTarget,
        })).digest('hex').slice(0, 24)}`;
        const unresolved = resolutions.filter(item => item.resolution === 'unresolved').length;
        const plan: GenerationPlan = {
            schemaVersion: AUTOMATION_SCHEMA_VERSION,
            pipelineVersion: AUTOMATION_PIPELINE_VERSION,
            planId,
            recordingId: scenario.recordingId,
            fingerprint: scenario.fingerprint,
            deterministicCoverage: resolutions.length
                ? (resolutions.length - unresolved) / resolutions.length
                : 0,
            status: gaps.length ? 'needs-agent' : 'deterministic',
            resolutions,
            files,
            existingCase,
            reuseTarget,
            ...(repetition ? { repetition } : {}),
            unresolvedGapIds: gaps.map(gap => gap.id),
            budgets: { maxDurationMs: 300_000, maxContextBytes: 20_000, maxRepairAttempts: 1 },
        };
        return {
            scenario,
            plan,
            resolvedContext: {
                schemaVersion: AUTOMATION_SCHEMA_VERSION,
                recordingId: scenario.recordingId,
                planId,
                reusedLocators: resolutions.filter(item => item.resolution === 'reuse'),
                frameworkAwareness: {
                    candidates,
                    exactStepDefinitions: catalog.stepDefinitions.filter(definition =>
                        scenarioRows.some(row => {
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
    slug,
    camel,
};
