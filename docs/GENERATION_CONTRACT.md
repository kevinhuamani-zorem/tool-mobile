# Contrato de generación

## Salida fwk-mobile y standalone

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

En `neutral` se exportan Feature y recording portable bajo `runtime/exports`;
no se debe presentar como generación de las cuatro capas.

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

Al completar cobertura solo se actualiza el bloque de la plataforma activa. El
selector capturado conserva su semántica de estrategia (`id=`, `android=`, `~`,
XPath, class chain o predicate, según corresponda): el JSON almacena el valor
compatible con `LocatorFactory` y el getter sincroniza su `TypeLocator`. La
normalización nunca convierte una estrategia Android en una de iOS.

Cuando un recording generado solo carece de iOS (o Android), el QA únicamente
selecciona y verifica los locators pendientes en una sesión de esa plataforma.
El recorder actualiza el locator del target y la copia de `agent-response.json`,
sin reconstruir Feature ni Steps. Al terminar, los artefactos administrados del
framework contienen ambos bloques completos.

Los locators compartidos se indexan en orden squad → commons → home → global.
Una coincidencia debe conservar módulo, scope y ruta de origen.

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

El paquete mínimo contiene `scenario.json`, `generation-plan.json`,
`reuse-context.json`, `collision-report.json`, `unresolved-context.json`,
`instructions.md`, schema y verificador. `reuse-context.json` limita el contexto
a los cinco casos más cercanos; `collision-report.json` expone coincidencias
exactas de steps y selectores sin entregar archivos completos del framework.
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

## Restricciones de seguridad

- Rechazar rutas absolutas suministradas por UI, `..`, symlinks de escape y
  cualquier destino fuera de las raíces autorizadas.
- Nunca escribir un archivo que no fue mostrado en revisión.
- Nunca imprimir secretos ni incluirlos en Feature/Steps/previews.
- No enviar secretos, datasets ni el repositorio completo al proveedor de IA.
- La IA solo resuelve gaps del plan y su salida nunca se escribe sin preview.
- Si una validación falla, no debe quedar una generación parcial.
