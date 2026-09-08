# Contrato de generación

## Intención explícita de las verificaciones de texto

Las nuevas acciones `VERIFICAR_TEXTO` guardan `textAssertion: { version: 1,
source: "element" | "container", operator: "contains" | "equals" }`.
`value` conserva el esperado y `selector` solo identifica el objetivo. No se
infiere una aserción a partir de un predicado XPath, ni se asciende al padre.

- `element`: lee `getText()` del elemento elegido.
- `container`: lee su texto propio y los descendientes `.//*`, en orden,
  omitiendo textos vacíos y uniéndolos con `\n`. Conserva duplicados.
- `contains` compara mediante `includes` / `toContain`; `equals` mediante
  igualdad exacta / `toBe`. Conserva mayúsculas, espacios y tildes.
- Máximo 200 descendientes y 32768 caracteres leídos; excederlo falla
  explícitamente, sin truncar y aprobar accidentalmente.

El borrador genera el helper autocontenido `readRecordedText` dentro del Screen,
sin instalar dependencias ni modificar helpers del framework. Su contenido es
parte del contrato y viaja siempre en el paquete de Zorem como
`framework-api.json.textAssertion.helper` (con el uso esperado en `usage`),
de modo que no depende de que el borrador se haya generado.

Reparto de responsabilidades (Page Object puro, decidido el 05-09-2026): el
método trazado del Screen lee el texto grabado desde su getter y **devuelve la
lectura** (`const actual = await this.readRecordedText(this.<getter>, '<fuente>');
return actual;`, `Promise<string>`); el Step recibe ese texto y afirma el
resultado de negocio junto al Gherkin (`const actualText: string = await
<screen>.<metodo>(); expect(actualText).toContain(<valor>)`, `toBe` para
`equals`, con `expect` importado de `@wdio/globals`). Zorem conserva fuente y
getter en el Screen; Lorem conserva operador y esperado en Steps. El generador
determinista emite esa forma cuando la fila termina en su única aserción de
texto; si una fila tiene dos aserciones o acciones después de la lectura, la
comparación se queda dentro del método del Screen (forma heredada), que el
validador sigue aceptando para no invalidar casos ya promovidos.

Derek restaura mecánicamente el helper si difiere del contrato o falta en una
clase que lo invoca (`normalizeAuthorResult`) y valida el AST con dos reglas:
`recorded-text-assertion` (Screen, va a Zorem: helper ausente o distinto,
lectura que no parte de `this.<getter>` con la fuente grabada, lectura no
devuelta, o comparación heredada con otro operador/valor) y
`recorded-text-assertion-steps` (Steps, va a Lorem: ningún Step invoca el
método, no compara el texto devuelto, o compara con otro operador/valor). Cada
mensaje nombra la parte que falla y muestra la línea esperada. La política
existente de revisión/aplicación del QA no cambia.

El fingerprint incluye esta definición y el valor
exacto. Cambiarla invalida la reutilización de una comparación distinta. Las
grabaciones anteriores no se reinterpretan: siguen sin `textAssertion` hasta que
el QA las edite explícitamente. La edición conserva el locator y solo se guarda
después de comprobar la comparación en el dispositivo.

La previsualización muestra el texto realmente leído solo en memoria de la UI;
no se persiste en el recording ni se envía a agentes. El agente recibe únicamente
la intención y el valor esperado de la acción. La comprobación estática no prueba
que el dispositivo siga mostrando el mismo contenido en otra ejecución.

## Telemetría local

Cada intento mantiene `agent-run.json` junto al paquete de automatización. El
archivo contiene únicamente contadores, tamaños, duraciones, timestamps,
identificadores técnicos y estado final. No forma parte del contexto entregado
al agente y no puede contener prompts, XML, screenshots, secretos ni datos del
caso. Los tokens son anulables cuando el CLI no expone métricas de consumo,
tanto en sesiones headless como manuales.

En modo automático también registra `pass1ContextBytes` y `pass2ContextBytes`,
además de un desglose por componente (`pass1ContextBreakdown` y
`pass2ContextBreakdown`) para explicar exactamente qué bytes entraron en cada
invocación. `contextBytes` conserva el máximo por invocación.

`agentModelUsage` contiene `requestedModel` y `actualModels` (lista vacía si
Copilot no informó el modelo). `agentModelInvocations` conserva esos datos
por pasada/corrección. Los archivos históricos pueden no tener estos campos;
no se infiere un modelo usado a partir del solicitado. Son metadatos del
recorder, no campos que el agente deba inventar en `agent-response.json`.

Además registra el número inicial/final de gaps, hints generados/usados, gaps
resueltos determinísticamente y consultas solicitadas, aceptadas, rechazadas,
duplicadas o evitadas por ausencia de gap. Una consulta rechazada no incrementa
`queryCount`, porque CodeGraph no fue consultado.

## Proyecciones de contexto

Cada preparación escribe también:

```text
generation/automation/hints.json
generation/automation/gaps.json
generation/automation/query-requests.json
generation/automation/query-results.json
```

`hints.json` contiene IDs estables, tipo, fuente, confidence y evidencia
compacta como ruta, símbolo o relación. `gaps.json` extiende los gaps existentes
con intención, razón, estado, responsable de resolución, evidencia requerida,
esquema de respuesta y presupuesto de consultas. Ambos son derivados;
`GenerationPlan`, los contextos existentes y el recording siguen autoritativos.

La regla operativa es **NO SEARCH WITHOUT GAP**. Una consulta debe nombrar un
gap `open`, pertenecer a `allowedQueries` y no exceder `maxQueries`. Consultas
idénticas no se repiten. Un gap resuelto, bloqueante o destinado al QA no
autoriza búsquedas.

`query-requests.json` y `query-results.json` tienen contrato versionado (`schemaVersion: "1.0"`):

- requests: `id`, `gapId`, `query` y `args` (sin queries arbitrarias).
- results: `requestId`, `gapId`, `status` (`resolved|rejected|not-found|error`)
  y `code` estructurado cuando hay rechazo.

Una resolución con `decision: "reuse"` debe incluir
`selectedCandidate: {file,module,name}`. Los valores se copian exactamente de
un candidato del plan o de un resultado aceptado de `findLocator`. El recorder
lo aplica en `effective-generation-plan.json`; el agente no crea aliases ni
reescribe el locator existente. Las aserciones con selector débil pueden usar
`findLocator`; si no existe evidencia observable, permanecen sin resolver en
vez de inventar texto o XPath.

El generador determinista conserva locators distintos dentro de una secuencia
repetida. Solo compacta a un loop cuando la posición variable representa la
misma clave lógica parametrizable; nunca convierte varias claves verificadas en
una llamada al primer getter.

Los errores de reparación se agrupan por código y archivo en
`repair-context.json`. El resultado inválido inicial abre la reparación sin
consumir el intento. El intento se consume solo si `agent-response.json` cambia
materialmente y continúa inválido; una reimportación idéntica queda como
`repair-no-change` para corrección explícita.

## Salida fwk-mobile

Un caso completo puede producir:

```text
features/yape-features/<squad>/<archivo>.feature
features/yape-steps-definitions/<squad>/<archivo>.steps.ts
screenobjects/<squad>/<modulo>.screen.ts
resources/locators/<squad>/<modulo>.locator.json
```

Cuando el squad organiza Features en subcarpetas, la primera ruta puede ser
`features/yape-features/<squad>/<featureScope>/<archivo>.feature`.
`featureScope` nunca se replica automáticamente en Steps, Screen Objects ni
Locators.

La relación entre capas se obtiene por definiciones e imports, no por igualdad
del basename. Por ejemplo, `squad=interoperabilidad` y
`featureScope=tapp/payment` puede resolver `tapp-payments.steps.ts`,
`tapp-subhome.screen.ts` y `tapp-subhome.locator.json`.

Cada archivo planificado declara `create` o `update`. Un `update` incluye el
hash del baseline y debe ser aditivo: conserva definitions, methods y locators
existentes. Si el archivo cambia después de preparar el plan, se bloquea la
escritura y se debe preparar un paquete nuevo.

`update` no significa que el agente deba inventar una API. El resolver puede
seleccionar un Screen Object y su Locator JSON aunque todavía no exista un
Steps que los conecte, siempre que CodeGraph demuestre la importación
Screen → Locator y varios métodos cubran las intenciones del recording. El
agente reutiliza primero métodos, getters y claves ya indexados; devuelve el
baseline intacto cuando estos cubren el caso y agrega únicamente los símbolos
realmente faltantes. Feature y Steps pueden seguir siendo `create`.

El presupuesto operativo del plan vive en una sola fuente (`GenerationPlan.budgets`):
`maxDurationMs`, `maxContextBytes`, `maxResponseBytes`, `maxAgentInvocations`,
`maxTotalQueries`, `maxQueriesPerGap` y `maxRepairAttempts`.

En Fase 4.1, `maxContextBytes` se valida **por invocación**: PASS 1 y PASS 2
usan contextos distintos y cada uno debe caber individualmente.

Solo el Feature lleva metadata de procedencia agregada por el recorder: la
cabecera `# Generado por Appium Recorder`, `# Author: Kevinarnold.zorem` y
`# Fecha de creación` (ISO) en un archivo nuevo, y la marca
`# [Appium Recorder] <recordingId> · <fecha>` + `# Author` encima de un
Scenario añadido a un Feature existente. Steps, Screen Object y Locators salen
como código del framework, sin cabecera ni comentarios por método: git ya
registra quién y cuándo, y qué grabación aportó cada símbolo vive en
`config/generated-files.json` y en `package-provenance.json`, fuera del
framework. Las cabeceras y marcas que versiones anteriores dejaron en archivos
TypeScript ya generados no se retiran en un `update` (no se tocan líneas ajenas
a lo añadido).

## Feature

`contextHint` es una pista libre capturada junto al elemento. No representa una
definición Gherkin ni texto contractual. El preprocesador y el agente pueden
usarla para comprender el dominio, pero deben sintetizar los Steps a partir del
objetivo, criterio de aceptación y conjunto ordenado de acciones. Copiar una
pista literalmente al Feature produce `verbatim-context-hint` y bloquea la
importación.

- Debe tener tag sin `@` duplicado.
- El ID válido es `TC-<número>`.
- El título sigue `[TC-10239][Happy Path][AUTO-FRONT] descripción` o su variante
  `Unhappy Path`.
- Usa `Scenario Outline` y `Examples` cuando existan parámetros/data.
- Cada placeholder del escenario debe estar representado en Examples.
- Redacta comportamiento declarativo: cada step describe la intención o el
  resultado observable, no la mecánica de la interfaz.
- No conviertas cada acción grabada en una línea Gherkin. Clicks, botones,
  escritura en campos, scrolls, swipes y esperas son detalles del Screen
  Object y sus helpers.
- Agrupa acciones técnicas consecutivas que sirven al mismo objetivo en un
  solo step funcional. La trazabilidad conserva cada secuencia original y
  permite enlazarlas al mismo texto Gherkin.
- Si un ciclo repite `abrir opción -> elegir variante -> verificar resultado`,
  expresa todas las vueltas como una sola expectativa declarativa. No generes
  una pareja genérica de comportamiento/resultado por cada variante. Por
  ejemplo: `Then se muestran los movimientos esperados al aplicar cada filtro`.
- Keywords por semántica (`gherkin-keyword`): `Given` es el contexto o estado
  inicial; `When`, la acción que ejecuta el usuario o el evento que ocurre;
  `Then`, el resultado esperado; `And`/`But` complementan el paso anterior y
  heredan su tipo. Por eso la acción que sigue a un `Then` vuelve a ser `When`
  y el resultado que sigue a un `When` es `Then`; un `And` tras `Then` es otro
  resultado, nunca una acción. El tipo de cada step sale de lo que ejecuta
  según `actionTrace`: termina en una verificación, es resultado; ejecuta
  cualquier otra acción, es comportamiento; sin acciones, es contexto (el
  login). El borrador determinista ya sale así (`semanticGherkinKeywords`) y
  las definitions llevan el keyword efectivo del step (un `And` tras `When` se
  define con `When`).
- Redacción en tercera persona («el usuario consulta…») o impersonal («se
  muestra…») (`gherkin-person`). Nunca primera persona («ingreso mi correo»),
  imperativo o segunda persona («ingresa tu correo», «selecciona el botón») ni
  infinitivo («verificar que existe…»). Los steps `reused` se copian literales
  aunque no cumplan: ya existen en el framework. El borrador convierte un
  criterio en infinitivo («verificar que existe el filtro») en resultado
  impersonal («se muestra el filtro») y, si el objetivo del QA viene en
  infinitivo, redacta la acción con las intenciones en tercera persona.
- Un dato escrito por el usuario viaja como `<param>` con su columna en
  `Examples` y el step lo nombra («el usuario ingresa su correo <email> y
  selecciona enviar correo»); la definition lo recibe como argumento y el
  Screen Object lo usa, nunca lo deja fijo en código.

Ejemplo:

```gherkin
@miflujo
Scenario Outline: [TC-10239][Happy Path][AUTO-FRONT] Enviar movimientos por correo
  Given el usuario <username> inicia sesión en Yape
  When el usuario consulta todos sus movimientos
  Then se muestra la pantalla de movimientos
  When el usuario ingresa su correo <email> y confirma el envío
  Then se muestra el mensaje de correo enviado

Examples:
  | username   | email            |
  | usuario_qa | qa@yape.com.pe   |
```

- Si la ruta del Feature ya existe (otro caso con el mismo objetivo, típicamente
  sin commitear), el plan lo marca `update`: el camino determinista fusiona el
  baseline (`mergeFeatureUpdate`) añadiendo solo el Scenario nuevo con sus
  tags, el patch de aplicación es aditivo y `destructive-update` rechaza una
  propuesta que pierda un Scenario existente. Antes se creaba encima y el caso
  anterior desaparecía del framework.

## Step Definitions

Antes de validar la salida de Lorem (incluidos caché y reparación) y al importar
la propuesta, el recorder normaliza únicamente keywords inequívocos del Feature.
Por ejemplo, `Then se muestra la confirmación` seguido de `And el usuario cierra
la confirmación` pasa a `When el usuario cierra la confirmación`. Se conserva la
frase, el orden y todos los métodos/selectores; una traza con prefijo actualiza
solo ese prefijo y una sin prefijo permanece intacta. Los cuerpos de Steps no se
reescriben: Cucumber resuelve por texto, no por keyword de la definición.
No se adivina con trazas incompletas/duplicadas, textos repetidos entre escenarios,
pasos reutilizados ni filas mixtas de acciones y resultados. Esos casos continúan
por la validación existente. La función es pura y no modifica la grabación ni el
plan; la propuesta normalizada sigue pasando por preview y validación completa.

- Las expresiones deben coincidir con el texto Gherkin y capturar parámetros.
- Un step solo transforma argumentos mínimos y delega al Screen Object.
- Todo parámetro que la definition captura se pasa al método del Screen
  Object (`parameter-not-forwarded`); un valor de Examples o de una DataTable
  nunca aparece como literal en Steps (`example-value-hardcoded`). La cadena
  completa es `Examples -> <columna> en el step (examples-unused-column) ->
  argumento de la definition -> argumento del método -> uso en el método`, y
  cada eslabón tiene su regla: en rec-e84b3413 el Gherkin declaraba `<email>`,
  la definition no lo pasaba y el Screen escribía el correo grabado.
- No contiene selectores, llamadas directas a Appium/WebdriverIO ni lógica de
  navegación compleja.
- Antes de avanzar desde Gherkin se contrasta cada texto con todas las
  definiciones y escenarios indexados. Los impactos se muestran; no se altera
  código ajeno.
- Un step existente se **reutiliza** (fila `reused`, sin definición nueva y
  con `methodName` del step existente para la trazabilidad) solo con
  evidencia: el índice registra qué métodos de Screen Object invoca cada
  definición, y se reutiliza cuando esos métodos alcanzan exactamente los
  locators que el caso ya resolvió como `reuse` para esa fila — ni uno más ni
  uno menos. Sin esa evidencia el texto se desambigua con un sufijo, como
  antes; nunca se adopta un step por el texto.
- Cada línea del Feature debe resolver a **exactamente una** step definition
  de **todo** el framework, que es como resuelve Cucumber: carga
  `features/yape-steps-definitions/**` (todos los squads), no distingue
  `Given` de `When` y prueba cada regex contra la línea ya expandida con
  Examples. Dos coincidencias son `Multiple step definitions match` y el
  Scenario falla; cero, un step undefined. El catálogo del squad
  (`stepDefinitions`) sigue acotando qué se reutiliza o extiende, pero las
  colisiones se juzgan contra `frameworkStepDefinitions`. Caso real
  (TC-10239): `autenticacion/login/login.steps.ts` define
  `^el usuario ingresa su (.*) y (.*)$`, que atrapa «el usuario ingresa su
  correo <email> y selecciona enviar» de payment además de la definición
  propia. Un regex con captura final se traga cualquier sufijo, así que el
  borrador reformula la frase (verbo sinónimo: «el usuario escribe su correo
  <email> y selecciona enviar»; o conjunción «, luego ») antes de sufijar;
  `collision-report.json → reservedStepExpressions` marca con `swallows` los
  regex que aún atrapan una frase, y el validador rechaza `step-ambiguous`
  (con la reformulación sugerida) y `step-undefined`. Ambas son de Lorem.
- El Screen Object se importa con
  `@screenobjects/<squad>/<modulo>.screen.ts`; no se admiten rutas relativas.
- Un Steps planificado como `update` (el caso reutiliza el Screen Object de
  otro caso, típicamente uno generado antes y todavía sin commitear) parte del
  archivo existente y solo suma definiciones: el camino determinista fusiona
  el baseline (`mergeStepsUpdate`) igual que ya hacía con Screen y Locators, y
  `destructive-update` rechaza cualquier propuesta que pierda una definición.

La aplicación aditiva extrae los imports con el AST de TypeScript, incluyendo
imports multilínea, aliases y tipos. Fusiona bindings compatibles y conserva
todos los imports de la propuesta, no solo el primer Screen Object. Si una
propuesta reutiliza un nombre local para otro módulo/símbolo, el patch reporta
el conflicto en vez de sustituir el binding heredado. Reaplicar el mismo patch
no duplica imports ni definiciones.

Al ampliar un Feature se conservan las líneas de tags (varios tags por línea
o en líneas sucesivas), comentarios asociados y Examples de los escenarios
nuevos. Si la propuesta contiene varios escenarios nuevos, se agregan todos y
se registran sus nombres; los existentes no se reescriben.

### Redacción de las filas del borrador

Orden de preferencia para el texto de cada fila: frase de dominio redactada a
mano (`domainBehaviorText`/`domainAssertionText`), las palabras del QA en el
objetivo/criterio cuando hay un único bloque, una frase construida desde la
pista contextual de la acción que define el bloque (`el usuario selecciona
ultimos 30 dias`, `se muestra la opción ultimos 30 dias`), y solo al final la
plantilla de máquina (`wording: template`). La frase por intención es única
por elemento, así que grabaciones que alternan click y verificación dejan de
producir "se obtiene el resultado esperado de … para tc-…" con sufijos.

### Nombres en inglés: diccionario, detección y aprendizaje

- Los nombres lógicos (claves de locator, getters, métodos, slugs) salen de
  `translateToEnglish` sobre el contextHint/objetivo del QA con un diccionario
  ES→EN determinista (`core/shared/domain/englishIdentifiers.ts`) que entiende
  la forma de la palabra (`descarga`, `descargados` → `download`).
- Una palabra que ni el diccionario, ni la lista de inglés conocido, ni el
  vocabulario que ya usa el framework reconocen **no pasa en silencio**: abre
  `gap-english-naming`. En el pipeline por capas ese gap es informativo para
  Lorem y Zorem (nombran en inglés al escribir), Derek lo firma como
  `renamed-by-authors` y Sumrak no lo juzga.
- La memoria legacy está retirada. `AutomationMemory` no devuelve casos,
  fragmentos ni vocabulario; tampoco reconstruye entradas desde `cases/`.
  Aplicar una respuesta no enseña a los agentes, incluso con score 100. Al
  arrancar Electron se archivan los datos conocidos de memoria y el caché global
  bajo `runtime/automation-memory/legacy-v1/<lote>/`. Si el archivo falla,
  las lecturas permanecen deshabilitadas. Recordings y golden se conservan.
- Si todas las filas se reutilizan del framework y no hay gaps que exijan
  juicio (`gapJudgment().open`), Zorem no corre y Lorem solo revisa el diseño
  (`source: agent`). Un `wording: memory` legacy no habilita este atajo. Con la
  preferencia explícita `inheritDesignReview` se omite esa revisión y se registra
  `source: framework`, indicando que nadie revisó el objetivo de este caso.
  Esta reutilización no equivale a aprobación golden.
- No se recuperan respuestas de otro intento ni se usa un `agent-response.json`
  anterior como caché. Los cachés temporales de autores/revisión se ubican bajo
  `agents/derek/attempt-cache/`, que se reinicia en cada ejecución. El índice de
  ejemplos derivados de revisiones golden aprobadas se implementará en F6.
- La normalización nunca renombra identificadores heredados del framework (los
  declarados en el baseline de un archivo `update`, como `titleVentas`):
  traducirlos destruiría una API existente. Y el importador nunca convierte una
  respuesta válida en inválida: si tras normalizar el validador rechaza lo que
  llegó tal cual y eso sí pasaba, conserva lo entregado y lo avisa en
  `validation.warnings` y en `agent-run.json` (`missingContextRequests`,
  source `importer`).
- Nada de esto toca selectores. Una errata en el texto de la app (`Útimos`) se
  conserva literal en el selector y en el nombre; el hallazgo va al QA en
  `qa-observations.json` (`ui-text-quality`), nunca se corrige en silencio.
- Lo mismo con una verificación grabada con un XPath sin predicado
  (`//android.view.View`): el selector se conserva tal cual, el QA recibe la
  observación `weak-assertion`, y `gap-weak-assertion-N` es informativo para
  Lorem y Zorem (pueden refinar la verificación dentro del Screen Object);
  Derek lo firma con la decisión que el plan fijó y Sumrak no lo juzga. El QA
  puede haber elegido ese XPath a propósito para iterar en código con el
  agente.
- Una acción grabada con un selector sin predicado identificador (solo
  `className`, `instance(n)`, XPath o class chain sin predicado) también se
  conserva tal cual y el QA recibe la observación `unspecific-selector`. Lo que
  cambia es su valor como evidencia: coincidir con un locator de **otro**
  módulo no prueba que sea el mismo elemento (`className("android.widget.EditText")`
  es el campo del código OTP y también el del correo en movimientos), así que
  el resolver no lo reutiliza ni lo cuenta para elegir qué Screen extender: lo
  crea en el módulo del caso con el selector grabado (`unspecificSelector: true`,
  `declinedReuse` en la resolución) y `framework-locator-collision` lo avisa en
  vez de bloquearlo. Si el locator con ese selector vive en el módulo que el
  caso extiende, sí se reutiliza: ahí sí es el mismo elemento. Cuando no hay
  ninguna coincidencia que identifique un elemento de verdad, las genéricas
  vuelven a contar (un caso de una acción sobre el mismo XPath que ya usa un
  módulo sigue extendiéndolo).

### Qué Screen Object extiende un caso

`reuseTarget` del plan lo decide `bestArtifactBundle` por evidencia, no por
presencia. Cada Screen candidato (con el Steps que lo importa, o solo, si aún
no lo importa ninguno) puntúa por la proporción de locators reutilizados que
le pertenecen, por cuántas intenciones del recording cubre ya con sus métodos,
por cuánto usan sus Steps esos mismos locators y por la afinidad de su Gherkin
con el objetivo. Un único acierto no adopta un Screen ajeno salvo que sea la
mayoría de lo reutilizado en un caso corto o que el Screen cubra al menos la
mitad de las intenciones. Un Screen que importa varios locators (movements +
home) es candidato igual: las claves nuevas van al locator que aportó los
aciertos o, sin ellos, al que lleva el nombre del Screen. `reuseTarget.reason`
dice cuántos de los locators reutilizados consume el Screen elegido (por
ejemplo «5 de los 6»), y `reuse-context.json` deja los candidatos con su
score para que el QA pueda auditar la decisión.

## Screen Object

- Clase que extiende `BaseScreen`.
- Getters mediante `LocatorFactory.getElement(...)` con estrategias para ambas
  plataformas.
- Acciones y validaciones mediante `uiHelper`, `gestureHelper` y
  `keyboardHelper` según el framework.
- Se exporta siguiendo la convención vigente del target.
- Los nombres de métodos derivan de intención de negocio, no de coordenadas o
  índices efímeros.
- Cada parámetro que declara un método se usa en su cuerpo
  (`parameter-unused`) y ningún valor de Examples o DataTable se escribe como
  literal (`example-value-hardcoded`): el dato lo entrega la definition. Ambas
  reglas corren también en `tools/check.js` de Zorem, que lee los valores de
  `scenario.json`. Un ciclo con un getter por variante (filtros con locators
  distintos) recorre la DataTable y elige el getter con un método privado
  `<columna>OptionFor(valor)` (`case 'Solo hoy': return this.filterOnlyToday`);
  ahí el literal es la clave del mapa, no un dato fijo, y el validador lo
  exime. Un ciclo sobre un único locator parametrizable conserva el getter
  dinámico (`selectFilter(filtro)`).
- Los imports internos usan exclusivamente `@screenobjects`, `@utils` y
  `@locators`. `browser` solo se importa desde `@wdio/globals` si el código
  generado invoca directamente `browser.`; un import sin uso bloquea la salida.

## Locators

### Codificación de texto

Todo el recorrido `recording → paquete → agente → preview → framework` usa
UTF-8 estricto, Unicode NFC, saltos LF y archivos sin BOM. Las tildes, eñes y
demás diacríticos de un selector verificado se conservan literalmente; no se
transliteran ni se reinterpretan como Latin-1/Windows-1252. El paquete publica
este contrato en `framework-api.json > textEncoding`.

La salida se rechaza si contiene bytes UTF-8 inválidos, U+FFFD (`�`), mojibake
probable como `BotÃ³n` o texto sin normalización NFC. El recorder puede
normalizar de forma canónica NFC al persistir, pero nunca intenta reparar
mojibake porque no existe una transformación inequívoca para datos antiguos.

Ejemplo válido:

```json
{
  "movementsAndroid": {
    "filterLast30Days": "new UiSelector().text(\"Últimos 30 días\")"
  }
}
```

El mismo nombre lógico aparece en bloques de plataforma del módulo:

```json
{
  "movementsAndroid": {
    "showMovements": "android=new UiSelector().text(\"Mostrar movimientos\")"
  },
  "movementsIos": {
    "showMovements": "~Mostrar movimientos"
  }
}
```

Para una generación nueva solo es obligatorio el selector de la plataforma
grabada. Aun así, el JSON debe declarar ambas plataformas con las mismas claves
lógicas: si la plataforma contraria todavía no tiene selector, su valor queda
en `''`. Lo permitido es valor vacío, no clave ausente ni literal vacío dentro
de `getElement(...)`. El Feature lleva solamente el tag de las plataformas con
cobertura completa.

Al completar cobertura solo se actualiza el bloque de la plataforma activa. El
selector capturado se traduce al par `(TypeLocator, valor)` que la clase
resolutora del framework sabe componer: el JSON almacena el valor y el getter
declara la estrategia. La normalización nunca convierte una estrategia Android
en una de iOS.

La identidad para reutilizar un locator se determina exclusivamente con ese par:
`TypeLocator` y valor normalizado del selector. El nombre lógico propuesto por
el recording no participa en la comparación. Si el framework ya contiene el
mismo par bajo otra clave, se reutilizan su ruta y su nombre lógico existente.
Solo se crea una clave nueva cuando la estrategia o el valor normalizado difieren.

Como corrección posterior, el QA puede autorizar explícitamente conservar una
clave existente y reemplazar su selector. Esto no es reutilización automática:
se representa con `decision: "replace-existing"`, `selectedCandidate` y
`replacement` (`platform` + `sequence`). El recorder obtiene `TypeLocator` y
valor únicamente de esa acción verificada, actualiza el getter y el bloque de la
plataforma indicada, y conserva intacta la plataforma contraria.

La traducción no es un recorte de prefijos. `TypeLocator` no tiene estrategia de
resource-id, así que un `id=` capturado por el inspector se convierte:

| Capturado | `TypeLocator` | Valor en el JSON |
|---|---|---|
| `id=com.yape.qa:id/btnFiltrar` | `ANDROID` | `new UiSelector().resourceId("com.yape.qa:id/btnFiltrar")` |
| `id=btnCompose` (Compose, sin paquete) | `XPATH` | `//*[@resource-id="btnCompose"]` |
| `~Ver todos` | `ID` | `Ver todos` |
| `iosPredicate=…` | `PREDICATESTRING` | el predicado |
| `iosClassChain=…` | `CLASSCHAIN` | la cadena |

`UiSelector` y no XPath para resource-id porque es la forma mayoritaria de este
framework (33 usos contra 18), así que el código generado se parece al escrito
a mano.

Cada acción grabada guarda su `locatorType` y su `locatorValue` en
`actions.json`, y el par se comprueba de ida y vuelta: se compone con la tabla
real del framework —leída de la clase resolutora, no asumida— y se vuelve a
interpretar. Si no sale el mismo par, la verificación lo dice en el momento de
capturar y el resolver abre `gap-locator-roundtrip`, que es bloqueante: un
locator que no resuelve no es algo que el agente pueda arreglar adivinando.

Cada selección explícita del Inspector persiste un único selector verificado por
acción. `actions.json` conserva `selector`, `selectorVerified`, `locatorType` y
`locatorValue`; no guarda alternativas ni backups. En una entrada sensible el
selector se rechaza si contiene el valor capturado, para no persistir secretos.
Esta validación ocurre antes de ejecutar o mutar el recording. Si la
persistencia falla después de una acción válida, `actions.json`, manifest y
estado en memoria vuelven al baseline; el renderer restaura siempre el botón en
`finally` y muestra el error.

Cuando un recording generado solo carece de iOS (o Android), el QA únicamente
selecciona y verifica los locators pendientes en una sesión de esa plataforma.
El recorder actualiza el locator del target y la copia de `agent-response.json`,
sin reconstruir Feature ni Steps. Al terminar, los artefactos administrados del
framework contienen ambos bloques completos.

Los locators compartidos se indexan en orden squad → commons → home → global.
Una coincidencia debe conservar módulo, scope y ruta de origen.
Para `create`, el validator admite únicamente el par exacto de la grabación
(`locatorType` + `locatorValue`) en la plataforma grabada; un tipo distinto o
un valor intercambiado entre acciones se rechazan aunque cada componente exista
por separado en la grabación. Además, cada acción `create` declara
`actionTrace.screenMethod`: el validator analiza el método real de la clase
esperada y exige que consuma el getter de `locatorName`, directamente o mediante
una variable local. Para lecturas, sigue de forma acotada el valor derivado del
getter (`const text = await this.title.getText()`) hasta el sink de aserción o
interacción; una lectura descartada o una variable señuelo no cuentan. Un selector
inline, otro getter o una ruta alternativa no pueden sustituirlo; varias acciones
pueden compartir el mismo método cuando este consume todos sus getters.
Los sinks son una allowlist explícita: operaciones de `uiHelper` y
`keyboardHelper` cuyos argumentos son elementos, interacciones WebdriverIO sobre
el receiver del elemento y matchers de `expect`/`expectWebdriverIO`. Las operaciones
actuales de `gestureHelper` usan texto o coordenadas y no prueban consumo de un
getter. Logging, `Promise.resolve`, helpers o funciones desconocidos y argumentos
no relevantes tampoco lo consumen.

Para `VERIFICAR_EXISTE` también se reconoce el Page Object que devuelve un
booleano de `isDisplayed()`/`isExisting()` y su Step lo afirma. La comprobación
sigue const locales, `&&` de booleanos resueltos y `await Promise.all([...])`
seguido de `every(Boolean)`. El Step debe importar ese Screen exacto, corresponder
al `gherkinStep` trazado, esperar el retorno y compararlo positivamente
(`toBe(true)`, `toEqual(true)`, `toStrictEqual(true)` o `toBeTruthy()`). No cuentan
lecturas descartadas, retornos constantes, promesas sin esperar, OR, funciones
anidadas sin ejecutar ni otro Screen con un método homónimo. Si falta la
aserción del retorno, el diagnóstico apunta a Steps (Lorem), no a Screen
(Zorem). Este análisis es de código propuesto: nunca reescribe la grabación.

## Acciones soportadas

El modelo contempla abrir app, click, escribir, limpiar, scroll en ambas
direcciones, scroll hasta texto, swipe, presión larga, verificaciones de texto o
existencia, volver, esperar y screenshot. Una acción puede tener selector,
valor, descripción y origen del locator.

Al añadir una acción:

1. amplía el tipo en `core/automation/contracts/models.ts` (público vía
   `core/automation`);
2. implementa ejecución móvil y generación;
3. define su representación Gherkin y método de Screen Object;
4. añade UI y pruebas para parámetros/plataformas;
5. verifica local y BrowserStack si usa un comando móvil.

## Preview, edición y commit

### Fase 3: compilación semántica del preview

Al importar/revalidar y justo antes de aplicar, `FrameworkCompilationValidator`
comprueba los bytes finales preparados con un `CompilerHost` virtual de TypeScript.
Lee el `tsconfig.json` del framework seleccionado (incluyendo `extends`, aliases,
tipos, resolución NodeNext y JSON) y resuelve sus dependencias desde ese proyecto.
Usa el compilador incluido en el recorder, cuya versión queda en el informe;
no carga el JavaScript de un compilador/plugin del target, ni ejecuta scripts,
Appium o Copilot. No emite `.js`, `.d.ts`, `.tsbuildinfo` ni escribe en el framework.

La comprobación cubre los archivos TypeScript del preview y sus dependencias
transitivas, con los JSON propuestos superpuestos en memoria. No recorre suites
ajenas ni todos los consumidores inversos; no sustituye el build completo del PR.
Detecta, entre otros, imports ausentes, métodos inexistentes, argumentos
incompatibles y claves JSON inexistentes. Respeta las opciones del target: una
API declarada como `any` no ofrece las garantías de una API tipada.

Se compara contra una segunda compilación de los contenidos previos, incluyendo
las dependencias que el caso empieza a reutilizar. Errores que ya existían se
reportan aparte; un desplazamiento de líneas no los convierte en errores nuevos.
Las ocurrencias adicionales sí cuentan. Cada ejecución vuelve a leer configuración
y dependencias: no se reutiliza un aprobado obsoleto al aplicar una edición.

`framework-compilation.json` conserva estado, versión del compilador, diagnósticos
con código/ruta/línea/columna y métricas de duración/lecturas. No guarda snippets,
prompts, XML o capturas. Sus estados son:

- `passed`: sin errores en el alcance comprobado.
- `preexisting-errors`: sin errores nuevos, con deuda previa visible al QA.
- `failed`: errores nuevos; conserva el borrador editable pero impide aplicar y
  aplicar hasta corregir/revalidar (la exportación con diagnósticos corresponde a F3).
- `unavailable`: faltan configuración, módulos/tipos o no se puede comprobar;
  no equivale a aprobado. `noCheck` y proyectos con `references` también se
  reportan como no comprobados; estos últimos aún no están soportados.

El diagnóstico se integra con `validation.json` y la reparación por archivo;
no cambia la política no bloqueante de sugerencias sobre diseño del test.
Regenerar limpia este informe, y refinar conserva el anterior en el histórico.
Una compilación correcta **no garantiza** ejecución funcional, disponibilidad
actual del selector ni cumplimiento completo de un PR.

La aplicación con agente prepara ahora `PreparedAutomation` en memoria antes de
entregar el token. Contiene los bytes finales (también los comentarios de
procedencia del patch), el contenido previo de cada destino y una huella de
integridad. El visor muestra esos bytes y permite desplegar sus diferencias
respecto al framework. Los completions sobre módulos externos aparecen como
archivos adicionales de solo lectura: su valor sigue viniendo de la grabación.

Aplicar verifica que ningún destino haya cambiado desde ese preview, incluyendo
archivos nuevos que alguien haya creado entretanto. Una corrección usa las
baselines originales en memoria; nunca las restaura temporalmente sobre el
framework. Una edición que el merge aditivo no pueda conservar exige revalidar
y revisar el resultado, no se descarta en silencio.

La escritura usa una transacción recuperable para los archivos creados y
actualizados, el registro, el recibo y el estado del paquete. Ante una excepción
se restauran los anteriores y se retiran únicamente los archivos nuevos de esa
operación. La respuesta aplicada queda registrada sin promoción de memoria ni
aprobación golden automática. La recuperación cubre
fallos capturados durante el proceso; no es un journal persistente contra un
apagado abrupto del sistema.

El preview es la unidad de autorización:

1. El proceso principal calcula rutas y contenidos.
2. Valida Gherkin, JSON, TypeScript y raíces permitidas.
3. Devuelve lista de archivos, diagnósticos y token ligado a la entrada exacta.
4. El visor permite revisar, copiar y editar los archivos propuestos.
5. Solo pueden enviarse overrides de rutas presentes en ese preview.
6. Generar recalcula/valida estado; un cambio de entrada invalida el token.
7. La escritura usa temporales y rename. Ante fallo, restaura originales.

`GeneratedFileRegistry` registra hash y metadatos. Solo un archivo previamente
generado y no modificado externamente puede actualizarse automáticamente. Una
ausencia real se confirma contra filesystem; la caché no debe inventar un
conflicto de un archivo eliminado.

## Regeneración y refinamiento

La descripción del refinamiento es opcional. Cuando el QA no proporciona una,
el paquete crea un objetivo de revisión general orientado a claridad,
mantenibilidad y consistencia sin alterar el comportamiento grabado.

- Solo se ofrece para recordings con score 100 y cuatro capas ya importadas.
- `recordingId` y las cuatro rutas permanecen estables; cada iteración recibe
  un `planId` nuevo.
- La respuesta anterior se conserva como `baseline-response.json` y se
  versiona junto con escenario, plan, validación y estado.
- El agente resuelve exclusivamente `gap-regeneration-refinement`; no reconstruye
  selectores verificados ni cambia el alcance del workspace.
- La respuesta refinada pasa nuevamente por importación, preview, edición y
  validación al 100%.
- El reemplazo usa el registry: un archivo modificado fuera del recorder se
  reporta como conflicto y nunca se sobrescribe silenciosamente.

## Contrato del pipeline de automatización

El paquete mínimo contiene `scenario.json`, `generation-plan.json`,
`reuse-context.json`, `collision-report.json`, `unresolved-context.json`,
`instructions.md`, schema y verificador. `reuse-context.json` limita el contexto
a los cinco casos más cercanos; `collision-report.json` expone coincidencias
exactas de steps y selectores sin entregar archivos completos del framework.
Al importar, el recorder compara la copia autoritativa del recording con la
procedencia del paquete; `platform` forma parte explícita de esa identidad para
que una verificación Android nunca se pueda reinterpretar como iOS, ni al revés.

Desde la procedencia v1, cada paquete incluye `package-provenance.json` con los
hashes canónicos de la grabación fuente, `scenario.json` y
`generation-plan.json`. Una corrección de Copilot se valida contra esa
instantánea inmutable y no vuelve a resolver el escenario contra un framework
que la primera aplicación ya modificó. Copilot solo puede modificar
`agent-response.json`.

Después de aplicar una propuesta, `application-receipt.json` registra el hash de
la respuesta y el `afterHash` de cada ruta planificada. Una reimportación se
permite únicamente si esos archivos continúan intactos. Para archivos
compartidos con operación `update`, la corrección se recalcula desde la baseline
original; si falta la baseline o hubo una edición externa, se bloquea sin
sobrescribir el framework.
El contrato final sigue siendo un solo `agent-response.json` con:

- los mismos `recordingId` y `planId`;
- exactamente las cuatro rutas fijadas por el plan;
- resolución de todos los gaps;
- una traza por cada secuencia grabada;
- contenido completo de Feature, Steps, Screen Object y Locators.

En el pipeline por capas Derek coordina tres artefactos intermedios controlados:

- `deterministic-draft.json`: referencia local de las cuatro capas antes de
  invocar agentes; nunca es una respuesta oficial ni se aplica directamente.
  Sobre un módulo `update` respeta lo que ya existe: extiende los bloques de
  plataforma del JSON de locators con su nombre real (`yapearAndroid`/`yapearIos`,
  reconocidos por sufijo sin distinguir mayúsculas, no por la convención
  `<camel>Android|Ios`), reutiliza el identificador con el que el Screen ya
  importa ese JSON y el binding con el que el Steps ya importa el Screen
  (`yapearOTPScreen`, aunque sea por ruta relativa), y conserva el baseline
  byte a byte: clase, `BaseScreen` e imports relativos no se "modernizan"; solo
  se añaden los bindings nuevos (`missingImports`, con alias y ruta relativa
  reconocidos como el mismo módulo por `frameworkModuleResolver`). Lo único que
  se asegura es `browser` en `@wdio/globals` cuando el baseline lo usa sin
  importarlo. La proyección a Zorem (`additions.imports`) lleva únicamente esos
  imports nuevos. Si el borrador no puede generarse, la corrida sigue sin él y
  el motivo queda en `layered-generation-run.json.draft`, en
  `agents/derek/orchestration.json.draft` y en el progreso que ve el QA;
- `agents/derek/orchestration.json`: owner, orden y delegaciones autorizadas;
- `agents/lorem/behavior-result.json`: Lorem produce solo Feature y Steps;
- `agents/zorem/interaction-result.json`: Zorem produce solo Screen y Locators;
- `agents/sumrak/agent-response.json`: Sumrak produce la integración completa.

Lorem y Zorem deben conservar las rutas fijadas por el plan y no pueden emitir
capas del otro autor. Los `output-handoff.json` contienen únicamente referencias,
tamaño y SHA-256; el integrador verifica esos hashes antes de leer los
resultados. Aunque Sumrak devuelva contenido distinto, el recorder
reconstruye `files` con las salidas exactas de ambos autores. Su responsabilidad
queda limitada a resoluciones, trazabilidad, supuestos y revisión cruzada. Cada
delegado se ejecuta con un perfil `.github/agents/<nombre>.agent.md` confinado a
su workspace y una sesión nombrada `Derek/<recordingId>/<nombre>`. Si la
validación final falla, el borrador se conserva en la raíz del paquete para
revisión, pero no se puede aplicar al framework.

El borrador se proyecta por ownership: Lorem ve solo Feature/Steps y Zorem solo
Screen/Locators. Ambos pueden corregirlo o sustituir APIs provisionales por
reutilización autorizada. Sumrak no lo recibe. Tampoco se copia
`unresolved-context.json` a ningún agente, pues pertenece al contrato histórico
anterior a `gaps.json` y la query layer.

### Fase 4: interfaz tipada entre autores

Lorem publica Steps y `actionTrace`; Derek deriva `screen-api.json` de ese código,
no de una lista de firmas inventada por el agente. Cada llamada identifica:

- `importSource` y `method`, para distinguir Screens con métodos homónimos;
- argumentos por posición con tipo inferido y marca `unresolved`;
- `returnUsage` y `expectedReturnType` cuando existe una anotación explícita;
- secuencias relacionadas de la grabación.

El contrato provisional se obtiene del borrador; el definitivo para Zorem se
deriva del resultado firmado de Lorem. Se incluye en sus inputs y handoffs,
así como en los inputs de integración. No contiene archivos completos ni los
valores de argumentos string/number ordinarios. Los Steps deben tipar sus
variables de entrada; `any`, `unknown` y spread dinámico requieren corrección
del autor antes de declarar una interfaz verificable.

Se conserva la ejecución paralela: un cambio de redacción Gherkin o del valor
de un string no repite Zorem. Cambiar dueño, método, tipos/cantidad de argumentos,
uso del retorno o trazabilidad sí resincroniza su contrato. No se exige que la
firma del Screen sea idéntica: parámetros opcionales, rest y overloads son
válidos si TypeScript admite las llamadas reales de Steps.

Derek comprueba esas llamadas contra el Screen exportado, incluso durante
reparaciones y antes de reutilizar respuestas completas del caché. Los errores
`screen-api-mismatch` se asignan al archivo Screen de Zorem. El análisis local
cubre imports default y llamadas con notación de punto (convención del
framework); no sustituye la compilación semántica de fase 3 para dependencias,
APIs heredadas externas ni otros patrones TypeScript. El borrador con errores
sigue disponible para revisión: esta comprobación no ejecuta pruebas móviles.

Durante una
reparación, Derek valida cada resultado parcial con el validador oficial y
actualiza `repair-feedback.json` con `awaiting-output`, `correction-required` o
`accepted`. Si el proceso termina antes de alcanzar `accepted`, solo ese autor
se relanza en una ronda `feedback-N`; no se repiten capas sanas. Para las
resoluciones ligadas a una secuencia, Sumrak conserva `create` o `reuse` fijado
por `generation-plan.json`. `reuse` requiere el mismo `TypeLocator`, el selector
normalizado idéntico y un candidato autorizado.

Antes de materializar esa respuesta, la pasada semántica escribe también
`testDesignReview` dentro de `gap-resolutions.json`. Su contrato es cerrado:

- `status`: `pass` o `qa-required`;
- `summary`: explicación breve para el QA;
- hasta ocho `issues`, con código permitido, severidad, secuencias reales y una
  recomendación concreta para mejorar o volver a grabar.

La revisión no certifica el funcionamiento de la app. Solo decide si la
grabación contiene un oráculo observable alineado con objetivo y aceptación.
Verificar que aparece un botón, opción o campo antes de usarlo no demuestra su
efecto funcional. Los hallazgos se presentan como sugerencias al QA y no
bloquean la generación ni la importación de `agent-response.json`; el detalle
se persiste en `test-design-review.json` sin prompts, XML ni capturas. Un
`roast` presente en artefactos anteriores (QA Roast Mode, retirado) se tolera al
leer `gap-resolutions.json` y nunca se conserva en la revisión normalizada.

El nombre del Screen Object es parte del contrato. Se deriva del basename de la
ruta planificada en kebab-case: `movements-view.screen.ts` corresponde a la
clase `MovementsViewScreen`, al singleton `new MovementsViewScreen()` y al alias
`movementsViewScreen` usado por Steps. El import, todas las llamadas y el export
deben conservar esa relación. Se rechazan `generatedScreen`, `screen`, `page`,
`screenObject`, `obj` y cualquier alias distinto al esperado.

Los imports también forman parte del contrato verificable. Steps y Screen
Objects no pueden usar rutas relativas para recursos del framework. El paquete
local rechaza aliases distintos de los planificados, el uso de `browser.` sin
su import y la importación de `browser` cuando no se utiliza.

La traza no impone un step por acción: varias secuencias pueden compartir el
mismo `gherkinStep` cuando juntas implementan un comportamiento. El verificador
rechaza Gherkin procedimental y acciones técnicas aisladas que no estén
englobadas por un step funcional adyacente.

Los tags de plataforma se derivan de la cobertura. Una generación Android
incluye `@android` y una generación iOS incluye `@ios`. Si luego se completa la
otra plataforma, el recorder agrega su tag al Feature y a la respuesta guardada
sin eliminar el anterior. Nunca se agrega el tag de una plataforma con locators
requeridos vacíos; por ejemplo, un caso parcial permanece como
`@miflujo @android` hasta completar iOS y recién entonces pasa a
`@miflujo @android @ios`.

No puede cambiar rutas, releer el framework, reemplazar selectores verificados
ni inventar una quinta capa. Un fallo produce `repair-context.json` con errores
y archivos afectados. Solo se permite una reparación. iOS puede quedar con
valor vacío cuando la evidencia activa es Android, conservando el nombre
lógico y su clave declarada en el JSON.

Si el resolver encuentra el mismo comportamiento y cobertura total de selectores
en un caso con cuatro capas, `generation-plan.json` incluye `existingCase`, usa
operación `update` y conserva el contenido actual sin invocar al agente. La
validación rechaza expresiones Gherkin, escenarios o selectores duplicados en
otro archivo del squad/Home.

Si una respuesta del agente entrega un módulo de locators sin claves porque
todas las acciones con elemento fueron resueltas como `reuse`, el recorder no lo
trata como un JSON accidentalmente vacío ni consume un intento de reparación.
Informa que la automatización ya existe y bloquea volver a crear el mismo caso.
Un archivo vacío que todavía tenga alguna resolución `create` conserva el error
de salida incompleta.

## Restricciones de seguridad

- Rechazar rutas absolutas suministradas por UI, `..`, symlinks de escape y
  cualquier destino fuera de las raíces autorizadas.
- Nunca escribir un archivo que no fue mostrado en revisión.
- Nunca imprimir secretos ni incluirlos en Feature/Steps/previews.
- No enviar secretos, datasets ni el repositorio completo al proveedor de IA.
- La IA solo resuelve gaps del plan y su salida nunca se escribe sin preview.
- Si una validación falla, no debe quedar una generación parcial.

## Golden dataset

Un caso golden es una automatización que el QA **aprobó** al terminar el
flujo: en el paso 3 de la revisión, una vez aplicado el caso, «Guardar como
dataset» lo congela bajo `tests/golden/<tc>-<rec>/`; `npm run golden:save`
hace lo mismo desde la terminal para una grabación aplicada días antes. Cada
caso lleva lo que hace falta para volver a juzgar al recorder sin depender del
framework vivo ni de la memoria de una máquina:

- `package/`: `scenario.json`, `generation-plan.json` (y el efectivo tras las
  decisiones de QA), `resolved/unresolved-context.json`, `gaps.json`,
  `hints.json`, `reuse-context.json`, `collision-report.json`,
  `validation.json`, `application-receipt.json`, `agent-run.json`.
- `catalog.json`: el `SquadReuseCatalog` tal como lo vio el resolver, sin
  telemetría. Con él el replay reproduce el plan aunque el framework haya
  cambiado de rama.
- `baselines/`: el contenido previo de los archivos `update`, para que el
  replay del resolver y del validador partan del estado anterior a aplicar.
- `expected/<capa>-<archivo>` y `agent-response.json`: los cuatro archivos
  **aceptados**. Si el QA corrigió un step tras ejecutar el caso (en el editor
  de la revisión o directamente en el framework), lo aceptado es esa versión:
  la corrección se revalida, se escribe en el framework cuando viene del
  editor, el recibo de aplicación y `config/generated-files.json` adoptan los
  bytes nuevos, y el manifiesto lo marca con `edited: true` y
  `validation.source: golden`. Una corrección que no pasa la validación no se
  guarda ni toca el framework.
- `manifest.json`: caso, grabación, squad, plataforma, fecha y autor,
  `executed` (`passed` | `failed` | `not-run`, lo declara el QA: el recorder no
  ejecuta el caso), notas, perfil de validación y el HEAD del framework.

`tests/goldenDataset.test.js` reproduce cada caso: el resolver, con
`catalog.json` y un snapshot de baselines, tiene que producir la misma
proyección del plan (reuseTarget, archivos y operaciones, decisión y locator de
cada acción, gaps y si bloquean); y el validador, sobre un framework aislado
devuelto al estado previo (baselines aplicados, `create` retirados), tiene que
aceptar los archivos aprobados con el mismo perfil de errores. Los datos de
prueba de la grabación viajan con el caso: revísalos antes de versionarlo.

El comando `golden:seed-memory` está retirado y termina con un mensaje explícito
sin escribir memoria. Los golden existentes se conservan para replay. El índice
reconstruible que consumirá únicamente revisiones aprobadas por QA corresponde a
F6 de [las fases de implementación](AGENT_EVALUATION_IMPLEMENTATION_PHASES.md).

## Conformidad con el review de PR

El generador cumple el estándar que aplica el reviewer de `fwk-mobile-test`:

- **Screen Object**: el getter es `public get x() { const locator = LocatorProvider.getElement(...); return $(locator); }` y devuelve el elemento. Las acciones operan sobre él: `waitForElementExistByLocator(elemento, true)` antes de cada interacción y `waitForElementDisplayedAndExpect(elemento, timeout, mensaje)` en las verificaciones — que afirma, no solo espera. `timeout` sale de `getTimeoutFromEnv()`, resuelto del framework y no de una ruta fija.
- **Sin esperas por tiempo**: no se emite `browser.pause` ni `driver.pause` en ninguna capa. Una acción `ESPERAR` se traduce a espera explícita sobre el elemento siguiente; si no hay ninguno al que anclarla, el resolver abre `gap-fixed-wait-N` y no se genera código.
- **Tags**: `@<squad>` sobre la línea `Feature:`, y en el `Scenario` `@<funcionalidad> @<tier> @<plataforma>`. El tier sale de `request.executionTag`; si no se indica, `Happy Path` → `@smoke_mobile` y cualquier otro → `@regression_mobile`.
- **Imports de `@wdio/globals`** por uso real: `$` siempre que haya getters, `expect` cuando hay aserciones, `browser` solo si el Screen Object lo invoca.
- **JSON de locators sin metadatos**: solo los bloques `<módulo>Android` y `<módulo>Ios`. JSON no admite comentarios y un `_metadata` es lo mismo con otro nombre; la traza de qué grabación aportó cada clave vive en `generated-files.json`, que es del recorder y no viaja en el PR.

### Contrato del Screen Object

`core/automation/contracts/screenObjectContract.ts` (público vía
`core/automation`) reúne las reglas mecánicas que el agente rompía y
nadie comprobaba. Corre en tres sitios con una sola implementación: el validador
al importar la propuesta, `verify-package.js` dentro del sandbox del flujo de
un solo agente, y `tools/check.js` en el paquete de Zorem del pipeline por
capas — que carga `tools/screen-object-contract.js`, comprueba el JSON de
locators y la sintaxis TypeScript con el `typescript` instalado en el
framework, y termina con código 1 y el código de regla de cada problema. Las
once reglas viajan además como texto en `validation-contract.json` (requisito
más ejemplo mínimo; el catálogo las descubre aunque `codeStructureRules` las
emita dinámicamente), así que el código fuente del contrato ya no forma parte
de la lectura de Zorem ni de `input-manifest.json`: es herramienta, no
evidencia. El prompt le indica que `node tools/check.js` es su única
verificación y que no busque `tsc`, babel ni `node_modules`, no use `/tmp` ni
lea `agent-execution.log`.

| Regla | Evidencia en el framework |
|---|---|
| Todo import de `.locator.json` lleva atributo de tipo | 114 / 114 |
| Todo import de locators usa alias, también los reutilizados | derivado del propio especificador |
| `getElement` recibe siempre 4 argumentos | 860 / 860 |
| Argumentos 1 y 3 son `TypeLocator.<ESTRATEGIA>` | 860 / 860 |
| El valor de iOS va antes que el de Android | 858 / 860 |
| Los valores de `getElement` referencian claves de locator, nunca `''` literal | contrato del validador |

La firma se lee de la declaración real de `getElement` (`locatorSignature`), no
de una constante: si el framework reordena los parámetros, la instrucción y la
regla que la verifica se mueven con él.

Las últimas reglas atrapan además dos fallos silenciosos: **intercambiar los
valores de iOS y Android** (ejecuta la plataforma equivocada) y **pasar `''`
literal** (pierde la trazabilidad de la clave y rompe completions posteriores).

Los mensajes traen la línea ya corregida. El agente tiene un solo intento de
reparación (`maxRepairAttempts: 1`) y estos cuatro errores son mecánicos:
gastarlo copiando una línea escrita es buen uso, gastarlo adivinando no.

Y antes de eso, `reuse-context.json` trae por módulo su `importLine` y por
elemento su `getter` **completos**. El trabajo del agente para los elementos que
el recorder conoce pasa de componer a copiar, que es donde no puede equivocarse.

### Completar un locator a medias

Casi el **40%** de las claves compartidas de este framework (387 de 1001) tienen
una plataforma vacía: un módulo escrito grabando en iOS y reutilizado grabando en
Android es lo normal, no un caso borde. Adoptar una de esas claves sin rellenarla
deja el getter resolviendo a `""` — compila, pasa el review y falla al ejecutar.

La salida es **completar en sitio**, no duplicar el elemento:

- La clave tiene que existir ya en el bloque de la plataforma grabada y estar
  vacía. Si no está en ese bloque, ese módulo no declara el elemento para esa
  plataforma y hay que crear el locator en el módulo del caso.
- Un valor real nunca se pisa; completar solo llena el hueco.
- El agente declara `completions: [{ file, name, platform, sequence }]` y **no
  escribe el selector**: el recorder lo copia de `actions[sequence]`, que es un
  elemento que el QA verificó contra el dispositivo. Por esta vía no puede entrar
  un selector inventado, que es el riesgo de dejarle escribir en un archivo de
  otra feature.
- Cada completion debe coincidir con un `completionTargets` determinista exacto:
  `(file, module, block, name, platform, sequence)`. El Screen Object trazado debe
  importar ese archivo y consumir ese getter con el `TypeLocator` del primary.
  Keys homónimas en archivos o bloques distintos son identidades diferentes.
- El patch recibe el bloque autorizado; nunca elige el primer bloque Android/iOS
  por basename o por nombre de key.
- Un completion puede apuntar a un módulo externo aunque las cuatro capas del
  caso sean `create`; se procesa por su propio patch aditivo con escritura
  atómica y comprobación de baseline.
- Cuando el módulo de locators que el caso **extiende** (`reuseTarget`) tiene
  claves sin valor en la plataforma grabada, el resolver abre
  `gap-platform-coverage`: un aviso **informativo** para Zorem que separa las
  claves que una acción grabada puede rellenar (tienen `completionTargets` en
  el plan) de las que no corresponden a nada grabado (no se adoptan). No es
  bloqueante: el estado del módulo es del framework —cambia por rama y por
  máquina—, no un defecto de la grabación que el QA pueda corregir. Derek lo
  firma con `decision: resolved`, Sumrak no lo juzga y Lorem no lo recibe. En
  TC-10240 (`payment/yapear-contact.inputContactToYapear`, declarada solo en
  iOS) el gap era bloqueante y el análisis terminaba en «No pudimos completar
  el análisis» en cualquier equipo cuya rama tuviera esa clave.

Se comprueba en tres sitios: el gap de duplicado ya trae el `completions` de
ejemplo con su `file` y `name`; el verificador del sandbox cruza identidad completa
y Screen Object contra los `status: "missing"` de `reuse-context.json`; y el
validador lee los archivos reales y evalúa cómo quedarán **después** del patch.

Descartada la prueba de tokens de identidad como requisito para completar: medida
sobre 455 pares que ya funcionan en ambas plataformas, los tokens coinciden solo
en el 75%. Exigirla habría bloqueado uno de cada cuatro casos válidos.

### De dónde sale el texto de cada step

El texto se elige por orden de calidad, y cada fila declara su origen en
`wording`:

1. **`domain`** — frase redactada a mano para ese dominio (`movimientos`,
   `saldo`). Es el mejor Gherkin disponible y gana siempre.
2. **`qa`** — el `objective` y el `acceptanceCriteria` que escribió el QA. Ya son
   español redactado por una persona y describen exactamente el comportamiento y
   el resultado esperado. Se usan solo cuando hay **un** bloque de comportamiento
   y **una** aserción; con varios no se pueden repartir.
3. **`template`** — último recurso: la frase se arma con el slug técnico. Es la
   única que sale de máquina, y de ahí salía `el usuario completa saldo
   disponible consultar etiqueta`.

Una frase del QA se descarta si narra la interfaz (`hace clic`, `presiona el
botón`, `scroll`), si nombra controles (`botón`, `campo`, `icono`, `menú`), si
empieza por un keyword de Gherkin, si trae un `<parámetro>` sin columna en
Examples, o si es demasiado corta para ser una frase.

Las filas `domain` y `qa` están redactadas y no se tocan. Una fila `template` es
la única que conviene reescribir, y las instrucciones del agente se lo dicen.

### API de los helpers

`BaseScreen` expone sus helpers por composición, y el agente escribía llamadas a
métodos que no existen —`this.uiHelper.scrollDown()`, cuando `scrollDown` vive en
`gestureHelper`—. Eso no compila, y el fallo aparecía al construir el framework,
fuera del pipeline: el paquete nunca le decía qué métodos hay y ninguna capa
comprobaba que existieran.

`framework-api.json` viaja ahora en el paquete con los helpers y **todos** sus
métodos públicos con su firma, leídos del disco por AST. Los helpers se
descubren por la declaración de `BaseScreen`, no por una lista de nombres: si el
framework agrega un cuarto helper, entra solo.

La regla mecánica vive en `screenObjectContract` y corre en los dos sitios de
siempre. Cuando el método existe pero en otro helper, el mensaje lo dice:

```
this.uiHelper.scrollDown() no existe: scrollDown vive en gestureHelper.
Escribe this.gestureHelper.scrollDown(...).
```

Y cuando no existe en ninguno, enumera los que sí hay y da la salida correcta:
escribirlo como un método del propio Screen Object, para que quede reutilizable
— nunca inventar una llamada al helper.
