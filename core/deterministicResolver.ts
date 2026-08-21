import crypto from 'crypto';
import {
    ActionResolution,
    AutomationScenario,
    GenerationPlan,
    ResolvedContext,
    UnresolvedContext,
    UnresolvedGap,
    AUTOMATION_PIPELINE_VERSION,
    AUTOMATION_SCHEMA_VERSION,
} from './automationContracts';
import { GenerationRequest } from './fwkMobileGenerator';
import { LocatorInfo, ReuseAnalyzer, SquadReuseCatalog } from './reuseAnalyzer';
import { Action, RecordedStep } from './models';

export interface ResolverResult {
    scenario: AutomationScenario;
    plan: GenerationPlan;
    resolvedContext: ResolvedContext;
    unresolvedContext: UnresolvedContext;
}

interface CatalogProvider {
    getCatalog(squad: string, platform: 'android' | 'ios'): SquadReuseCatalog;
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
    const intent = String(step.elementIntent || step.description || step.variableName || '').trim();
    const semanticIntent = /^VERIFICAR_/.test(step.action)
        ? intent.replace(/^(?:verificar|validar)(?:\s+que)?\s+/i, '')
        : intent;
    return semanticIntent || `${step.action.toLowerCase()} elemento ${sequence}`;
}

const TECHNICAL_STOP_WORDS = new Set([
    'usuario', 'debe', 'poder', 'pueda', 'sus', 'todos', 'todas', 'ubicar',
    'boton', 'botones', 'ver', 'verificar', 'validar', 'existe', 'mostrar', 'muestra',
    'seleccionar', 'selecciona', 'hacer', 'hace', 'click', 'pantalla', 'elemento',
    'para', 'desde', 'hacia', 'sobre', 'entre', 'esta', 'este', 'estos', 'estas',
    'del', 'las', 'los', 'una', 'uno', 'con', 'que', 'por', 'como', 'and', 'the',
]);

function compactTechnicalName(scenario: AutomationScenario): string {
    const candidates = [
        scenario.acceptanceCriteria,
        ...scenario.actions.map(action => action.elementIntent || ''),
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
    return `el usuario realiza ${intent}`;
}

function assertionText(intents: string[]): string {
    const description = intents.filter(Boolean).join(' y ')
        .replace(/^boton\s+de\s+/i, 'el botón de ');
    return `se muestra ${description || 'el resultado esperado'}`;
}

function inputParameterName(intent: string, sequence: number): string {
    const ignored = new Set(['input', 'campo', 'nuevo', 'nueva', 'ingresar', 'escribir']);
    const parts = words(intent).filter(word => !ignored.has(word));
    if (parts.includes('numero')) return 'numero';
    if (parts.includes('telefono') || parts.includes('celular')) return 'telefono';
    return camel(parts.join(' '), `valor${sequence}`);
}

function exactLocator(catalog: SquadReuseCatalog, selector: string): LocatorInfo | undefined {
    return catalog.locators.find(locator =>
        (locator.scope === 'squad' || locator.scope === 'home') &&
        normalizeSelector(locator.selector, catalog.platform) === selector
    );
}

function likelyDynamicText(value = ''): boolean {
    const text = value.trim();
    return /(?:S\/|\$|€|£)\s*\d|\b\d+[.,]\d{2}\b|\b\d{6,}\b/.test(text);
}

export class DeterministicResolver {
    constructor(private readonly catalog: CatalogProvider = new ReuseAnalyzer()) {}

    resolve(rawScenario: AutomationScenario): ResolverResult {
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(rawScenario.squad)) {
            throw new Error(`Squad inválido: ${rawScenario.squad}`);
        }
        const catalog = this.catalog.getCatalog(rawScenario.squad, rawScenario.platform);
        const objectiveSlug = slug(rawScenario.objective, `caso-${rawScenario.recordingId.slice(-8)}`);
        const technicalName = slug(compactTechnicalName(rawScenario), objectiveSlug);
        const requestFileName = slug(rawScenario.request.fileName, objectiveSlug);
        const requestLocatorModule = slug(rawScenario.request.locatorModule, objectiveSlug);
        const requestFeatureName = slug(rawScenario.request.featureName, objectiveSlug);
        const autoGeneratedFeatureName = genericName(rawScenario.request.featureName) || requestFeatureName === objectiveSlug;
        const autoGeneratedFileName = genericName(rawScenario.request.fileName) || requestFileName === objectiveSlug;
        const autoGeneratedLocatorModule = genericName(rawScenario.request.locatorModule) || requestLocatorModule === objectiveSlug;
        const normalizedRequest: GenerationRequest = {
            ...rawScenario.request,
            featureName: autoGeneratedFeatureName
                ? titleFromSlug(technicalName)
                : rawScenario.request.featureName,
            scenarioName: genericName(rawScenario.request.scenarioName)
                ? titleFromSlug(technicalName)
                : rawScenario.request.scenarioName,
            fileName: autoGeneratedFileName ? technicalName : requestFileName,
            locatorModule: autoGeneratedLocatorModule ? technicalName : requestLocatorModule,
            dataName: rawScenario.request.dataName?.trim() || 'Usuario QA Temporal',
        };
        const gaps: UnresolvedGap[] = [];
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
                let locatorName = camel(intent, `elemento${sequence}`);
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
            if (step.action !== 'VERIFICAR_TEXTO' || !likelyDynamicText(step.value)) return;
            gaps.push({
                id: `gap-verification-${index + 1}`,
                sequence: index + 1,
                type: 'verification-semantics',
                description: `El texto grabado "${step.value}" parece dinámico.`,
                requiredOutput: 'Validar existencia o contenido no vacío; usar igualdad exacta solo si el criterio de aceptación lo exige.',
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
                    elementIntent: resolution.intent,
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
                    elementIntent: resolution.intent,
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
                    ? assertionText(intents)
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
        const files = [
            { layer: 'feature' as const, path: `features/yape-features/${scenario.squad}/${normalizedRequest.fileName}.feature`, operation: 'create' as const },
            { layer: 'steps' as const, path: `features/yape-steps-definitions/${scenario.squad}/${normalizedRequest.fileName}.steps.ts`, operation: 'create' as const },
            { layer: 'screen' as const, path: `screenobjects/${scenario.squad}/${normalizedRequest.locatorModule}.screen.ts`, operation: 'create' as const },
            { layer: 'locators' as const, path: `resources/locators/${scenario.squad}/${normalizedRequest.locatorModule}.locator.json`, operation: 'create' as const },
        ];
        const planId = `plan-${crypto.createHash('sha256').update(JSON.stringify({
            recordingId: scenario.recordingId,
            fingerprint: scenario.fingerprint,
            resolutions,
            files,
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

export const selectorNormalization = { normalizeSelector, slug, camel };
