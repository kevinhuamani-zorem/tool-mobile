# Contrato de generación

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

Las cuatro capas llevan metadata de procedencia agregada por el recorder:
`Generado por Appium Visual Recorder`, `Author: Kevinarnold.zorem` y fecha ISO
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

Para una generación nueva solo es obligatorio el bloque de la plataforma
grabada. Una ejecución Android puede entregar únicamente el bloque Android (o
dejar iOS vacío), y una ejecución iOS puede hacer lo equivalente. La ausencia
de la plataforma contraria se informa como cobertura pendiente, pero no bloquea
la importación ni la generación. El Feature lleva solamente el tag de las
plataformas con cobertura completa.

Al completar cobertura solo se actualiza el bloque de la plataforma activa. El
selector capturado se traduce al par `(TypeLocator, valor)` que la clase
resolutora del framework sabe componer: el JSON almacena el valor y el getter
declara la estrategia. La normalización nunca convierte una estrategia Android
en una de iOS.

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

Una selección explícita del Inspector puede guardar `selectorCandidates`. El
candidato primary es siempre el selector elegido por el QA y sigue siendo el
único valor por defecto para `create`. Cada candidato compacto conserva
`candidateId`, selector canónico, estrategia del Inspector, `locatorType`,
`locatorValue`, prioridad, estabilidad, motivo y la verificación de captura
(`protocolVersion=3`, una coincidencia, mismo elemento y fecha). Se deduplica por
par `(TypeLocator, valor)` y se ordena primary primero; luego
`stable → contextual → structural → manual`, prioridad y `candidateId`. Se
persisten como máximo cuatro. Editar el selector o elegir otro borra los backups.
En una entrada sensible se descarta cualquier backup que contenga el valor
capturado; si el primary depende de la credencial, la acción se rechaza para no
persistir el secreto dentro de un selector.

Cuando un recording generado solo carece de iOS (o Android), el QA únicamente
selecciona y verifica los locators pendientes en una sesión de esa plataforma.
El recorder actualiza el locator del target y la copia de `agent-response.json`,
sin reconstruir Feature ni Steps. Al terminar, los artefactos administrados del
framework contienen ambos bloques completos.

Los locators compartidos se indexan en orden squad → commons → home → global.
Una coincidencia debe conservar módulo, scope y ruta de origen.
El resolver puede usar cualquier candidato verificado para encontrar una
coincidencia exacta existente, pero nunca escribe alternativas como fallbacks.
Ordena por scope y estabilidad; si persisten matches materiales del mismo rango,
abre un gap bloqueante de decisión QA. La resolución conserva el `candidateId`
que causó el reuse.

## Acciones soportadas

El modelo contempla abrir app, click, escribir, limpiar, scroll en ambas
direcciones, scroll hasta texto, swipe, presión larga, verificaciones de texto o
existencia, volver, esperar y screenshot. Una acción puede tener selector,
valor, descripción y origen del locator.

Al añadir una acción:

1. amplía el tipo en `core/models.ts`;
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

El paquete mínimo contiene `scenario.json`, `locator-candidates.json`,
`generation-plan.json`,
`reuse-context.json`, `collision-report.json`, `unresolved-context.json`,
`instructions.md`, schema y verificador. `reuse-context.json` limita el contexto
a los cinco casos más cercanos; `collision-report.json` expone coincidencias
exactas de steps y selectores sin entregar archivos completos del framework.
`locator-candidates.json` es una allowlist read-only; el agente puede citar un
`candidateId`, pero no inventar ni modificar selectores. El validator rechaza
valores nuevos fuera de la allowlist de la acción y plataforma asociadas, el
intercambio de selectores entre locators y campos de selector introducidos en
resolutions, completions o metadatos de files. Al importar, el recorder compara
el archivo con la copia autoritativa del recording antes de hidratar el
`scenario.json` compacto; `platform` forma parte explícita del package para que
una verificación Android nunca se pueda reinterpretar como iOS, ni al revés.
El agente devuelve un solo `agent-response.json` con:

- los mismos `recordingId` y `planId`;
- exactamente las cuatro rutas fijadas por el plan;
- resolución de todos los gaps;
- una traza por cada secuencia grabada;
- contenido completo de Feature, Steps, Screen Object y Locators.

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
y archivos afectados. Solo se permite una reparación. iOS puede quedar vacío
con warning cuando la evidencia activa es Android, conservando el nombre lógico.

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

`core/screenObjectContract.ts` reúne las reglas mecánicas que el agente rompía y
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

La firma se lee de la declaración real de `getElement` (`locatorSignature`), no
de una constante: si el framework reordena los parámetros, la instrucción y la
regla que la verifica se mueven con él.

La última regla atrapa además un fallo silencioso: **intercambiar los valores de
iOS y Android** mantiene los 4 argumentos, compila y pasa el review, pero ejecuta
el locator de la plataforma equivocada.

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

Se comprueba en tres sitios: el gap de duplicado ya trae el `completions` de
ejemplo con su `file` y `name`; el verificador del sandbox cruza el Screen Object
contra los `status: "missing"` de `reuse-context.json`; y el validador lee los
archivos reales y evalúa cómo quedarán **después** del patch.

Descartada la prueba de tokens de identidad como requisito para completar: medida
sobre 455 pares que ya funcionan en ambas plataformas, los tokens coinciden solo
en el 75%. Exigirla habría bloqueado uno de cada cuatro casos válidos.
