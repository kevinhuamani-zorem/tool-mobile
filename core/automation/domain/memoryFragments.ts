/**
 * Memoria de fragmentos: lo que una automatizacion validada a score 100
 * enseña y que otro recording puede reutilizar aunque el caso completo sea
 * distinto.
 *
 * La memoria de casos (`cases/<fingerprint>`) solo sirve cuando se regenera
 * exactamente la misma grabacion. Un QA no repite grabaciones: encadena casos
 * que comparten pantallas, elementos y verificaciones. Lo que se repite entre
 * recordings no es el caso sino la interaccion: "CLICK sobre ~Botón de
 * filtrar" fue redactado por Lorem como "el usuario filtra los movimientos por
 * rango de fechas" con el metodo `userSelectFiltersMovements`, y esa decision
 * ya paso el validador y la revision del QA. Repetirla no necesita agente.
 *
 * La identidad de una accion es (plataforma, accion, selector normalizado y,
 * para VERIFICAR_TEXTO, el texto esperado). El contextHint queda fuera a
 * proposito: el QA describe el mismo boton con palabras distintas en cada
 * grabacion y el selector grabado es la evidencia real.
 *
 * Que se guarda:
 * - interacciones: la secuencia de identidades que cubre un mismo step
 *   Gherkin en el actionTrace validado, con su texto, keyword, metodo del
 *   Screen Object y locators.
 * - gaps: la decision aceptada para un gap ligado a un elemento
 *   (verification-semantics), para no volver a preguntarle al agente por la
 *   misma verificacion sobre el mismo elemento.
 *
 * Que NO se guarda: selectores (se conservan tal cual se grabaron, invariante
 * del recorder), nombres logicos (los reutiliza el indice del framework por
 * identidad TypeLocator+selector) ni gaps por caso (naming, extend-existing).
 */
import { normalizeSelector, normalizeStepText } from '../../shared';
import {
    AutomationAgentResponse,
    AutomationScenario,
    RecordedStep,
    UnresolvedGap,
} from '../contracts';

export const MEMORY_FRAGMENTS_SCHEMA_VERSION = 1 as const;

export interface InteractionFragment {
    /** Identidades de accion, en orden, cubiertas por un mismo step. */
    identities: string[];
    keyword: 'Given' | 'When' | 'Then' | 'And';
    text: string;
    screenMethod?: string;
    locatorNames: string[];
    squad: string;
    platform: 'android' | 'ios';
    caseId: string;
    fingerprint: string;
    promotedAt: string;
}

export interface GapFragment {
    identity: string;
    type: UnresolvedGap['type'];
    decision: string;
    reason: string;
    squad: string;
    caseId: string;
    fingerprint: string;
    promotedAt: string;
}

export interface MemoryFragments {
    schemaVersion: typeof MEMORY_FRAGMENTS_SCHEMA_VERSION;
    interactions: InteractionFragment[];
    gaps: GapFragment[];
}

export function emptyMemoryFragments(): MemoryFragments {
    return { schemaVersion: MEMORY_FRAGMENTS_SCHEMA_VERSION, interactions: [], gaps: [] };
}

const VALUE_SENSITIVE_ACTIONS = new Set(['VERIFICAR_TEXTO']);

export function actionIdentity(step: RecordedStep, platform: 'android' | 'ios'): string {
    const selector = normalizeSelector(String(step.selector || ''), step.platform || platform);
    const value = VALUE_SENSITIVE_ACTIONS.has(step.action)
        ? String(step.value || '').trim().toLowerCase()
        : '';
    return `${step.platform || platform}|${step.action}|${selector}|${value}`;
}

/** Los gaps por elemento que la memoria puede cerrar sin agente. */
export const MEMORIZABLE_GAP_TYPES = new Set<UnresolvedGap['type']>(['verification-semantics']);

/**
 * Decisiones que conservan la evidencia grabada (`reuse`/`create` son las que
 * el plan ya fijo por secuencia; `resolved` es "queda como esta").
 * `replace-existing` cambia el selector de una clave y `qa-required`/
 * `unresolved` no deciden nada: ninguna se replica a ciegas en otro recording.
 */
const REPLAYABLE_GAP_DECISIONS = new Set(['reuse', 'create', 'resolved']);

function splitGherkinStep(value: string): { keyword: InteractionFragment['keyword']; text: string } | undefined {
    const match = String(value || '').trim().match(/^(Given|When|Then|And)\s+(.+)$/);
    if (!match) return undefined;
    return { keyword: match[1] as InteractionFragment['keyword'], text: match[2].trim() };
}

/**
 * Extrae los fragmentos de una respuesta validada: agrupa el actionTrace por
 * step Gherkin contiguo y guarda la decision de cada gap ligado a un elemento.
 */
export function fragmentsFromValidatedCase(input: {
    scenario: AutomationScenario;
    response: AutomationAgentResponse;
    gaps?: UnresolvedGap[];
    promotedAt: string;
}): MemoryFragments {
    const { scenario, response, promotedAt } = input;
    const bySequence = new Map<number, RecordedStep>(
        scenario.actions.map((step, index) => [step.sequence ?? index + 1, step]),
    );
    const caseId = scenario.request?.caseId || '';
    const base = {
        squad: scenario.squad,
        platform: scenario.platform,
        caseId,
        fingerprint: scenario.fingerprint,
        promotedAt,
    };
    const interactions: InteractionFragment[] = [];
    let current: InteractionFragment | undefined;
    let currentStep = '';
    const trace = [...(response.actionTrace || [])].sort((a, b) => a.sequence - b.sequence);
    for (const entry of trace) {
        const step = bySequence.get(entry.sequence);
        const parsed = splitGherkinStep(entry.gherkinStep);
        if (!step || !parsed) { current = undefined; currentStep = ''; continue; }
        if (!current || currentStep !== entry.gherkinStep) {
            current = {
                identities: [],
                keyword: parsed.keyword,
                text: parsed.text,
                ...(entry.screenMethod ? { screenMethod: entry.screenMethod } : {}),
                locatorNames: [],
                ...base,
            };
            currentStep = entry.gherkinStep;
            interactions.push(current);
        }
        current.identities.push(actionIdentity(step, scenario.platform));
        if (entry.locatorName && !current.locatorNames.includes(entry.locatorName)) {
            current.locatorNames.push(entry.locatorName);
        }
        if (entry.screenMethod && !current.screenMethod) current.screenMethod = entry.screenMethod;
    }
    const gaps: GapFragment[] = [];
    for (const gap of input.gaps || []) {
        if (!MEMORIZABLE_GAP_TYPES.has(gap.type) || !Number.isInteger(gap.sequence)) continue;
        const step = bySequence.get(gap.sequence!);
        const resolution = (response.resolutions || []).find(item => item.gapId === gap.id);
        if (!step || !resolution || !REPLAYABLE_GAP_DECISIONS.has(String(resolution.decision))) continue;
        gaps.push({
            identity: actionIdentity(step, scenario.platform),
            type: gap.type,
            decision: String(resolution.decision),
            reason: String(resolution.reason || ''),
            squad: scenario.squad,
            caseId,
            fingerprint: scenario.fingerprint,
            promotedAt,
        });
    }
    return {
        schemaVersion: MEMORY_FRAGMENTS_SCHEMA_VERSION,
        interactions: interactions.filter(fragment => fragment.identities.length),
        gaps,
    };
}

/**
 * Fusiona lo aprendido con lo que ya habia: la version mas reciente de una
 * misma identidad gana, para que una correccion posterior del QA sustituya a
 * la anterior en vez de convivir con ella.
 */
export function mergeMemoryFragments(current: MemoryFragments, learned: MemoryFragments): MemoryFragments {
    // Una misma secuencia de elementos puede tener varios wordings validos
    // ("filtra los movimientos" la primera vez, "vuelve a filtrar" la
    // segunda): conviven, y solo un texto identico se sustituye por el nuevo.
    const interactionKey = (fragment: InteractionFragment) =>
        `${fragment.squad}|${fragment.identities.join('||')}|${normalizeStepText(fragment.text)}`;
    const gapKey = (fragment: GapFragment) => `${fragment.squad}|${fragment.type}|${fragment.identity}`;
    const interactions = new Map<string, InteractionFragment>();
    for (const fragment of [...current.interactions, ...learned.interactions]) {
        interactions.set(interactionKey(fragment), fragment);
    }
    const gaps = new Map<string, GapFragment>();
    for (const fragment of [...current.gaps, ...learned.gaps]) gaps.set(gapKey(fragment), fragment);
    return {
        schemaVersion: MEMORY_FRAGMENTS_SCHEMA_VERSION,
        interactions: [...interactions.values()],
        gaps: [...gaps.values()],
    };
}

export interface InteractionRecall {
    /** Fragmento memorizado que cubre el tramo; ausente si el tramo no esta en memoria. */
    fragment?: InteractionFragment;
    /** Indices (0-based) del tramo dentro del bloque de acciones. */
    from: number;
    to: number;
}

/**
 * Parte un bloque de acciones en tramos: los que un fragmento memorizado cubre
 * exactamente (el mas largo en cada posicion, porque el agente agrupo esas
 * acciones en un solo step por algo) y los que no. Un caso B = A + un paso
 * nuevo hereda los steps de A y solo el paso nuevo sigue el camino normal.
 * Devuelve `undefined` si ningun tramo esta en memoria.
 */
export function recallInteractions(
    fragments: InteractionFragment[],
    squad: string,
    identities: string[],
    usedTexts: Set<string> = new Set(),
): InteractionRecall[] | undefined {
    if (!identities.length) return undefined;
    const candidates = fragments.filter(fragment => fragment.squad === squad);
    const segments: InteractionRecall[] = [];
    const pick = (index: number, exclude: Set<string>): InteractionFragment | undefined => {
        let best: InteractionFragment | undefined;
        for (const fragment of candidates) {
            const length = fragment.identities.length;
            if (!length || index + length > identities.length) continue;
            if (exclude.has(normalizeStepText(fragment.text))) continue;
            if (best && length <= best.identities.length) continue;
            const matches = fragment.identities.every((identity, offset) => identity === identities[index + offset]);
            if (matches) best = fragment;
        }
        return best;
    };
    let index = 0;
    while (index < identities.length) {
        // Primero un wording que este caso aun no uso (la segunda pulsacion
        // del mismo boton tiene su propia frase); si no queda ninguno, se
        // repite y la desambiguacion habitual le pone sufijo.
        const best = pick(index, usedTexts) || pick(index, new Set());
        if (best) {
            usedTexts.add(normalizeStepText(best.text));
            segments.push({ fragment: best, from: index, to: index + best.identities.length - 1 });
            index += best.identities.length;
            continue;
        }
        const last = segments[segments.length - 1];
        if (last && !last.fragment) last.to = index;
        else segments.push({ from: index, to: index });
        index += 1;
    }
    return segments.some(segment => segment.fragment) ? segments : undefined;
}

export function recallGap(
    fragments: GapFragment[],
    squad: string,
    type: UnresolvedGap['type'],
    identity: string,
): GapFragment | undefined {
    return fragments.find(fragment =>
        fragment.squad === squad && fragment.type === type && fragment.identity === identity);
}

/** Dos textos de step son el mismo si coinciden normalizados. */
export function sameStepText(left: string, right: string): boolean {
    return normalizeStepText(left) === normalizeStepText(right);
}
