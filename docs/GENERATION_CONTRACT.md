# Contrato de generación

## Telemetría local

Cada intento mantiene `agent-run.json` junto al paquete de automatización. El
archivo contiene únicamente contadores, tamaños, duraciones, timestamps,
identificadores técnicos y estado final. No forma parte del contexto entregado
al agente y no puede contener prompts, XML, screenshots, secretos ni datos del
caso. Los tokens son anulables porque el agente se inicia manualmente y el CLI
actual no garantiza métricas de consumo.

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

Las cuatro capas llevan metadata de procedencia agregada por el recorder:
`Generado por Appium Recorder`, `Author: Kevinarnold.zorem` y fecha ISO
de creación. Feature usa comentarios `#`, Steps y Screen Object usan `//`, y
Locators conserva JSON válido mediante un objeto raíz `_metadata`. Este objeto
no forma parte del catálogo de locators.

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

Ejemplo:

```gherkin
@miflujo
Scenario Outline: [TC-10239][Happy Path][AUTO-FRONT] Consultar movimientos
  Given el usuario <username> inicia sesión en Yape
  When el usuario abre sus movimientos
  Then visualiza el movimiento <descripcion>

Examples:
  | username | descripcion |
  | usuario_qa | Primer yapeo |
```

## Step Definitions

- Las expresiones deben coincidir con el texto Gherkin y capturar parámetros.
- Un step solo transforma argumentos mínimos y delega al Screen Object.
- No contiene selectores, llamadas directas a Appium/WebdriverIO ni lógica de
  navegación compleja.
- Antes de avanzar desde Gherkin se contrasta cada texto con todas las
  definiciones y escenarios indexados. Los impactos se muestran; no se altera
  código ajeno ni se decide reutilización automáticamente.
- El Screen Object se importa con
  `@screenobjects/<squad>/<modulo>.screen.ts`; no se admiten rutas relativas.

## Screen Object

- Clase que extiende `BaseScreen`.
- Getters mediante `LocatorFactory.getElement(...)` con estrategias para ambas
  plataformas.
- Acciones y validaciones mediante `uiHelper`, `gestureHelper` y
  `keyboardHelper` según el framework.
- Se exporta siguiendo la convención vigente del target.
- Los nombres de métodos derivan de intención de negocio, no de coordenadas o
  índices efímeros.
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
  invocar agentes; nunca es una respuesta oficial ni se aplica directamente;
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

Lorem publica `actionTrace` como contrato directo para Zorem. Durante una
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
se persiste en `test-design-review.json` sin prompts, XML ni capturas.
Cuando el QA activa **QA Roast Mode**, el proceso principal inicia después una
segunda sesión headless de Copilot. Esta recibe un `qa-roast-request.json`
compacto con el diagnóstico, acciones relacionadas y ejemplos; escribe
`qa-roast-response.json` bajo un schema independiente. Puede corregir una vez
un tono inválido. Si falla o agota el tiempo, se descarta el roast y se conserva
el diagnóstico técnico: la presentación nunca invalida `gap-resolutions.json`.
La ejecución se audita en `qa-roast-run.json` sin guardar prompts, selectores,
XML ni capturas.

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
nadie comprobaba. Corre en dos sitios con una sola implementación: el validador
al importar la propuesta, y `verify-package.js` dentro del sandbox — que carga
`screen-object-contract.js`, copiado al paquete, para que el agente se
autocorrija antes de devolver nada.

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
