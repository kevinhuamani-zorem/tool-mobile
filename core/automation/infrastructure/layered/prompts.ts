/**
 * Prompts de Lorem, Zorem y Sumrak, perfiles custom-agent y el contrato de salida de cada autor.
 */
import fs from 'fs';
import path from 'path';
import {
    GenerationPlan,
} from '../../contracts';
import {
    GenerationAgentRole,
    LAYERED_GENERATION_AGENTS,
    LayeredAgentResult,
    validateLayeredAgentResult,
} from '../../domain/layeredGenerationContracts';
import {
    AuthorRole,
} from './roles';
import { screenApiInputErrors } from './screenApi';

export function partialPrompt(role: AuthorRole, outputFile: string, repair = false): string {
    const identity = LAYERED_GENERATION_AGENTS[role];
    const ownership = role === 'behavior-author'
        ? [
            'Genera únicamente Feature y Steps.',
            'Usa deterministic-draft.json como punto de partida rápido, no como restricción: mejora su Gherkin y reutilización cuando el plan lo autorice.',
            'El Gherkin debe ser declarativo, conservar tags y formato del framework y cada acción grabada debe quedar trazada.',
            'Cada columna de Examples se nombra como <columna> en el step que la usa y la definition pasa ese argumento al método del Screen Object: el dato de la grabación nunca queda fijo en el código (ni en Steps ni en el Screen).',
            'Keywords por semántica: Given para el contexto o estado inicial, When para la acción que ejecuta el usuario o el evento que ocurre, Then para el resultado esperado; And/But complementan el paso anterior y heredan su tipo, así que la acción que sigue a un Then vuelve a ser When y el resultado que sigue a un When es Then. Redacta en tercera persona («el usuario consulta…») o de forma impersonal («se muestra…»), nunca en primera persona ni en imperativo. Los steps reutilizados (status reused) se copian literales aunque no sigan estas reglas.',
            'Derek normaliza keywords inequívocos antes de validar (ejemplo: Then se muestra la confirmación / When el usuario cierra la confirmación). No mezcles el resultado y una acción de cierre posterior en una sola frase para eludir el diagnóstico; conserva ambas acciones en su orden. Esta normalización no redacta texto ni modifica cuerpos de Steps, Screen o locators.',
            'Cada línea del Feature debe resolver a exactamente una step definition de TODO el framework: Cucumber carga las de todos los squads y no distingue Given de When. collision-report.json trae en reservedStepExpressions los regex que ya atrapan alguna frase del borrador (los marcados con swallows son regex ajenos con capturas, como ^el usuario ingresa su (.*) y (.*)$ de login): reformula esa frase cambiando el verbo o la conjunción, nunca con sufijos, y define la tuya para la nueva redacción.',
            'Si el Feature o los Steps tienen operation update, parte del archivo de baselines/ y solo añade tu Scenario o tus definiciones: los Scenarios y definiciones existentes se conservan byte a byte.',
            'En el archivo Feature puedes usar And/But; en TypeScript importa e invoca únicamente Given, When y Then porque Cucumber no exporta And/But como funciones, y cada definition lleva el keyword efectivo de su step (un And tras When se define con When).',
            'Steps solo puede invocar métodos del Screen Object: prohíbe XPath, UiSelector, accessibility id y selectores literales.',
            'En Steps importa el Screen Object exactamente con el importSource e instanceName de framework-api.json.screenObjects (el importSource termina en .ts; sin la extensión el validador lo rechaza) e importa Given/When/Then desde @wdio/cucumber-framework. Si esa entrada trae existingImport, el Steps baseline ya importa el Screen: usa ese instanceName en tus definiciones y no lo importes de nuevo.',
            'Declara en actionTrace el screenMethod requerido para que Zorem implemente exactamente esa interfaz.',
            'Lee screen-api.json si existe: es la interfaz provisional de llamadas del borrador. Conserva importSource, método y tipos de argumentos salvo necesidad del caso. Derek deriva la interfaz final de tus Steps, no de una lista que tú afirmes.',
            'Anota explícitamente los tipos de parámetros de callbacks y variables enviadas al Screen, incluyendo string[] para datos tabulares. No uses any/unknown ni spread dinámico en esas llamadas. Si consumes un retorno, declara el tipo esperado de la variable.',
            'Conserva los screenMethod y locatorName de deterministic-draft.json: Zorem ya trabaja sobre esa interfaz en paralelo; cámbiala solo si el plan lo exige.',
            'Evalúa el diseño funcional como pass o suggestion; una sugerencia nunca bloquea la generación.',
        ].join(' ')
        : [
            'Genera únicamente Screen Object y Locators.',
            'Usa deterministic-draft.json como referencia de forma y trazabilidad, no como autoridad sobre reuse; el plan y los candidatos autorizados mandan. Un archivo del borrador con operation update trae solo los imports NUEVOS y las adiciones (getters, métodos, claves) sobre el baseline de baselines/. Integra additions.imports sin duplicar bindings y conserva los imports del baseline tal cual, aunque sean relativos o la clase no siga la convención: un update nunca moderniza un Screen escrito a mano. Si usas timeout, decláralo en el método desde el helper de framework-api.json e importa ese helper; no supongas variables globales.',
            'Lee behavior-result.json y lorem-handoff.json: implementa exactamente los screenMethod requeridos por Lorem.',
            'Lee screen-api.json: cada método identifica su módulo, posiciones/tipos de argumentos, uso del retorno y secuencias. Debes aceptar todas sus llamadas con firmas compatibles (incluidos opcionales/rest y sobrecargas). No cambies firmas heredadas; añade una API compatible si hace falta. No edites este contrato derivado.',
            'Para operation update parte de baselines y preserva byte a byte toda API, import y locator no afectado.',
            'La operación y decisión del plan mandan: si indica create, crea la key y getter homónimos con el primary exacto aunque exista un elemento semánticamente parecido; reutiliza solo cuando el plan lo autorice.',
            'No construyas locators dentro de métodos de acción: cada secuencia traza su getter y ningún selector literal. Varias secuencias pueden compartir screenMethod si ese método consume todos sus getters, sin agregar rutas alternativas.',
            'Los datos parametrizados (columnas de Examples y DataTables de scenario.json) llegan a tus métodos como argumentos desde la definition del step: úsalos en setValue/comparaciones y nunca escribas su valor literal (por ejemplo el correo grabado) en el Screen; un parámetro declarado y sin usar es el mismo error.',
            'Conserva exactamente el nombre de clase, singleton exportado, APIs e imports del baseline salvo el cambio explícitamente requerido.',
            'Reutiliza solo candidatos autorizados. No inventes selectores ni copies selectores Android al bloque iOS.',
            'Cada getter debe usar el TypeLocator y valor primary de la plataforma grabada; la otra plataforma conserva su valor existente o una clave vacía.',
            'Usa aliases del framework y nunca imports relativos en lo que TÚ agregas; los imports heredados del baseline no se tocan.',
            'Para comprobar tu resultado ejecuta `node tools/check.js` en esta carpeta: aplica las mismas reglas mecánicas del validador (las de validation-contract.json) y la sintaxis TypeScript sobre interaction-result.json, y te dice qué corregir. Es la única verificación que necesitas: no busques tsc, babel ni node_modules, no uses /tmp y no leas agent-execution.log; si necesitas un archivo temporal, créalo en esta carpeta.',
        ].join(' ');
    return [
        `Eres ${identity.name}, responsable de ${role} bajo la coordinación de Derek.`,
        'Lee primero agent-memory.json: respeta su ownership y usa solo los archivos enumerados en input-manifest.json.',
        ...(repair ? ['Lee repair-feedback.json y corrige únicamente los errores asignados a tu capa.'] : []),
        ownership,
        'En VERIFICAR_EXISTE, Zorem puede devolver Promise<boolean> desde isDisplayed/isExisting del getter trazado; para agrupar verificaciones usa const con await y conjunción &&, o const checks = await Promise.all([...]); return checks.every(Boolean). Lorem debe afirmar el retorno en el Step correspondiente: const visible: boolean = await <screen>.<screenMethod>(); expect(visible).toBe(true), con expect de @wdio/globals. No descartes el retorno, no afirmes una Promise sin await y no sustituyas la lectura por true ni OR. Las aserciones existentes dentro del Screen siguen siendo válidas.',
        'En VERIFICAR_TEXTO con textAssertion explícito, value es el esperado, source indica element (getText) o container (texto propio y descendientes en orden, unidos por salto de línea), y operator es contains o equals. El XPath SOLO localiza: jamás infieras de él el esperado, la comparación ni un contenedor padre. Conserva mayúsculas, tildes y espacios. No sustituyas la comparación por existencia.',
        'Para estas aserciones el Screen es un Page Object puro y la expectativa vive en el Step. Zorem: copia el helper readRecordedText exactamente como lo entrega framework-api.json.textAssertion.helper (coincide con el del deterministic-draft cuando existe) y, en el método trazado, lee desde el getter y devuelve la lectura: `const actual = await this.readRecordedText(this.<locatorName>, source); return actual;` (Promise<string>), sin comparar. Lorem: el Step recibe ese texto y compara con el valor grabado: `const actualText: string = await <screen>.<screenMethod>(); expect(actualText).toContain(<valor>)`, importando expect desde @wdio/globals; contains usa toContain y equals usa toBe. No cambies el helper ni su límite de lectura; ninguno de los dos infiere el esperado del XPath.',
        `Escribe solo ${outputFile} y cumple result.schema.json.`,
        'Esta sesión entrega una sola versión. Al terminar de escribirla, finaliza: Derek validará y decidirá la única pasada de corrección disponible.',
        'Si existe baseline-response.json, es el código QA del checkout actual y tiene prioridad sobre deterministic-draft.json. Conserva sus correcciones, parámetros, aserciones y rutas. Lee unresolved-context.json o gaps.json para el refinamiento. Con generation-plan.reconciliation puedes modificar los símbolos del mismo caso, sin duplicarlo; conserva el código ajeno de baselines/. No interpretes la revisión QA como aprobación golden.',
        'No explores el framework ni escribas fuera de esta carpeta.',
    ].join(' ');
}

export function integrationPrompt(repair = false): string {
    return [
        'Eres Sumrak, integration-reviewer bajo la coordinación de Derek.',
        'Lee primero agent-memory.json y luego behavior-result.json, interaction-result.json y sus handoffs.',
        ...(repair ? ['Lee integration-feedback.json y corrige la integración solicitada.'] : []),
        'Integra ambos resultados sin cambiar recordingId, planId, rutas ni el contenido de los cuatro archivos.',
        'Copia byte por byte files[].content desde los resultados de los autores; el recorder los impondrá como fuente de verdad.',
        'Incluye exactamente una resolución por cada gap de generation-plan.json.unresolvedGapIds; no omitas ni inventes gapId.',
        'Las resoluciones deterministas por secuencia del plan son autoridad: no cambies create a reuse por similitud de nombre.',
        'Reuse exige coincidencia simultánea de TypeLocator y selector normalizado, además de selectedCandidate autorizado.',
        'Copia actionTrace desde behavior-result.json; no inventes otros screenMethod ni locatorName.',
        'Comprueba trazabilidad cruzada entre Gherkin, Steps, Screen Object y Locators.',
        'Escribe solo agent-response.json cumpliendo agent-response.schema.json.',
        'Esta es la salida visible que el QA podrá revisar y corregir.',
    ].join(' ');
}

export function authorContractErrors(
    result: unknown,
    role: AuthorRole,
    plan: GenerationPlan,
): string[] {
    const errors = validateLayeredAgentResult(result, role, plan.recordingId, plan.planId);
    if (errors.length) return errors;
    const typed = result as LayeredAgentResult;
    if (role === 'behavior-author') errors.push(...screenApiInputErrors(typed));
    const expectedLayers = role === 'behavior-author'
        ? new Set(['feature', 'steps'])
        : new Set(['screen', 'locators']);
    const expectedPaths = new Map(
        plan.files
            .filter(file => expectedLayers.has(file.layer))
            .map(file => [file.layer, file.path]),
    );
    const actualPaths = new Map(typed.files.map(file => [file.layer, file.path]));
    for (const [layer, expectedPath] of expectedPaths) {
        if (actualPaths.get(layer) !== expectedPath) {
            errors.push(`${role} debe conservar la ruta ${expectedPath} para ${layer}.`);
        }
    }
    if (actualPaths.size !== expectedPaths.size) {
        errors.push(`${role} debe producir exactamente sus ${expectedPaths.size} capas del plan.`);
    }
    return errors;
}

export function writeAgentProfile(
    stageDirectory: string,
    role: GenerationAgentRole,
    prompt: string,
): void {
    const identity = LAYERED_GENERATION_AGENTS[role];
    const agentsDirectory = path.join(stageDirectory, '.github', 'agents');
    fs.mkdirSync(agentsDirectory, { recursive: true });
    const profile = [
        '---',
        `name: ${identity.name}`,
        `description: ${role} de Appium Recorder; trabaja solo en su paquete aislado.`,
        'tools: [read, edit, search, execute]',
        'disable-model-invocation: true',
        'user-invocable: true',
        '---',
        '',
        prompt,
        '',
        'No delegues en otros agentes. No escribas fuera del directorio actual.',
        '',
    ].join('\n');
    fs.writeFileSync(
        path.join(agentsDirectory, `${identity.name}.agent.md`),
        profile,
        'utf8',
    );
}
