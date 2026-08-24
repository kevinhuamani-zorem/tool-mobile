/**
 * [visual-recorder] Identidad de un elemento, independiente de la estrategia.
 *
 * El resolver reutilizaba comparando la CADENA del selector, asi que dos
 * locators que apuntan al mismo elemento por caminos distintos eran invisibles
 * entre si. En el PR de Tapp eso produjo dos duplicados que el reviewer marco a
 * mano: `~Tapp` no matcheo con `//android.widget.Button[@content-desc="Tapp"]`,
 * y `~Ver todas` no matcheo con `//XCUIElementTypeButton[@name="Ver todas"]`.
 *
 * Lo que si comparten es el literal que fijan: `tapp`, `ver todas`. Eso es la
 * identidad. No prueba que sean el mismo elemento —dos pantallas pueden tener el
 * mismo texto— asi que alimenta un gap para que decida el QA, nunca una
 * reutilizacion automatica.
 */

/** Tipos de nodo y ruido tecnico: aparecen en el XPath pero no identifican nada. */
function isNoise(value: string): boolean {
    if (value.length < 2) return true;
    if (/^\d+$/.test(value)) return true;
    // `android.widget.Button`, `androidx.recyclerview...`, `XCUIElementTypeOther`
    if (/^xcuielementtype/i.test(value)) return true;
    if (/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i.test(value)) return true;
    // Ids generados por React (`:r9:`) y similares.
    if (/^:[a-z0-9]+:$/i.test(value)) return true;
    // Atributos, no valores.
    if (/^(true|false|null|undefined)$/i.test(value)) return true;
    if (!value.includes(' ') && GENERIC_LABELS.has(value.replace(/[^a-z0-9]/g, ''))) return true;
    return false;
}

/**
 * Etiquetas de UI que solas no identifican nada: media app tiene un boton
 * "Cerrar" y no son el mismo. Solo se descartan cuando son TODO el valor; como
 * parte de una etiqueta mas larga ("cerrar sesion") si distinguen.
 */
const GENERIC_LABELS = new Set([
    'cerrar', 'close', 'omitir', 'skip', 'continuar', 'continue', 'aceptar', 'accept',
    'cancelar', 'cancel', 'entendido', 'ok', 'siguiente', 'next', 'anterior', 'back',
    'atras', 'volver', 'guardar', 'save', 'enviar', 'send', 'buscar', 'search',
    'listo', 'done', 'si', 'yes', 'no', 'mas', 'more', 'menu', 'inicio', 'home',
    'salir', 'exit', 'editar', 'edit', 'eliminar', 'delete', 'agregar', 'add',
]);

function normalize(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Literales que el selector fija, sea `~id`, `//x[@content-desc="v"]`,
 * `new UiSelector().text("v")` o `-ios predicate string: name == "v"`.
 */
export function elementIdentity(selector = ''): Set<string> {
    const found = new Set<string>();
    const raw = String(selector).trim();
    if (!raw) return found;

    for (const [, literal] of raw.matchAll(/["']([^"']+)["']/g)) {
        const value = normalize(literal);
        if (!isNoise(value)) found.add(value);
    }

    // Accessibility id suelto: `~Tapp`, `id=Tapp`, o el valor pelado del JSON.
    const bare = raw.replace(/^(?:~|id=|accessibility id:)\s*/i, '').trim();
    const looksStructural = /[/\[\]()=]|UiSelector|predicate|class chain/i.test(bare);
    if (!looksStructural) {
        const value = normalize(bare);
        if (!isNoise(value)) found.add(value);
    }
    return found;
}

export interface IdentityCandidate {
    name: string;
    module: string;
    file: string;
    scope: string;
    /** Valor que hizo el match, para que el QA vea por que se propone. */
    sharedValue: string;
    androidSelector: string;
    iosSelector: string;
}

interface IndexableLocator {
    name: string;
    module: string;
    file?: string;
    scope?: string;
    androidSelector?: string;
    iosSelector?: string;
    selector?: string;
}

/**
 * Indice de identidad sobre el catalogo.
 *
 * Lee los DOS bloques de plataforma a proposito. El catalogo se arma para la
 * plataforma de la sesion, y `tapp-subhome.btnViewAllAccounts` esta vacio en
 * Android: mirando solo la plataforma activa ese locator es invisible y el
 * duplicado se cuela igual.
 */
export class ElementIdentityIndex {
    private readonly byValue = new Map<string, IdentityCandidate[]>();

    constructor(locators: IndexableLocator[]) {
        for (const locator of locators) {
            const sources = [locator.androidSelector, locator.iosSelector, locator.selector]
                .filter((value): value is string => Boolean(value));
            const values = new Set(sources.flatMap(source => [...elementIdentity(source)]));
            for (const value of values) {
                const entry = this.byValue.get(value) || [];
                entry.push({
                    name: locator.name,
                    module: locator.module,
                    file: locator.file || '',
                    scope: locator.scope || '',
                    sharedValue: value,
                    androidSelector: locator.androidSelector || '',
                    iosSelector: locator.iosSelector || '',
                });
                this.byValue.set(value, entry);
            }
        }
    }

    /** Locators existentes que fijan alguno de los literales del selector grabado. */
    find(selector: string, exclude: (candidate: IdentityCandidate) => boolean = () => false): IdentityCandidate[] {
        const wanted = elementIdentity(selector);
        const hits: IdentityCandidate[] = [];
        const seen = new Set<string>();
        for (const value of wanted) {
            for (const candidate of this.byValue.get(value) || []) {
                const key = `${candidate.module}.${candidate.name}`;
                if (seen.has(key) || exclude(candidate)) continue;
                seen.add(key);
                hits.push(candidate);
            }
        }
        return hits;
    }
}

export const elementIdentityTools = { elementIdentity, ElementIdentityIndex };
