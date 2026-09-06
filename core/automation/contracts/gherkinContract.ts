/**
 * [visual-recorder] Reglas de contrato del Feature que el agente NO puede
 * reinterpretar.
 *
 * Vive aparte porque la misma logica corre en dos sitios: el validador que se
 * ejecuta al importar la propuesta, y `verify-package.js`, que corre dentro del
 * sandbox del agente para que se autocorrija antes de devolver nada.
 */

import { AutomationScenario } from './automationScenario';

/**
 * Normaliza un step SOLO en espacios.
 *
 * Deliberadamente no toca mayusculas, tildes ni el nombre del parametro:
 * Cucumber compara el texto del step contra la expresion tal cual, asi que
 * `inicia sesion` no enlaza con `/inicia sesión/` y `<username>` reemplazado por
 * un literal tampoco. Bajar tildes o case aqui dejaria pasar justo los dos
 * errores que esta regla existe para atrapar.
 */
export function normalizeGherkinStep(value: string): string {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

export function featureStepLines(feature: string): string[] {
    return [...String(feature || '').matchAll(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/gmi)]
        .map(match => match[1].trim());
}

/**
 * Filas que el resolver marco `reused`: son steps que YA existen en el
 * framework, con su expresion exacta. Reescribirlas deja el Feature apuntando a
 * un step que no existe, y Cucumber lo reporta como undefined en ejecucion, no
 * al generar. El caso tipico es el login: `el usuario <username> inicia sesion
 * en Yape` lo resuelve login.steps.ts, y basta con inlinar el usuario o perder
 * la tilde de "sesion" para que deje de enlazar.
 */
export function rewrittenReusedSteps(scenario: AutomationScenario, feature: string): string[] {
    const rows = scenario.request?.scenarioRows || [];
    const present = new Set(featureStepLines(feature).map(normalizeGherkinStep));
    return rows
        .filter(row => row.status === 'reused')
        .map(row => row.text)
        .filter(text => !present.has(normalizeGherkinStep(text)));
}

function placeholdersIn(feature: string): string[] {
    const names = featureStepLines(feature)
        .flatMap(line => [...line.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)].map(match => match[1]));
    return [...new Set(names)];
}

function examplesColumns(feature: string): Set<string> {
    const columns = new Set<string>();
    const lines = String(feature || '').split('\n');
    for (let index = 0; index < lines.length; index++) {
        if (!/^\s*Examples\s*:/i.test(lines[index])) continue;
        // La cabecera es la primera fila de tabla tras `Examples:`.
        const header = lines.slice(index + 1).find(line => line.trim().startsWith('|'));
        if (!header) continue;
        header.split('|').slice(1, -1)
            .map(cell => cell.trim())
            .filter(Boolean)
            .forEach(cell => columns.add(cell));
    }
    return columns;
}

/**
 * Un `<parametro>` sin Examples no se sustituye: Cucumber busca el step con los
 * angulos incluidos y no encuentra nada. Y una tabla de Examples dentro de un
 * `Scenario:` simple es un error de parseo, tiene que ser `Scenario Outline:`.
 */
export function missingExamples(feature: string): string[] {
    const placeholders = placeholdersIn(feature);
    if (!placeholders.length) return [];
    const problems: string[] = [];
    if (!/^\s*Scenario\s+Outline\s*:/mi.test(String(feature || ''))) {
        problems.push(
            `El Feature usa <${placeholders.join('>, <')}> pero declara "Scenario:": ` +
            'con parametros tiene que ser "Scenario Outline:" y traer su tabla Examples.'
        );
    }
    const columns = examplesColumns(feature);
    const missing = placeholders.filter(name => !columns.has(name));
    if (missing.length) {
        problems.push(
            `Faltan columnas en Examples para: <${missing.join('>, <')}>. ` +
            'Sin la columna, el parametro llega literal al step y nunca enlaza.'
        );
    }
    return problems;
}

/**
 * Valores parametrizados del Scenario por nombre de columna: Examples del
 * request y celdas de las DataTables de las filas. Son los datos que viajan
 * por argumento y nunca deben quedar fijos en Steps ni en el Screen Object.
 */
export function scenarioExampleValues(scenario: Pick<AutomationScenario, 'request'>): Record<string, string[]> {
    const values: Record<string, string[]> = {};
    const add = (column: string, value: unknown) => {
        const text = String(value ?? '').trim();
        if (!column || !text) return;
        values[column] = values[column] || [];
        if (!values[column].includes(text)) values[column].push(text);
    };
    for (const [column, value] of Object.entries(scenario.request?.examples || {})) add(column, value);
    for (const row of scenario.request?.scenarioRows || []) {
        const table = row.dataTable;
        if (!table?.headers?.length) continue;
        for (const cells of table.rows || []) {
            table.headers.forEach((header, index) => add(header, cells[index]));
        }
    }
    return values;
}

/**
 * Una columna de Examples que ningun step del Scenario nombra como <columna>
 * es un dato que el QA parametrizo y el caso ignora: la ejecucion no lo
 * recibe y el codigo termina con el literal de la grabacion.
 */
export function unusedExamplesColumns(feature: string): string[] {
    const problems: string[] = [];
    const lines = String(feature || '').split(/\r?\n/);
    let steps: string[] = [];
    let columns: string[] = [];
    let title = '';
    let inExamples = false;
    const flush = () => {
        if (!title || !columns.length) return;
        const referenced = new Set(steps.flatMap(step => [...step.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)].map(match => match[1])));
        const unused = columns.filter(column => !referenced.has(column));
        if (unused.length) {
            problems.push(
                `El Scenario "${title}" declara en Examples la(s) columna(s) <${unused.join('>, <')}> ` +
                'y ningún step las usa: el dato parametrizado tiene que nombrarse en el step que lo emplea ' +
                '(por ejemplo «el usuario ingresa su correo <email>») para que llegue por argumento.',
            );
        }
    };
    for (const line of lines) {
        const scenario = line.match(/^\s*Scenario(?: Outline)?\s*:\s*(.+)$/i);
        if (scenario) {
            flush();
            title = scenario[1].trim();
            steps = [];
            columns = [];
            inExamples = false;
            continue;
        }
        if (/^\s*Examples\s*:/i.test(line)) { inExamples = true; continue; }
        const step = line.match(/^\s*(?:Given|When|Then|And|But)\s+(.+)$/i);
        if (step) { steps.push(step[1]); inExamples = false; continue; }
        if (inExamples && line.trim().startsWith('|') && !columns.length) {
            columns = line.split('|').slice(1, -1).map(cell => cell.trim()).filter(Boolean);
        }
    }
    flush();
    return problems;
}

/**
 * Semantica de los keywords, tal como la fijo el QA:
 *
 *   Given: contexto o estado inicial.
 *   When:  accion que ejecuta el usuario o evento que ocurre.
 *   Then:  resultado esperado.
 *   And / But: complementan el paso anterior (heredan su tipo).
 *
 * Un step se clasifica por lo que ejecuta: si su ultima accion grabada es una
 * verificacion (`VERIFICAR_*`) es un resultado esperado; si ejecuta cualquier
 * otra accion es un comportamiento; sin acciones es contexto. Un `And` tras
 * `Then` es un resultado, nunca una accion: la accion que sigue a un `Then`
 * vuelve a ser `When`.
 */
export type GherkinStepKind = 'context' | 'behavior' | 'assertion';
export type GherkinKeyword = 'Given' | 'When' | 'Then' | 'And' | 'But';

export function gherkinStepKind(actions: ReadonlyArray<{ action: string }> | undefined): GherkinStepKind {
    if (!actions || actions.length === 0) return 'context';
    const last = actions[actions.length - 1];
    return /^VERIFICAR_/.test(String(last?.action || '')) ? 'assertion' : 'behavior';
}

const PRIMARY_KEYWORD: Record<GherkinStepKind, GherkinKeyword> = {
    context: 'Given',
    behavior: 'When',
    assertion: 'Then',
};

/** Keyword que corresponde a un step de `kind` cuando el anterior era `previous`. */
export function expectedGherkinKeyword(kind: GherkinStepKind, previous: GherkinStepKind | undefined): GherkinKeyword {
    return previous === kind ? 'And' : PRIMARY_KEYWORD[kind];
}

/** Recalcula los keywords de una secuencia de steps a partir de lo que ejecutan. */
export function semanticGherkinKeywords(steps: ReadonlyArray<{ actions?: ReadonlyArray<{ action: string }> }>): GherkinKeyword[] {
    let previous: GherkinStepKind | undefined;
    return steps.map(step => {
        const kind = gherkinStepKind(step.actions);
        const keyword = expectedGherkinKeyword(kind, previous);
        previous = kind;
        return keyword;
    });
}

/**
 * Un keyword escrito cumple la semantica si es el primario de su tipo o un
 * `And`/`But` que continua un step del mismo tipo. Un step de contexto solo
 * puede ir al inicio del Scenario (antes del primer comportamiento).
 */
export function gherkinKeywordAccepted(
    keyword: string,
    kind: GherkinStepKind,
    previous: GherkinStepKind | undefined,
): boolean {
    const normalized = String(keyword || '').trim();
    if (normalized === 'And' || normalized === 'But') return previous === kind;
    return normalized === PRIMARY_KEYWORD[kind];
}

/**
 * Redaccion en tercera persona («el usuario …») o impersonal («se muestra …»).
 * Primera persona («ingreso mi correo») e imperativo / segunda persona
 * («ingresa tu correo», «selecciona el boton») no son steps de negocio.
 */
// Los verbos solo cuentan al inicio del step (sujeto omitido): «ingreso»,
// «envío» o «inicio» tambien son sustantivos a mitad de frase.
const FIRST_PERSON_PATTERN =
    /(?:^|\s)(?:yo|mi|mis|conmigo)(?=\s|$)|^(?:yo\s+)?(?:quiero|puedo|tengo|estoy|soy|veo|hago|escribo|selecciono|presiono|pulso|toco|valido|verifico|confirmo|abro|cierro|busco|consulto|navego|reviso|acepto|cancelo|elijo|vuelvo)(?=\s|$)/i;
const SECOND_PERSON_PATTERN =
    /(?:^|\s)(?:t[uú]|tus|te|contigo|usted|ustedes|debes|puedes|tienes|quieres)(?=\s|$)|^(?:ingresa|ingrese|escribe|escriba|selecciona|seleccione|presiona|presione|pulsa|pulse|toca|toque|valida|valide|verifica|verifique|confirma|confirme|env[ií]a|env[ií]e|abre|abra|cierra|cierre|busca|busque|consulta|consulte|navega|navegue|inicia|inicie|revisa|revise|acepta|acepte|cancela|cancele|elige|elija|regresa|regrese|vuelve|vuelva|haz|haga|da|d[eé])(?=\s|$)/i;

// Un step que empieza en infinitivo («verificar que existe…», «enviar los
// movimientos») es una instruccion, no una frase en tercera persona ni
// impersonal.
const INFINITIVE_PATTERN =
    /^(?:verificar|validar|comprobar|revisar|ingresar|escribir|digitar|seleccionar|presionar|pulsar|tocar|confirmar|enviar|abrir|cerrar|buscar|consultar|navegar|iniciar|aceptar|cancelar|elegir|regresar|volver|hacer|dar|ver|mostrar|visualizar|realizar|completar|registrar|descargar|compartir|eliminar|editar|filtrar|aplicar|pagar|yapear)(?=\s|$)/i;

export type GherkinPersonIssue = 'first-person' | 'second-person' | 'infinitive';

export function gherkinPersonProblem(text: string): GherkinPersonIssue | undefined {
    const step = normalizeGherkinStep(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!step) return undefined;
    if (FIRST_PERSON_PATTERN.test(step)) return 'first-person';
    if (SECOND_PERSON_PATTERN.test(step)) return 'second-person';
    if (INFINITIVE_PATTERN.test(step)) return 'infinitive';
    return undefined;
}

export const gherkinContract = {
    normalizeGherkinStep,
    featureStepLines,
    rewrittenReusedSteps,
    missingExamples,
    scenarioExampleValues,
    unusedExamplesColumns,
    gherkinStepKind,
    expectedGherkinKeyword,
    semanticGherkinKeywords,
    gherkinKeywordAccepted,
    gherkinPersonProblem,
};
