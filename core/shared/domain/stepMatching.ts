/**
 * Resolución de steps como la hace Cucumber.
 *
 * Al ejecutar, cucumber-js carga TODAS las step definitions del framework
 * (`features/yape-steps-definitions/**`), ignora el keyword (una definición
 * `Given` resuelve una línea `When`) y prueba cada regex contra el texto de
 * la línea. Cero coincidencias es un step undefined; dos o más, un step
 * ambiguo (`Multiple step definitions match`) y el Scenario falla. Este
 * módulo reproduce esa resolución para decidirla antes de ejecutar: sirve al
 * borrador (reformular una frase que cae en un regex ajeno) y al validador
 * (rechazar un Feature cuyas líneas no resuelvan a exactamente una
 * definición).
 *
 * Vive en `shared` porque lo consumen `automation` y `validation` y no
 * depende de ninguno de los dos.
 */
import { canonicalStepExpression } from './selectorNormalization';

export interface StepDefinitionLike {
    expression: string;
    file?: string;
}

const CUCUMBER_PARAMETERS: Record<string, string> = {
    int: '(-?\\d+)',
    float: '(-?\\d*\\.?\\d+)',
    word: '(\\S+)',
    string: '("[^"]*"|\'[^\']*\')',
    '': '(.*)',
};

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * RegExp con la que Cucumber resolvería una definición.
 *
 * Acepta la fuente interna de un regex literal (`^el usuario (.*)$`, como la
 * indexa el framework), el literal completo con delimitadores (`/^…$/i`) o
 * una cucumber expression en texto plano (`el usuario ingresa {string}`).
 * Devuelve undefined si la expresión no compila; una definición que no
 * compila tampoco resuelve nada al ejecutar.
 */
export function stepDefinitionRegExp(expression: string): RegExp | undefined {
    const source = String(expression || '').trim();
    if (!source) return undefined;
    const literal = source.match(/^\/([\s\S]+)\/([a-z]*)$/);
    let body = literal ? literal[1] : source;
    const flags = (literal ? literal[2] : '').replace(/[gy]/g, '');
    if (!literal && !/[\^$()[\]\\*+?|]/.test(body)) {
        // Cucumber expression: texto literal con parámetros {tipo}.
        body = '^' + escapeRegExp(body).replace(
            /\\\{(int|float|word|string|)\\\}/g,
            (_match, type: string) => CUCUMBER_PARAMETERS[type] || '(.*)',
        ) + '$';
    }
    try {
        return new RegExp(body, flags);
    } catch {
        return undefined;
    }
}

/** Texto de una línea Gherkin sin el keyword ni espacios sobrantes. */
export function gherkinLineText(line: string): string {
    return String(line || '')
        .trim()
        .replace(/^(?:Given|When|Then|And|But)\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Definiciones que resolverían la línea, en el orden en que se declaran.
 * Exactamente una es lo único que ejecuta; cero es undefined y dos o más,
 * ambiguo.
 */
export function matchingStepDefinitions<T extends StepDefinitionLike>(
    text: string,
    definitions: ReadonlyArray<T>,
): T[] {
    const line = gherkinLineText(text);
    if (!line) return [];
    return definitions.filter(definition => stepDefinitionRegExp(definition.expression)?.test(line) ?? false);
}

/**
 * Definiciones ajenas que "tragan" la frase: la matchean por sus capturas sin
 * ser la misma expresión canónica. `^el usuario ingresa su (.*) y (.*)$`
 * atrapa «el usuario ingresa su correo <email> y selecciona enviar» y ningún
 * sufijo escapa de una captura final; la salida es cambiar la redacción.
 */
export function swallowingStepDefinitions<T extends StepDefinitionLike>(
    text: string,
    definitions: ReadonlyArray<T>,
): T[] {
    const canonical = canonicalStepExpression(text);
    return matchingStepDefinitions(text, definitions)
        .filter(definition => canonicalStepExpression(definition.expression) !== canonical);
}

/**
 * Sustituye `<columna>` por los valores de una fila de Examples. Cucumber
 * resuelve cada fila expandida, no la plantilla con los corchetes.
 */
export function expandExampleRow(text: string, row: Record<string, string>): string {
    return String(text || '').replace(/<([^<>]+)>/g, (placeholder, column: string) =>
        Object.prototype.hasOwnProperty.call(row, column) ? row[column] : placeholder
    );
}

/**
 * Sinónimos del verbo con que empieza un step (tercera persona o impersonal).
 * Cambiar el verbo conserva el sentido y saca la frase del prefijo que un
 * regex ajeno reconoce; se prueban en este orden.
 */
const VERB_ALTERNATIVES: Array<[RegExp, string[]]> = [
    [/^(el usuario )?ingresa (su |el |la |los |las )?/i, ['escribe', 'registra', 'completa']],
    [/^(el usuario )?escribe (su |el |la |los |las )?/i, ['ingresa', 'registra']],
    [/^(el usuario )?registra (su |el |la |los |las )?/i, ['ingresa', 'escribe']],
    [/^(el usuario )?completa (su |el |la |los |las )?/i, ['ingresa', 'registra']],
    [/^(el usuario )?selecciona (su |el |la |los |las )?/i, ['elige', 'presiona']],
    [/^(el usuario )?presiona (su |el |la |los |las )?/i, ['selecciona', 'pulsa']],
    [/^(el usuario )?pulsa (su |el |la |los |las )?/i, ['presiona', 'selecciona']],
    [/^(el usuario )?consulta (su |el |la |los |las )?/i, ['revisa']],
    [/^(el usuario )?visualiza (su |el |la |los |las )?/i, ['observa']],
    [/^(el usuario )?valida (su |el |la |los |las )?/i, ['verifica']],
    [/^(el usuario )?verifica (su |el |la |los |las )?/i, ['valida']],
    [/^se muestra /i, ['se visualiza']],
    [/^se muestran /i, ['se visualizan']],
    [/^se visualiza /i, ['se muestra']],
    [/^se visualizan /i, ['se muestran']],
];

/**
 * Redacciones alternativas de una frase que conservan su sentido, de la menos
 * a la más invasiva: sinónimo del verbo, conjunción « y » por «, luego », y
 * ambas. Sin repetidos y sin la frase original.
 */
export function stepTextAlternatives(text: string): string[] {
    const base = String(text || '').trim().replace(/\s+/g, ' ');
    if (!base) return [];
    const withVerb: string[] = [];
    for (const [pattern, verbs] of VERB_ALTERNATIVES) {
        const match = base.match(pattern);
        if (!match) continue;
        const subject = match[1] || '';
        const article = match[2] || '';
        const rest = base.slice(match[0].length);
        for (const verb of verbs) withVerb.push(`${subject}${verb} ${article}${rest}`);
        break;
    }
    const conjunction = (value: string) => (/ y /.test(value) ? [value.replace(/ y /, ', luego ')] : []);
    const candidates = [
        ...withVerb,
        ...conjunction(base),
        ...withVerb.flatMap(conjunction),
    ];
    const seen = new Set<string>([base]);
    return candidates.filter(candidate => {
        if (seen.has(candidate)) return false;
        seen.add(candidate);
        return true;
    });
}

/**
 * Primera redacción alternativa que ninguna definición ajena resuelve, o
 * undefined si todas siguen cayendo en algún regex. `taken` permite excluir
 * textos ya usados en el mismo Scenario.
 */
export function stepTextEscaping<T extends StepDefinitionLike>(
    text: string,
    definitions: ReadonlyArray<T>,
    taken: (candidate: string) => boolean = () => false,
): string | undefined {
    return stepTextAlternatives(text).find(candidate =>
        !taken(candidate) && matchingStepDefinitions(candidate, definitions).length === 0
    );
}

export const stepMatching = {
    stepDefinitionRegExp,
    gherkinLineText,
    matchingStepDefinitions,
    swallowingStepDefinitions,
    expandExampleRow,
    stepTextAlternatives,
    stepTextEscaping,
};
