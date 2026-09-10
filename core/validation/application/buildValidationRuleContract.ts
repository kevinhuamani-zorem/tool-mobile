import type {
    ValidationRuleContract,
    ValidationRuleContractEntry,
} from '../domain/validationRule';
import { RECORDED_TEXT_READER, SCREEN_OBJECT_CONTRACT_RULE_CODES } from '../../automation/contracts';

function normalizeWhitespace(value: string): string {
    return value
        .replace(/\$\{[^}]+\}/g, '<valor>')
        .replace(/\s+/g, ' ')
        .trim();
}

function readQuoted(source: string, start: number): { value: string; end: number } | null {
    const quote = source[start];
    if (!['"', '\'', '`'].includes(quote)) return null;
    let i = start + 1;
    let value = '';
    while (i < source.length) {
        const ch = source[i];
        if (ch === '\\') {
            if (i + 1 < source.length) {
                value += source[i + 1];
                i += 2;
                continue;
            }
            break;
        }
        if (ch === quote) {
            return { value, end: i + 1 };
        }
        value += ch;
        i++;
    }
    return null;
}

function requirementFromWindow(windowText: string): string {
    const messageIndex = windowText.indexOf('message:');
    if (messageIndex < 0) return 'Cumplir la regla validada por este código.';
    const after = windowText.slice(messageIndex + 'message:'.length).trimStart();
    const first = readQuoted(after, 0);
    if (!first) return 'Cumplir la regla validada por este código.';
    const tail = after.slice(first.end).trimStart();
    if (tail.startsWith('+')) {
        const next = readQuoted(tail.slice(1).trimStart(), 0);
        if (next) return normalizeWhitespace(`${first.value} ${next.value}`);
    }
    return normalizeWhitespace(first.value);
}

interface RuleGuidance {
    requirement: string;
    minimalExample: string;
}

const EXAMPLE_SCENARIO_THEN =
    'features/yape-features/autoatencion/native/movements/happy-path-movements.feature\n' +
    'Then se debe mostrar solo 2 movimientos';

const EXAMPLE_SCENARIO_OUTLINE =
    'features/yape-features/autoatencion/native/movements/happy-path-movements.feature\n' +
    'Scenario Outline: [HP][NT][CDA] Validar que se actualice correctamente los nuevos movimientos en CDA\n' +
    'Examples:\n' +
    '  | username | cellphone | highamount | amount | comment |';

const EXAMPLE_STEPS_ALIAS =
    'features/yape-steps-definitions/payment/confirmacion-envio-email-movements.steps.ts\n' +
    "import confirmacionEnvioEmailMovementsScreen from '@screenobjects/payment/confirmacion-envio-email-movements.screen.ts';\n" +
    'await confirmacionEnvioEmailMovementsScreen.tapSeeAllMovements();';

const EXAMPLE_SCREEN_GETTER =
    'screenobjects/payment/confirmacion-envio-email-movements.screen.ts\n' +
    'const locator = LocatorProvider.getElement(\n' +
    '  TypeLocator.ID, LocatorConfirmacionEnvioEmailMovements.confirmacionEnvioEmailMovementsIos.seeAllMovements,\n' +
    '  TypeLocator.ANDROID, LocatorConfirmacionEnvioEmailMovements.confirmacionEnvioEmailMovementsAndroid.seeAllMovements\n' +
    ');';

const EXAMPLE_LOCATOR_BLOCK =
    'resources/locators/payment/confirmacion-envio-email-movements.locator.json\n' +
    '"confirmacionEnvioEmailMovementsAndroid": {\n' +
    '  "seeAllMovements": "new UiSelector().description(\\"Ver todos\\")"\n' +
    '}';

const EXAMPLE_SCHEMA_FILES =
    'tools/visual-recorder/runtime/recordings/.../generation/automation/agent-response.schema.json\n' +
    '"files": { "type": "array", "minItems": 4, "maxItems": 4 }';

const EXAMPLE_PLAN_FILES =
    'tools/visual-recorder/runtime/recordings/.../generation/automation/generation-plan.json\n' +
    '{ "layer": "feature", "path": "features/yape-features/payment/verify-sales-message.feature", "operation": "create" }\n' +
    '{ "layer": "steps", "path": "features/yape-steps-definitions/payment/verify-sales-message.steps.ts", "operation": "create" }\n' +
    '{ "layer": "screen", "path": "screenobjects/payment/verify-sales-message.screen.ts", "operation": "create" }\n' +
    '{ "layer": "locators", "path": "resources/locators/payment/verify-sales-message.locator.json", "operation": "create" }';

const EXAMPLE_RESPONSE_SHAPE =
    'tools/visual-recorder/runtime/recordings/.../generation/automation/agent-response.schema.json\n' +
    '{ "recordingId": "rec-...", "planId": "plan-...", "resolutions": [], "actionTrace": [], "files": [] }';

const RULE_GUIDANCE: Record<string, RuleGuidance> = {
    'test-data-user-missing': {
        requirement: 'Cada usuario enviado al login debe existir por nombre en resources/data/**/*.yml. test-data-context.json enumera availableUsers del squad y la selección automática cuando QA no indicó uno. Conserva el dato QA explícito y los Examples aprobados al regenerar; comunica discrepancias sin inventar usuarios ni filas adicionales.',
        minimalExample: 'resources/data/payment/qa.yml: name: QA Aprobado\nExamples:\n  | username |\n  | QA Aprobado |',
    },
    assertion: {
        requirement: 'Cada Scenario debe terminar con al menos un Then que verifique resultado de negocio.',
        minimalExample: EXAMPLE_SCENARIO_THEN,
    },
    'completion-duplicate': {
        requirement: 'Cada accion debe declarar como maximo un completion por key/target.',
        minimalExample:
            `${EXAMPLE_PLAN_FILES}\n` +
            'completionTargets: []',
    },
    'completion-file': {
        requirement: 'Cada completion debe apuntar a un archivo locator existente y legible del framework.',
        minimalExample: EXAMPLE_LOCATOR_BLOCK,
    },
    'completion-key': {
        requirement: 'Cada completion debe usar una key existente dentro del bloque locator de su plataforma.',
        minimalExample: EXAMPLE_LOCATOR_BLOCK,
    },
    'completion-occupied': {
        requirement: 'Completion solo debe completar keys vacias; nunca debe sobrescribir valores ya definidos.',
        minimalExample:
            'resources/locators/payment/confirmacion-envio-email-movements.locator.json\n' +
            '"seeAllMovements": "new UiSelector().description(\\"Ver todos\\")"',
    },
    'completion-platform': {
        requirement: 'El completion debe usar el selector de la misma plataforma de la accion grabada.',
        minimalExample:
            `${EXAMPLE_SCREEN_GETTER}\n` +
            'El argumento iOS se llena con ...Ios.<key> y Android con ...Android.<key>.',
    },
    'completion-sequence': {
        requirement: 'Cada completion debe referenciar una sequence existente en la grabacion.',
        minimalExample:
            'generation-plan.json\n' +
            '"resolutions": [{ "sequence": 1, ... }, { "sequence": 2, ... }]',
    },
    'completion-shape': {
        requirement: 'Cada completion debe respetar exactamente su schema sin campos extra.',
        minimalExample:
            'agent-response.schema.json\n' +
            '"completions": { "items": { "required": ["file","name","platform","sequence"], "additionalProperties": false } }',
    },
    'completion-unauthorized': {
        requirement: 'Cada completion debe coincidir con un completionTarget permitido por el plan.',
        minimalExample:
            'generation-plan.json\n' +
            '"completionTargets": []',
    },
    'create-locator-contract': {
        requirement: 'Cada create debe declarar exactamente el par primary verificado en getter homonimo y bloque de plataforma.',
        minimalExample: `${EXAMPLE_SCREEN_GETTER}\n${EXAMPLE_LOCATOR_BLOCK}`,
    },
    'destructive-update': {
        requirement: 'Cada update debe preservar APIs existentes y agregar solo lo faltante.',
        minimalExample:
            'screenobjects/payment/confirmacion-envio-email-movements.screen.ts\n' +
            'class ConfirmacionEnvioEmailMovementsScreen extends BaseScreen { ... tapSeeAllMovements() ... }',
    },
    'duplicate-layer': {
        requirement: 'Cada respuesta debe incluir una sola entrada por capa: feature, steps, screen y locators.',
        minimalExample: EXAMPLE_SCHEMA_FILES,
    },
    'duplicate-screen-method': {
        requirement: 'Cada metodo de Screen Object debe existir una sola vez por nombre.',
        minimalExample:
            'screenobjects/payment/confirmacion-envio-email-movements.screen.ts\n' +
            'public async tapSeeAllMovements() { ... }',
    },
    'duplicate-step-definition': {
        requirement: 'Cada expresion Given/When/Then debe declararse una sola vez en el archivo steps.',
        minimalExample:
            'features/yape-steps-definitions/payment/confirmacion-envio-email-movements.steps.ts\n' +
            'Then(/^confirmacion de envio de correo$/, async () => { ... });',
    },
    'empty-file': {
        requirement: 'Cada archivo generado debe tener contenido funcional no vacio.',
        minimalExample:
            'screenobjects/payment/confirmacion-envio-email-movements.screen.ts\n' +
            'class ConfirmacionEnvioEmailMovementsScreen extends BaseScreen { ... }',
    },
    'existing-automation': {
        requirement: 'Cuando la automatizacion ya existe, la respuesta debe reutilizarla en lugar de recrearla.',
        minimalExample:
            'resources/locators/home/home.locator.json\n' +
            'lblRecentMovements se reutiliza desde HomeScreen.',
    },
    'extra-layer': {
        requirement: 'La respuesta debe generar solo las cuatro capas solicitadas por el plan.',
        minimalExample: EXAMPLE_PLAN_FILES,
    },
    'file-shape': {
        requirement: 'Cada entrada de files debe incluir solo layer, path y content.',
        minimalExample: EXAMPLE_SCHEMA_FILES,
    },
    'framework-import-alias': {
        requirement: 'El Screen Object debe importar BaseScreen, LocatorProvider y TypeLocator con aliases del framework.',
        minimalExample:
            'screenobjects/payment/confirmacion-envio-email-movements.screen.ts\n' +
            "import BaseScreen from '@screenobjects/commons/base.screen.ts';\n" +
            "import LocatorProvider from '@common/locators/locator-provider.js';\n" +
            "import { TypeLocator } from '@common/enums/locator-type.enum.js';",
    },
    'framework-locator-collision': {
        requirement: 'Si un selector ya existe en el framework para el mismo elemento, debe reutilizarse y no duplicarse. ' +
            'La excepción la fija el plan: un locator `create` marcado `unspecificSelector` (className, instance(n) o XPath ' +
            'sin predicado) se crea en el módulo del caso aunque otro módulo tenga el mismo selector, porque no identifica al mismo elemento.',
        minimalExample:
            'resources/locators/payment/confirmacion-envio-email-movements.locator.json\n' +
            '"seeAllMovements": "new UiSelector().description(\\"Ver todos\\")"',
    },
    'framework-scenario-collision': {
        requirement: 'Si ya existe un Scenario equivalente en el framework, debe actualizarse/reutilizarse ese caso.',
        minimalExample: EXAMPLE_SCENARIO_THEN,
    },
    'framework-step-collision': {
        requirement: 'Si ya existe un step definition literal, debe copiarse tal cual y reutilizarse.',
        minimalExample:
            'features/yape-features/autoatencion/native/movements/happy-path-movements.feature\n' +
            'Given el usuario <username> inicia sesión en Yape',
    },
    'step-ambiguous': {
        requirement: 'Cada línea del Feature debe resolver a exactamente una step definition de todo el framework: Cucumber carga las de todos los squads, no distingue Given de When y un regex ajeno con capturas que atrape la frase la deja ambigua (Multiple step definitions match). Si collision-report.json marca un regex con swallows, hay que cambiar la redacción de la frase (verbo o conjunción), no sufijarla.',
        minimalExample:
            '# ^el usuario ingresa su (.*) y (.*)$ (login) atrapa «el usuario ingresa su correo <email> y selecciona enviar»\n' +
            'When el usuario solicita sus movimientos al correo <email>\n' +
            'When(/^el usuario solicita sus movimientos al correo (.*)$/, async (email: string) => { await movementsScreen.requestByEmail(email); });',
    },
    'step-undefined': {
        requirement: 'Toda línea del Feature debe tener su definición en Steps, o copiarse literal si reutiliza una definición existente del framework: una línea que ningún regex resuelve queda undefined al ejecutar.',
        minimalExample:
            'When el usuario solicita el reporte de movimientos\n' +
            'When(/^el usuario solicita el reporte de movimientos$/, async () => { await movementsScreen.requestReport(); });',
    },
    'framework-symbol': {
        requirement: 'Los simbolos usados en Screen/Steps deben existir en el contrato del framework-api entregado.',
        minimalExample:
            'framework-api.json\n' +
            '"locatorProvider": { "symbol": "LocatorProvider", "import": "@common/locators/locator-provider.js" }',
    },
    'gap-resolution-decision': {
        requirement: 'Cada gap abierto debe declarar una decision explicita en resolutions[].',
        minimalExample:
            'agent-response.schema.json\n' +
            '"resolutions": [{ "gapId": "gap-duplicate-element-1", "decision": "reuse", "reason": "..." }]',
    },
    'imperative-gherkin': {
        requirement: 'Cada paso Gherkin nuevo debe describir la intención de negocio o el resultado observado del grupo completo de acciones, ' +
            'no la última etiqueta ni una cadena técnica como «el usuario selecciona cerrar» o «el usuario selecciona seleccionar número». ' +
            'Clicks, permisos, cierres auxiliares, scrolls, esperas y selectores pertenecen al Screen Object. ' +
            'Si cerrar/cancelar es el objetivo, debe nombrar la entidad y el efecto observado. ' +
            'Los steps reutilizados deben conservar su texto literal. Al agrupar, debe conservar todas las secuencias y su orden en actionTrace, ' +
            'y cada parámetro en Gherkin, Examples/DataTable y argumentos del Screen. Un nombre de éxito no sustituye una aserción grabada; ' +
            'si solo se observa la pantalla, debe expresar esa comprobación y emitir testDesignReview.status suggestion sin bloquear exportación.',
        minimalExample:
            'When el usuario identifica al destinatario mediante el número <number>\n' +
            'When el usuario solicita sus movimientos al correo <email>\n' +
            '# Solo cuando una verificación grabada acredita la confirmación:\n' +
            'Then se muestra la confirmación de la solicitud',
    },
    'examples-unused-column': {
        requirement: 'Cada columna de Examples debe nombrarse como <columna> en algún step del Scenario que la ' +
            'emplea (por ejemplo «el usuario ingresa su correo <email>»), para que el dato llegue por argumento y ' +
            'nunca quede fijo el valor de la grabación.',
        minimalExample:
            'features/yape-features/payment/send-movements-by-email.feature\n' +
            'When el usuario ingresa su correo <email> y confirma el envío\n' +
            'Examples:\n  | username   | email          |\n  | usuario_qa | qa@yape.com.pe |',
    },
    'parameter-not-forwarded': {
        requirement: 'Cada parámetro que recibe una definition (captura del step) debe pasarse como argumento al ' +
            'método del Screen Object; la definition nunca lo descarta.',
        minimalExample:
            'features/yape-steps-definitions/payment/send-movements-by-email.steps.ts\n' +
            'When(/^el usuario ingresa su correo (.*) y confirma el envío$/, async (email: string) => {\n' +
            '    await movementsScreen.enterEmailAndConfirm(email);\n});',
    },
    'parameter-unused': {
        requirement: 'Cada parámetro que declara un método del Screen Object debe usarse en su cuerpo (es el dato ' +
            'que se escribe o compara); un parámetro declarado y un literal en su lugar es el valor fijo de la grabación.',
        minimalExample:
            'screenobjects/payment/movements.screen.ts\n' +
            'public async enterEmailAndConfirm(email: string): Promise<void> {\n' +
            '    await this.uiHelper.waitForElementExistByLocator(this.emailInput, true);\n' +
            '    await this.emailInput.setValue(email);\n    await this.btnsend.click();\n}',
    },
    'example-value-hardcoded': {
        requirement: 'Un valor de Examples o de una DataTable debe llegar al Screen Object y a los Steps como ' +
            'argumento; nunca debe escribirse como literal en el código.',
        minimalExample:
            'screenobjects/payment/movements.screen.ts\n' +
            'await this.emailInput.setValue(email); // nunca setValue(\'qa@yape.com.pe\')',
    },
    'gherkin-keyword': {
        requirement: 'Cada step debe usar el keyword de su tipo: Given para el contexto o estado inicial, When para la ' +
            'acción que ejecuta el usuario o el evento que ocurre, Then para el resultado esperado; And/But complementan ' +
            'el paso anterior y heredan su tipo, así que la acción que sigue a un Then vuelve a ser When y el resultado ' +
            'que sigue a un When es Then.',
        minimalExample:
            'features/yape-features/payment/send-movements-by-email.feature\n' +
            'Given el usuario <username> inicia sesión en Yape\n' +
            'When el usuario consulta todos sus movimientos\n' +
            'Then se muestra la pantalla de movimientos\n' +
            'When el usuario ingresa su correo <email> y confirma el envío\n' +
            'Then se muestra el mensaje de correo enviado',
    },
    'gherkin-person': {
        requirement: 'Cada step debe redactarse en tercera persona («el usuario consulta…») o de forma impersonal ' +
            '(«se muestra…»); nunca en primera persona («ingreso mi correo») ni en imperativo o segunda persona ' +
            '(«ingresa tu correo», «selecciona el botón»).',
        minimalExample:
            'features/yape-features/payment/send-movements-by-email.feature\n' +
            'When el usuario ingresa su correo <email> y confirma el envío\n' +
            'Then se muestra el mensaje de correo enviado',
    },
    'generic-template-gherkin': {
        requirement: 'Los ciclos repetidos deben expresarse como un comportamiento y una expectativa observables, sin una pareja generica de steps por cada variante.',
        minimalExample:
            'features/yape-features/payment/filter-movements.feature\n' +
            'When el usuario consulta sus movimientos\n' +
            'Then se muestran los movimientos esperados al aplicar cada filtro',
    },
    'invalid-locator-access': {
        requirement: 'Los locators deben usar identificador semantico y notacion de punto, nunca corchetes.',
        minimalExample:
            'screenobjects/payment/confirmacion-envio-email-movements.screen.ts\n' +
            'LocatorConfirmacionEnvioEmailMovements.confirmacionEnvioEmailMovementsAndroid.seeAllMovements',
    },
    'locator-bracket-notation': {
        requirement: 'Todo acceso a un locator JSON debe usar <Alias>.<bloqueAndroid|bloqueIos>.<locator>; están prohibidos los corchetes.',
        minimalExample:
            'screenobjects/payment/movements.screen.ts\n' +
            'LocatorMovements.movementsAndroid.showMovements\n' +
            'LocatorMovements.movementsIos.showMovements',
    },
    'locator-import-identifier': {
        requirement: 'El identificador importado debe derivarse del archivo: movements.locator.json se importa como LocatorMovements, salvo que el Screen existente ya lo importe con otro nombre (framework-api.json.locatorContract.modules[].identifier).',
        minimalExample:
            'screenobjects/payment/movements.screen.ts\n' +
            "import LocatorMovements from '@locators/payment/movements.locator.json' with { type: 'json' };",
    },
    'unicode-encoding': {
        requirement: 'Los cuatro archivos deben conservar tildes, eñes y Unicode como UTF-8 válido, sin caracteres de reemplazo ni mojibake.',
        minimalExample:
            'resources/locators/payment/movements.locator.json\n' +
            '"filterLast30Days": "new UiSelector().text(\\"Últimos 30 días\\")"',
    },
    'unicode-normalization': {
        requirement: 'Todo texto generado debe usar normalización Unicode NFC sin BOM.',
        minimalExample:
            'resources/locators/payment/movements.locator.json\n' +
            '"informationButton": "new UiSelector().text(\\"Más información\\")"',
    },
    'invented-selector': {
        requirement: 'Cada locator create debe usar el selector verificado del recording, sin inventar uno nuevo.',
        minimalExample:
            `${EXAMPLE_LOCATOR_BLOCK}\n` +
            'El valor coincide con el selector verificado de la accion.',
    },
    'recorded-locator-conflict': {
        requirement: 'Tipo, valor, selector y plataforma grabados deben concordar. Conserva la evidencia y solicita verificación QA ante contradicción.',
        minimalExample: 'android=new UiSelector().text("Movimientos") → ANDROID + new UiSelector().text("Movimientos")',
    },
    'locator-type-unverified': {
        requirement: 'El getter debe declarar un TypeLocator y una referencia del JSON verificables mediante el contrato getElement del framework.',
        minimalExample: EXAMPLE_SCREEN_GETTER,
    },
    'locator-type-mismatch': {
        requirement: 'TypeLocator y valor deben coincidir con la evidencia grabada, incluso en getters reutilizados o si el JSON no cambió. Respeta el orden de plataformas del framework.',
        minimalExample: EXAMPLE_SCREEN_GETTER,
    },
    'missing-examples': {
        requirement: 'Todo paso con <parametro> debe declararse en Scenario Outline con su tabla Examples.',
        minimalExample: EXAMPLE_SCENARIO_OUTLINE,
    },
    'missing-gap-resolution': {
        requirement: 'La respuesta debe incluir una resolucion por cada gap abierto del plan.',
        minimalExample:
            `${EXAMPLE_RESPONSE_SHAPE}\n` +
            'resolutions[] incluye todos los gapId abiertos.',
    },
    'missing-layer': {
        requirement: 'La respuesta debe incluir feature, steps, screen y locators.',
        minimalExample: EXAMPLE_PLAN_FILES,
    },
    'missing-update-target': {
        requirement: 'Todo update debe apuntar a un archivo existente en el framework antes de escribir.',
        minimalExample:
            'features/yape-steps-definitions/payment/confirmacion-envio-email-movements.steps.ts',
    },
    'non-english-identifier': {
        requirement: 'Nombres tecnicos (metodos, getters, variables) deben ir en ingles en codigo TypeScript.',
        minimalExample:
            'screenobjects/payment/confirmacion-envio-email-movements.screen.ts\n' +
            'public async validateEmailSentConfirmationMessage() { ... }',
    },
    output: {
        requirement: 'La salida debe cumplir agent-response.schema.json y cerrar el caso con trazabilidad y asercion.',
        minimalExample: EXAMPLE_RESPONSE_SHAPE,
    },
    path: {
        requirement: 'Cada files[].path debe coincidir exactamente con una ruta planificada en generation-plan.json.',
        minimalExample: EXAMPLE_PLAN_FILES,
    },
    'plan-id': {
        requirement: 'agent-response.planId debe ser exactamente el mismo planId del paquete.',
        minimalExample:
            'generation-plan.json\n' +
            '"planId": "plan-b593f28e3c286b3b93d45e80"\n' +
            'agent-response.json\n' +
            '"planId": "plan-b593f28e3c286b3b93d45e80"',
    },
    'platform-coverage': {
        requirement: 'Cada key usada por un getter debe tener cobertura valida en la plataforma grabada.',
        minimalExample:
            'resources/locators/payment/confirmacion-envio-email-movements.locator.json\n' +
            '"confirmacionEnvioEmailMovementsAndroid": { "seeAllMovements": "new UiSelector().description(\\"Ver todos\\")" }',
    },
    'platform-tag': {
        requirement: 'El Feature debe incluir tags de plataforma coherentes con la cobertura real de locators.',
        minimalExample:
            'features/yape-features/autoatencion/native/movements/happy-path-movements.feature\n' +
            '@autoatencion @regresion_lista_movimientos @dosultimosmov',
    },
    preview: {
        requirement: 'Toda escritura final debe venir de un preview vigente del mismo plan/contexto.',
        minimalExample:
            'generation-plan.json\n' +
            '"fingerprint": "56fc5eb0ef7aa757cd14f024414c2ff3e69b434d7818950d31741c3d90b8235e"',
    },
    'recording-id': {
        requirement: 'agent-response.recordingId debe ser exactamente el recordingId del paquete.',
        minimalExample:
            'generation-plan.json\n' +
            '"recordingId": "rec-f7c98dff-d5da-4ffb-9039-2cbb1eca6f7e"\n' +
            'agent-response.json\n' +
            '"recordingId": "rec-f7c98dff-d5da-4ffb-9039-2cbb1eca6f7e"',
    },
    'resolution-shape': {
        requirement: 'Cada resolutions[] debe tener solo gapId, decision y reason opcional.',
        minimalExample:
            'agent-response.schema.json\n' +
            '"resolutions": { "items": { "required": ["gapId","decision"], "additionalProperties": false } }',
    },
    'resolution-needs-args': {
        requirement: 'Cada resolutions[].needs[] debe incluir args como objeto JSON válido.',
        minimalExample:
            'agent-response.schema.json\n' +
            '{ "gapId": "gap-framework-query", "decision": "unresolved", "needs": [{ "query": "listFrameworkFiles", "args": { "path": "resources/locators/payment" } }] }',
    },
    'resolution-needs-query': {
        requirement: 'Cada resolutions[].needs[] debe usar una query soportada por FRAMEWORK_CONTEXT_QUERIES.',
        minimalExample:
            'agent-response.schema.json\n' +
            '{ "needs": [{ "query": "readFrameworkFile", "args": { "path": "resources/locators/payment/example.locator.json" } }] }',
    },
    'resolution-needs-shape': {
        requirement: 'Cada resolutions[].needs[] debe declarar exclusivamente query y args sin campos extra.',
        minimalExample:
            'agent-response.schema.json\n' +
            '{ "needs": [{ "query": "searchFrameworkContent", "args": { "pattern": "TypeLocator" } }] }',
    },
    'case-identity-unavailable': {
        requirement: 'La identidad del TC debe comprobarse contra un catálogo del framework disponible. Una consulta fallida conserva el borrador con diagnóstico, sin acreditar ausencia de colisiones.',
        minimalExample: 'Si el índice no puede leerse, conservar los archivos y reanalizar el framework; no declarar que TC-10140 es único sin evidencia.',
    },
    'case-duplicate': {
        requirement: 'Un TC debe identificar un solo Scenario o Scenario Outline en el Feature. Cambiar la descripción no autoriza duplicarlo; varias filas Examples pertenecen al mismo escenario.',
        minimalExample: 'Actualizar [TC-10140] Filtro de movimientos conservando su cobertura; no añadir [TC-10140] Visualiza movimientos como segundo escenario.',
    },
    'framework-case-collision': {
        requirement: 'Cuando el TC ya existe en el catálogo, debe conservar su Feature de origen; no crees una segunda identidad en otra ruta.',
        minimalExample: 'TC-10140 existe en payment/movements.feature: actualizar ese archivo, no crear payment/view-movements.feature con el mismo TC.',
    },
    'acceptance-contract': {
        requirement: 'Los criterios estructurados deben conservar la autoridad de la confirmación QA. Conserva identificadores, tipo, acciones y valores esperados; un criterio manual permanece no evaluado hasta registrar evidencia QA de esta versión.',
        minimalExample: 'Un criterio manual de éxito en dispositivo conserva estado not-evaluated; la respuesta del agente o la presencia de una fecha no lo aprueba.',
    },
    'acceptance-date-range': {
        requirement: 'El criterio de rango debe tener una aserción reconocida sobre fechas y el número de días esperado, enlazada al caso final. isDisplayed o existencia del elemento no demuestran el rango.',
        minimalExample: 'Para 30 días, comprobar la fecha leída con una aserción de rango de 30 días; no sustituirla por expect(await date.isDisplayed()).toBe(true).',
    },
    'acceptance-recorded-assertion': {
        requirement: 'El criterio debe quedar enlazado a la verificación grabada y al código final que la ejecuta. Conserva locator, operador, origen y esperado; corrige la capa del archivo informado.',
        minimalExample: 'Una acción VERIFICAR_TEXTO con equals exige comparar el texto leído por igualdad al esperado; una mera comprobación de presencia no satisface ese criterio.',
    },
    'case-coverage-review': {
        requirement: 'El mismo TC debe conservar las operaciones, argumentos, aserciones, orden y repeticiones de su cobertura previa. Puede cambiar la redacción si la cadena de código demuestra conservación; restaurar definiciones que el Feature ya no ejecuta no corrige una pérdida.',
        minimalExample: 'TC-10140 existente: hoy, 7, 15, 30 y 90 días; propuesta: 30 y 90. Conservar los días anteriores al actualizar el caso.',
    },
    'case-coverage-unverified': {
        requirement: 'La equivalencia debe apoyarse en definiciones únicas y dependencias comprobables. Revisa validation.caseCoverage y conserva las implementaciones previas cuando sus llamadas ya cubren el caso; una frase parecida, actionTrace o una afirmación del agente no demuestra equivalencia.',
        minimalExample: 'Un cambio de frase con await screen.confirmar(monto) intacto puede conservar cobertura; si también cambia confirmar o su locator, revisar esa implementación y sus argumentos. Mantener el borrador y la revisión pendiente cuando falta evidencia; no modificar validation.json para aprobarlo.',
    },
    'reuse-binding-mismatch': {
        requirement: 'La propuesta debe conservar el método y secuencias de scenarioRows.reuse; afirma el retorno si es boolean.',
        minimalExample: 'actionTrace: { sequence: 4, screenMethod: \"showMovementsExpected\" }; Steps: await movementsScreen.showMovementsExpected();',
    },
    'reuse-implementation-changed': {
        requirement: 'La propuesta debe conservar el cuerpo y dependencias del método reutilizado; no cambies una aserción interna void por otra API.',
        minimalExample: 'scenarioRows.reuse: { kind: \"step\", methodName: \"showMovementsExpected\", returnType: \"void\" }; Screen: conservar baseline.',
    },
    'reused-step-rewritten': {
        requirement: 'Todo step reutilizado desde framework debe copiarse literal, sin reescritura.',
        minimalExample:
            'features/yape-features/autoatencion/native/movements/happy-path-movements.feature\n' +
            'Given el usuario <username> inicia sesión en Yape',
    },
    schema: {
        requirement: 'schemaVersion debe usar la version soportada por el contrato del paquete.',
        minimalExample:
            'agent-response.schema.json\n' +
            '"schemaVersion": { "const": 1 }',
    },
    'screen-alias-usage': {
        requirement: 'El alias importado del Screen Object debe usarse en al menos una llamada del steps file.',
        minimalExample: EXAMPLE_STEPS_ALIAS,
    },
    'screen-import-alias': {
        requirement: 'El alias y la ruta de import del Screen Object deben coincidir con expectedNames del framework-api.',
        minimalExample:
            'framework-api.json\n' +
            '{ "path": "screenobjects/payment/verify-sales-message.screen.ts", "instanceName": "verifySalesMessageScreen", "importSource": "@screenobjects/payment/verify-sales-message.screen.ts" }',
    },
    trace: {
        requirement: 'Cada accion grabada debe tener una entrada actionTrace con sequence y gherkinStep.',
        minimalExample:
            'agent-response.schema.json\n' +
            '"actionTrace": [{ "sequence": 1, "gherkinStep": "When el usuario consulta todos sus movimientos" }]',
    },
    'typescript-syntax': {
        requirement: 'Cada archivo .ts generado debe compilar con sintaxis TypeScript válida y consistente.',
        minimalExample:
            'features/yape-steps-definitions/payment/verify-sales-message.steps.ts\n' +
            "When(/^el usuario tiene que poder acceder a ventas$/, async () => {\n" +
            '  await verifySalesMessageScreen.userPoderAccederSales();\n' +
            '});',
    },
    'trace-locator': {
        requirement: 'actionTrace.locatorName debe coincidir con el locatorName planificado para esa sequence.',
        minimalExample:
            'generation-plan.json\n' +
            '{ "sequence": 1, "locatorName": "salesButton" }',
    },
    'trace-screen-method': {
        requirement: 'actionTrace.screenMethod debe consumir el getter correcto sin selectores literales. Varias acciones pueden compartir método si consume todos sus getters. En VERIFICAR_EXISTE puede devolver isDisplayed/isExisting (también const + && o await Promise.all + every(Boolean)), pero el Step trazado debe esperar y afirmar ese booleano con expect(...).toBe(true); una lectura descartada no cuenta. En VERIFICAR_TEXTO también cuenta devolver la lectura de readRecordedText desde el getter trazado si el helper es el contractual y el Step compara el texto devuelto con el valor y operador grabados; no exige una espera artificial.',
        minimalExample:
            'Screen: async isContactDisplayed(): Promise<boolean> { return await this.contact.isDisplayed(); }\n' +
            'Steps: const visible: boolean = await contactsScreen.isContactDisplayed(); expect(visible).toBe(true);',
    },
    'json-import-attribute': {
        requirement: 'Todo import de un .locator.json debe llevar el atributo de tipo `with { type: \'json\' }`; sin él Node lanza al cargar el módulo.',
        minimalExample:
            'screenobjects/payment/movements.screen.ts\n' +
            "import LocatorMovements from '@locators/payment/movements.locator.json' with { type: 'json' };",
    },
    'locator-import-alias': {
        requirement: 'Un .locator.json nuevo debe importarse por su alias `@locators/<squad>/<archivo>.locator.json`, nunca por ruta relativa (los imports heredados del baseline se conservan tal cual).',
        minimalExample:
            'screenobjects/payment/movements.screen.ts\n' +
            "import LocatorMovements from '@locators/payment/movements.locator.json' with { type: 'json' };",
    },
    'getElement-arity': {
        requirement: 'Cada `getElement` debe recibir exactamente cuatro argumentos: TypeLocator y valor por plataforma, en el orden de la firma (framework-api.json.locatorContract.getElement).',
        minimalExample:
            'screenobjects/payment/movements.screen.ts\n' +
            'const locator = LocatorProvider.getElement(\n' +
            '    TypeLocator.XPATH, LocatorMovements.movementsIos.showMovements,\n' +
            '    TypeLocator.ANDROID, LocatorMovements.movementsAndroid.showMovements\n' +
            ');',
    },
    'getElement-order': {
        requirement: 'Las posiciones 1 y 3 de `getElement` deben ser miembros de TypeLocator y las plataformas deben seguir el orden que declara la firma (iOS antes que Android en este framework).',
        minimalExample:
            'screenobjects/payment/movements.screen.ts\n' +
            'LocatorProvider.getElement(TypeLocator.XPATH, <ios>, TypeLocator.ANDROID, <android>)',
    },
    'type-locator-import': {
        requirement: 'El enum de estrategias debe importarse con el símbolo y la ruta del framework (framework-api.json.locatorContract.typeLocator).',
        minimalExample:
            'screenobjects/payment/movements.screen.ts\n' +
            "import { TypeLocator } from '@common/enums/locator-type.enum.js';",
    },
    'helper-method': {
        requirement: 'Solo deben invocarse métodos que existen en los helpers de BaseScreen (framework-api.json.helpers): `scrollDown` está en gestureHelper, no en uiHelper. Lo que ningún helper cubre debe escribirse como método del propio Screen Object.',
        minimalExample:
            'screenobjects/payment/movements.screen.ts\n' +
            'await this.gestureHelper.verticalScrollingToEnd();',
    },
    'screen-class-name': {
        requirement: 'La clase del Screen Object debe ser la esperada para su ruta (o la que ya declara el archivo en un update) y debe extender BaseScreen.',
        minimalExample:
            'screenobjects/payment/movements.screen.ts\n' +
            'class MovementsScreen extends BaseScreen {',
    },
    'screen-singleton-name': {
        requirement: 'El archivo debe exportar por defecto una instancia de su clase: `export default new <Clase>();`.',
        minimalExample:
            'screenobjects/payment/movements.screen.ts\n' +
            'export default new MovementsScreen();',
    },
    'screen-alias': {
        requirement: 'Steps debe importar el Screen Object con el instanceName esperado (framework-api.json.screenObjects[].instanceName, o el binding que el Steps existente ya usa) e invocarlo por ese alias.',
        minimalExample:
            'features/yape-steps-definitions/payment/movements.steps.ts\n' +
            "import movementsScreen from '@screenobjects/payment/movements.screen.ts';\n" +
            'await movementsScreen.showMovements();',
    },
    'recorded-text-assertion': {
        requirement: 'Para textAssertion explícito el método trazado del Screen debe (1) declarar en su clase el helper readRecordedText idéntico al de framework-api.json.textAssertion.helper, (2) leer con `const actual = await this.readRecordedText(this.<locatorName>, source)` desde el getter trazado con la fuente grabada (element|container) y (3) devolver esa lectura (`return actual;`, Promise<string>) para que el Step la compare; también se acepta la forma heredada con la comparación dentro del método. contains usa toContain; equals usa toBe. XPath solo localiza. El mensaje de error indica cuál parte falta.',
        minimalExample:
            'screenobjects/payment/movements.screen.ts\n' +
            `${RECORDED_TEXT_READER}\n` +
            'public async getMovementsTodayText(): Promise<string> {\n' +
            "    const actual = await this.readRecordedText(this.movementsContent, 'container');\n" +
            '    return actual;\n' +
            '}',
    },
    'recorded-text-assertion-steps': {
        requirement: 'Cuando el método trazado devuelve la lectura del texto grabado, el Step que lo invoca debe compararla con el operador y el valor grabados: contains usa toContain; equals usa toBe (o el parámetro <param> del Examples). Es responsabilidad de Lorem.',
        minimalExample:
            'features/yape-steps-definitions/payment/movements.steps.ts\n' +
            "import { expect } from '@wdio/globals';\n" +
            'Then(/^se muestran los movimientos de hoy$/, async () => {\n' +
            '    const actualText: string = await movementsScreen.getMovementsTodayText();\n' +
            '    expect(actualText).toContain("Hoy");\n' +
            '});',
    },
    'trace-shape': {
        requirement: 'Cada entrada de actionTrace debe cumplir el schema sin campos extra.',
        minimalExample:
            'agent-response.schema.json\n' +
            '"actionTrace": { "items": { "required": ["sequence","gherkinStep"], "additionalProperties": false } }',
    },
    'ungrouped-technical-action': {
        requirement: 'Las acciones técnicas consecutivas del mismo propósito deben agruparse en un step funcional de negocio que represente el grupo completo. Debe conservar cada secuencia original en actionTrace y su orden, sin omitir datos ni aserciones; no debe agrupar propósitos distintos ni absorber una acción posterior en una verificación.',
        minimalExample:
            'features/yape-steps-definitions/payment/confirmacion-envio-email-movements.steps.ts\n' +
            'When(/^el usuario consulta todos sus movimientos$/, async () => { await movementsScreen.consultAllMovements(); });',
    },
    'unresolved-gap-without-reason': {
        requirement: 'Toda decision unresolved debe incluir reason explicito y completo.',
        minimalExample:
            'agent-response.schema.json\n' +
            '{ "gapId": "gap-repetition", "decision": "unresolved", "reason": "El contrato debe ser un objeto JSON." }',
    },
    'verbatim-context-hint': {
        requirement: 'El contextHint debe usarse como pista del elemento junto al objetivo, aceptación y grupo completo de acciones. El step nuevo debe sintetizar su propósito, sin copiar la etiqueta literal ni la última acción; los steps reutilizados se conservan literales.',
        minimalExample:
            'features/yape-steps-definitions/payment/confirmacion-envio-email-movements.steps.ts\n' +
            'When el usuario consulta todos sus movimientos',
    },
};

function requirementFor(code: string, windowText: string): string {
    return RULE_GUIDANCE[code]?.requirement || requirementFromWindow(windowText);
}

function minimalExampleFor(code: string): string | null {
    return RULE_GUIDANCE[code]?.minimalExample || null;
}

function explainOnly(code: string): boolean {
    return minimalExampleFor(code) === null;
}

export function validatorRuleCodesFromSource(source: string): string[] {
    const codes = new Set<string>();
    const pattern = /code:\s*'([^']+)'/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) codes.add(match[1]);
    if (source.includes('non-english-identifier:')) {
        codes.add('non-english-identifier');
    }
    // `codeStructureRules` reemite los codigos de `screenObjectProblems` con
    // `code: problem.code`: sin esto las once reglas mecanicas del Screen
    // Object no llegaban al catalogo y el agente solo podia aprenderlas
    // leyendo 16 KB de codigo fuente (screen-object-contract.js).
    if (source.includes('screenObjectProblems(')) {
        for (const code of SCREEN_OBJECT_CONTRACT_RULE_CODES) codes.add(code);
    }
    return [...codes].sort();
}

export function buildValidationRuleContractFromSource(source: string): ValidationRuleContract {
    const rules: ValidationRuleContractEntry[] = [];
    for (const code of validatorRuleCodesFromSource(source)) {
        const matchIndex = source.indexOf(`code: '${code}'`);
        const windowText = matchIndex >= 0
            ? source.slice(matchIndex, Math.min(source.length, matchIndex + 1200))
            : source;
        const requirement = requirementFor(code, windowText);
        const minimalExample = minimalExampleFor(code);
        rules.push({
            code,
            requirement,
            minimalExample,
            needsExplanation: explainOnly(code),
        });
    }
    rules.sort((a, b) => a.code.localeCompare(b.code));
    const expressible = rules.filter(rule => rule.minimalExample !== null).length;
    const explanationOnly = rules.filter(rule => rule.needsExplanation).length;
    return {
        schemaVersion: 1,
        source: 'automationResponseValidator',
        totalRules: rules.length,
        expressibleWithMinimalExampleCount: expressible,
        explanationOnlyCount: explanationOnly,
        notExpressibleCount: 0,
        rules,
    };
}
