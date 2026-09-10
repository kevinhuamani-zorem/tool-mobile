# Reutilización por comportamiento — R1 a R6

Fecha: 2026-09-09. Ampliación de F0–F7; no sustituye el historial, las dos
pasadas, la exportación con observaciones ni la aprobación QA de golden.

## Entregas

| Fase | Implementación | Evidencia |
| --- | --- | --- |
| R1 | ReuseAnalyzer agrega comportamiento, firma, visibilidad y hash por método; registra la delegación de cada Step. La revisión del índice incluye ctime, además de mtime/tamaño, y reconstruye relaciones al borrar archivos. | Edición sin commit con mismo tamaño y mtime restaurado, actualización de helper y eliminación de Screen. |
| R2 | El resolver compara operaciones ordenadas y pares de locator verificados. Adopta aliases solo dentro del mismo archivo, módulo y bloques compatibles. El texto sirve para presentar la definición, no demuestra equivalencia. | Redacción distinta y alias válido; negativos de tipo, valor, plataforma, pantalla y acción. |
| R3 | Varias filas consecutivas pueden usar un Step funcional existente. Un método `void` con aserción interna permanece `void`; un retorno boolean debe afirmarse. Una definición nueva puede llamar a un método existente sin generar otro. | Filtro compuesto, orden invertido, operadores/fuentes de texto, retorno descartado y métodos sin duplicar. |
| R4 | `scenarioRows.reuse` fija método, firma, secuencias, hashes y dependencias. Viaja a los tres roles. El validador comprueba conservación del código y trazas; la caché de autores cambia de versión. | Detección de método reescrito; generación con retorno boolean y aserción; regresiones de casos encadenados. |
| R5 | El análisis y Revisión muestran las decisiones reales. El mismo TC se busca aunque cambie su título; un destino único se actualiza. Una reducción de cobertura deja ambas versiones en un conflicto visible. Las colisiones previas del Steps compartido se separan de nuevas definiciones duplicadas. | Actualización de TC renombrado, preservación de otros escenarios y conflicto ante pérdida de cobertura. |
| R6 | `reuse:evaluate` compara decisiones con grupos esperados independientes. El paquete/historial conserva el reporte de reutilización. La aprobación y recuperación golden existentes mantienen su autoridad. | Métricas con aciertos, fallos, grupos perdidos y denominadores independientes. No se concede ejecución ni aprobación por evaluar. |

## Alcance del análisis

El análisis es conservador y acotado a TypeScript reconocible: getters directos
de LocatorProvider, llamadas esperadas de WebdriverIO, delegaciones locales y
secuencias sin bifurcaciones. Incluye parámetros string simples cuando un Step
existente los recibe mediante capturas directas y Examples comprobados. Las
firmas con transformaciones o sin un binding probado siguen pendientes.
Loops, ramas, helpers desconocidos, opciones que cambian la aserción (como
`reverse`), efectos adicionales o retornos descartados
no reciben una prueba de equivalencia automática. No se eliminan sus archivos
ni se bloquea por ello la exportación del borrador.

Los helpers técnicos se identifican por tokens de su implementación y firma,
mediante `behaviorHelperProfiles.json`. Los perfiles iniciales corresponden a
`waitForElementExistByLocator`, `waitForElementDisplayedAndExpect` y
`verticalScrollingToEnd` del framework inspeccionado. Espacios y comentarios
no cambian el perfil; un cambio ejecutable exige revisar y probar el contrato
antes de incorporar otro perfil. Estos perfiles técnicos no son casos golden.

La espera de existencia del framework también espera visibilidad y habilitación;
el otro helper espera visibilidad y hace la aserción. Se reconocen según la
operación requerida, sin declararlos intercambiables para cualquier caso.
Una lectura de fecha visible no se convierte en una validación de rango.
Los operadores/fuentes explícitos de texto se conservan; las verificaciones
legacy admiten la igualdad literal que ya soportaba el framework.

Cada reutilización guarda los hashes del método y sus delegaciones. Los
validadores siguen comprobando selectores, TypeLocator, imports, compilación y
unicidad de Steps. La propuesta no puede sustituir el método por otro wrapper
ni cambiar su comprobación solo para satisfacer una interfaz provisional.
Screen y Steps sin adiciones se materializan desde su baseline: las cuatro
capas siguen disponibles, con su procedencia, sin exigir cuatro archivos nuevos.

## Casos existentes y revisión

Con un único escenario del mismo TC, el plan conserva la ruta Feature existente.
Cambiar solo el título no crea otra identidad. El comparador de
[conservación de cobertura](CASE_COVERAGE.md) sigue las operaciones y aserciones
de ambas revisiones, en vez de exigir las mismas frases. Si demuestra una
pérdida o no puede verificar la equivalencia, el borrador muestra `COBERTURA EXISTENTE` y
`PROPUESTA PARA REVISAR`; `case-coverage-review` explica la reconciliación
pendiente. El QA conserva los pasos vigentes y edita el resultado en el preview.
La preparación no escribe en el framework.

Si ya hay varios escenarios con el mismo TC, el reporte enumera los archivos;
no elige ni elimina uno por similitud de título. Las herramientas existentes
de recuperación/reconciliación permiten corregir la asociación. Un Step ambiguo
no se reutiliza. Una colisión previa en un archivo compartido se informa sin
atribuir su creación al agente; si el escenario propuesto usa una expresión
ambigua, `step-ambiguous` sigue siendo un error real.

## Evaluación

```sh
npm run reuse:evaluate -- --plan /ruta/generation-plan.json --labels /ruta/expected.json --output /ruta/report.json
```

`expected.json` define grupos funcionales a partir de revisión independiente:

```json
{
  "groups": [
    { "sequences": [1, 2, 3], "expected": "reuse", "method": "userViewAllMovements" },
    { "sequences": [4], "expected": "create" }
  ],
  "qaMinutes": 8,
  "qaCorrections": 2
}
```

Los números del ejemplo son ilustrativos. `reuseRate` usa únicamente grupos
etiquetados como reutilizables; cero elegibles produce `null`. Se informan
reutilizaciones incorrectas, oportunidades perdidas y decisiones sin etiqueta.
El comando sale con código 2 si encuentra diferencias o cobertura sin evaluar.
Tiempo y correcciones QA ausentes son `null`, no cero. Se conserva siempre
`deviceExecution: not-evaluated` y `goldenApproval: not-granted`.

La prueba estática de TC-10140 contra `main` identifica cinco Steps de negocio
que cubren 11 de 13 acciones: navegación, pantalla, filtros de 30/90 y regreso.
Las dos comprobaciones de fecha quedan pendientes de implementación/revisión.
El caso original también cubre hoy, 7 y 15 días; la nueva grabación no autoriza
eliminar esos pasos silenciosamente. Esta prueba no ejecutó Copilot ni Appium.

El piloto funcional requiere que el QA ejecute el resultado, recupere sus
correcciones y apruebe una revisión golden en `tests/golden`. Evaluar usa casos
reservados que no se entregan como ejemplos a los agentes. No se alteran
snapshots ni expected aprobados para hacer pasar esta entrega.

## Pruebas

`tests/behaviorReuse.test.js` cubre R1–R6 con casos positivos y negativos.
Se ejecutan además los contratos de casos encadenados, texto, catálogo de reglas,
exportación, golden, arquitectura y la puerta `npm run quality`.

La evidencia de la entrega y los dos replays preexistentes pendientes se detallan
en [AGENT_EVALUATION_PROGRESS.md](AGENT_EVALUATION_PROGRESS.md#r1r6-reutilización-por-comportamiento-2026-09-09).
