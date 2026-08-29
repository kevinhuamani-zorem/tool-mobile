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
import { frameworkContract } from './frameworkContract';
import { ElementIdentityIndex } from './elementIdentity';
import { importsOf, indexModuleImports, inferredStrategy, strategyOf, strategyValue, roundTrip } from './locatorStrategy';
import { declareElements } from './elementDeclaration';
import { CodeGraph } from './codeGraph';
import { detectRepetition } from './repetitionDetector';
import { projectPaths } from './projectPaths';
import { candidateAllowlist } from './selectorCandidates';
import type { SelectorCandidateStability } from './models';

export interface ResolverResult {
    scenario: AutomationScenario;
    plan: GenerationPlan;
    resolvedContext: ResolvedContext;
    unresolvedContext: UnresolvedContext;
    frameworkMetrics?: SquadReuseCatalog['frameworkMetrics'];
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

/**
 * Texto procedimental que no puede ser un step: narra la interfaz en vez del
 * comportamiento. Es el mismo criterio que aplica el validador al Feature.
 */
const PROCEDURAL_TEXT =
    /\b(?:hace|hacer|da|dar)\s+(?:clic|click)\b|\b(?:presiona|presionar|pulsa|pulsar|toca|tocar)\s+(?:el\s+)?(?:bot[oó]n|elemento|campo)\b|\b(?:scroll|swipe|desplaza|desplazar|arrastra|arrastrar)\b|\b(?:espera|esperar)\s+\d+\s*segundos?\b|\b(?:escribe|escribir|ingresa|ingresar)\s+(?:en\s+)?(?:el\s+)?campo\b/i;

/**
 * Frase del QA lista para usarse como texto de step, o `undefined`.
 *
 * El objetivo y el criterio de aceptacion ya son espanol redactado por una
 * persona y describen exactamente el comportamiento y el resultado esperado.
 * Usarlos evita la plantilla, que armaba la frase con el slug tecnico y salia
 * como "el usuario completa saldo disponible consultar etiqueta": palabras
 * sueltas en orden de maquina.
 */
function qaSentence(value: string | undefined): string | undefined {
    const text = String(value || '').trim().replace(/\s+/g, ' ').replace(/[.;]+$/, '');
    if (text.length < 12 || text.split(' ').length < 4) return undefined;
    // Un keyword dentro del texto rompe el parseo del Feature.
    if (/^(?:Given|When|Then|And|But|Dado|Cuando|Entonces)\b/i.test(text)) return undefined;
    if (PROCEDURAL_TEXT.test(text)) return undefined;
    // Un step no nombra controles: eso es narrar la interfaz, no el negocio.
    if (/\b(?:bot[oó]n|campo|icono|checkbox|men[uú]|input|label|etiqueta)\b/i.test(text)) return undefined;
    // `<param>` sin columna en Examples deja el step sin enlazar.
    if (/<[^>]+>/.test(text)) return undefined;
    return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Frase de dominio redactada a mano, o `undefined` si ninguna aplica.
 *
 * Se separa de la plantilla para poder intercalar el objetivo del QA entre
 * ambas: la frase curada es mejor Gherkin que cualquier texto generico, pero la
 * plantilla es peor que las palabras de una persona.
 */
function domainBehaviorText(
    actions: RecordedStep[], intents: string[], technicalName: string
): string | undefined {
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
    return undefined;
}

/** Ultimo recurso: arma la frase con el slug tecnico. Sale de maquina. */
function behaviorTemplate(technicalName: string): string {
    return `el usuario completa ${titleFromSlug(technicalName).toLowerCase()}`;
}

function domainAssertionText(intents: string[]): string | undefined {
    const context = intents.filter(Boolean).join(' ');
    if (/movimiento/i.test(context)) return 'se muestran los movimientos esperados';
    if (/saldo/i.test(context)) return 'se muestra la información de saldo esperada';
    return undefined;
}

function assertionTemplate(technicalName: string): string {
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

/**
 * Reutiliza un locator existente SOLO si es el mismo identificador con la misma
 * estrategia.
 *
 * Antes comparaba cadenas normalizadas quitando el prefijo, asi que `~Tapp`
 * (accessibility id) y un valor `Tapp` declarado como XPATH colapsaban al mismo
 * alias. Que dos locators compartan el texto no prueba que el identificador
 * funcione para este caso: si el tipo difiere, es otro selector.
 *
 * Cuando ningun Screen Object declara la estrategia de una clave no se puede
 * afirmar nada, y no afirmar es no reutilizar. Ese candidato igual llega al QA
 * por el gap de duplicado.
 */
function exactLocators(
    catalog: SquadReuseCatalog,
    selector: string
): Array<{ locator: LocatorInfo; strategy: string }> {
    const wantedStrategy = strategyOf(selector, catalog.platform);
    const wantedValue = strategyValue(selector);
    if (!wantedValue) return [];
    return catalog.locators.flatMap(locator => {
        if (locator.scope !== 'squad' && locator.scope !== 'home') return [];
        const value = catalog.platform === 'ios' ? locator.iosSelector : locator.androidSelector;
        if (strategyValue(value) !== wantedValue) return [];
        // La declaracion del getter manda; si no existe, solo vale cuando el
        // valor determina la estrategia por si mismo.
        const declared = (catalog.platform === 'ios' ? locator.iosStrategy : locator.androidStrategy)
            || inferredStrategy(value);
        if (!declared || declared !== wantedStrategy) return [];
        return [{ locator, strategy: declared }];
    });
}

const REUSE_SCOPE_ORDER: Record<'squad' | 'home', number> = { squad: 0, home: 1 };
const CANDIDATE_STABILITY_ORDER: Record<SelectorCandidateStability, number> = {
    stable: 0,
    contextual: 1,
    structural: 2,
    manual: 3,
};

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

/**
 * Un metodo parecido NO habilita reutilizar: que el nombre se parezca no prueba
 * que su locator sirva para este caso. Solo se propone al QA para que decida.
 */
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
        // Locators que esta misma grabacion ya decidio crear, indexados por el
        // par (TypeLocator, valor). `exactLocator` solo mira el catalogo del
        // framework, asi que sin esto un boton pulsado cinco veces creaba cinco
        // locators distintos —filterMovementsButton, filterMovements, filter…—
        // apuntando todos a `~Botón de filtrar`. Es la misma regla de siempre:
        // mismo identificador y misma estrategia es el mismo elemento.
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
                    reason: `Mismo identificador y misma estrategia (${reused.strategy}) que ` +
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
                        reason: `Mismo identificador y misma estrategia (${pair.type}) que la accion ` +
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
        const behaviorChunks = chunks.filter(chunk => !chunk.assertion).length;
        const assertionChunks = chunks.filter(chunk => chunk.assertion).length;
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
                // Con un solo bloque de comportamiento, el objetivo del QA ES
                // ese comportamiento; con varios no se puede repartir y se
                // vuelve a la plantilla.
                // Orden deliberado: la frase de dominio esta redactada a mano y
                // gana; si no aplica, las palabras del QA; la plantilla solo
                // cuando no hay ninguna de las dos.
                : domainBehaviorText(chunk.entries.map(entry => entry.step), intents, technicalName)
                    || (behaviorChunks === 1 ? qaSentence(rawScenario.objective) : undefined)
                    || behaviorTemplate(technicalName);
            const assertionRow = domainAssertionText(intents)
                || (assertionChunks === 1 ? qaSentence(rawScenario.acceptanceCriteria) : undefined)
                || assertionTemplate(technicalName);
            const wording: 'domain' | 'qa' | 'template' = chunk.assertion
                ? (domainAssertionText(intents) ? 'domain'
                    : assertionRow === assertionTemplate(technicalName) ? 'template' : 'qa')
                : (domainBehaviorText(chunk.entries.map(entry => entry.step), intents, technicalName) ? 'domain'
                    : behavior === behaviorTemplate(technicalName) ? 'template' : 'qa');
            scenarioRows.push({
                keyword: chunk.assertion
                    ? (assertionSeen ? 'And' : 'Then')
                    : (behaviorSeen ? 'And' : 'When'),
                text: chunk.assertion ? assertionRow : behavior,
                status: 'missing',
                wording,
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
                const gapId = `gap-duplicate-${resolution.sequence}`;
                resolution.gapId = gapId;
                gaps.push({
                    id: gapId,
                    sequence: resolution.sequence,
                    type: 'semantic-naming',
                    description: `${reuseTarget.screen} ya expone ${best.signature}, con un nombre parecido a ` +
                        `"${resolution.intent}" (${best.score}). El parecido es solo del nombre: ` +
                        'no dice nada sobre si su locator sirve para este caso.',
                    requiredOutput: `Reutiliza ${best.name} unicamente si comprobaste que apunta al mismo ` +
                        'elemento con el mismo identificador y la misma estrategia; si no, conserva el locator ' +
                        'nuevo y usa un nombre que lo distinga.',
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
    slug,
    camel,
};
