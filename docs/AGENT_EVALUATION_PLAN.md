# Plan de implementación — Evaluación y validación de agentes

Documento derivado de `AGENT_EVALUATION_IMPROVEMENTS.md` (auditoría 2026-09-07).
Fecha del plan: 2026-09-07.

Este documento responde dos cosas: **(A)** si el backlog de la auditoría le sirve
al recorder y en qué medida, y **(B)** en qué orden implementarlo.

**Fases ejecutables vigentes:**
[AGENT_EVALUATION_IMPLEMENTATION_PHASES.md](AGENT_EVALUATION_IMPLEMENTATION_PHASES.md).
La secuencia F0–F7 de ese documento desarrolla las decisiones de esta revisión y
sustituye la tabla resumida de entregas de abajo para organizar la implementación.

## Decisión de producto actualizada — 2026-09-08

**Estado: F0, F1 y F2 implementadas y verificadas localmente.**
El historial y las dos pasadas por capas están implementados; F3–F7 siguen pendientes. Ver
[avance y evidencia](AGENT_EVALUATION_PROGRESS.md). Esta sección incorpora
la decisión del usuario: limitar la iteración automática, entregar el borrador
al QA sin bloquear su exportación por calidad y recuperar del framework la
versión que el QA corrigió y verificó para convertirla en golden.

Esta revisión sustituye los criterios del plan anterior que exigen validación
correcta o score 100 para exportar un borrador o aceptar un golden aprobado por
el QA. La auditoría original se conserva como evidencia; los validadores siguen
produciendo diagnósticos reales y no se les fuerza a devolver PASS.

### Flujo de trabajo

1. El pipeline realiza como máximo **dos pasadas: generación inicial y una
   corrección**. Puede terminar antes si no hace falta corregir.
2. Al terminar, Revisión muestra automáticamente los archivos disponibles y los
   diagnósticos pendientes. El QA no tiene que relanzar agentes para acceder al
   resultado. Si faltó una capa se informa cuál; no se presenta como generada.
3. **Exportar al framework** escribe el contenido revisado aunque tenga errores
   de compilación, Gherkin, parámetros, aserciones o convenciones. Se conserva
   como borrador pendiente de corrección, sin promocionarlo automáticamente a
   memoria por el hecho de exportarlo.
4. El QA corrige y ejecuta el caso en su framework móvil habitual.
5. **Recuperar cambios del framework** lee los archivos vinculados al caso,
   muestra el diff contra lo exportado y prepara una revisión del recording.
6. **Guardar como golden verificado por QA** acepta esa revisión, conserva el
   antes/después y actualiza el dataset y la memoria con la versión aprobada.
   La acción expresa la aprobación; no requiere otra aprobación del agente ni
   un score 100 del validador.
7. El QA envía un PR y puede modificar el caso por observaciones del reviewer,
   por una nueva grabación o por regeneración con el agente. Puede recuperar y
   volver a exportar esas revisiones en cualquier momento del ciclo, tanto
   antes como después del PR. La versión corregida puede publicarse después
   como una nueva revisión golden aprobada por el QA.

Los controles de escritura protegen el trabajo del QA: destinos dentro del
framework seleccionado, contenido visible, comparación con la versión revisada
y rollback. Un archivo compartido que cambió se reconcilia mediante diff, sin
sobrescribir trabajo ajeno silenciosamente. Estos controles no convierten un
diagnóstico de calidad en un impedimento para exportar.

### Ciclo de PR, nueva grabación y reexportación

Un caso no queda cerrado para edición por haber sido exportado, guardado como
golden, enviado en un PR o integrado al framework. El recorder debe permitir
retomarlo desde su catálogo, recuperar el código vigente, volver a grabar o
pedir un refinamiento al agente y **Actualizar caso en el framework** tantas
veces como el QA lo necesite.

El ciclo completo es:

```text
Recording → generación → exportación → corrección/verificación del QA → PR
    ↑                                                                      ↓
    └ revisión del mismo caso ← recuperación del framework ← cambios de review

Revisión → nueva grabación o regeneración → reexportación → actualización del PR
Revisión verificada por QA → nueva versión golden → actualización del índice local
```

La relación con el PR es opcional y sirve como procedencia: URL/número, repo,
rama y commit cuando estén disponibles. El QA puede añadir la referencia al
caso, pero exportar o recuperar no exige PR, commit, conexión a GitHub ni esperar
su aprobación o merge. El QA conserva su flujo habitual de commit, push y PR;
la exportación del recorder escribe en el checkout seleccionado. Una referencia
al PR no autoriza por sí misma a publicar cambios o mensajes en él.

Reglas de identidad y versionado:

- Se conserva el identificador del caso y su `recordingId` al elegir actualizar
  ese mismo caso. Cada nueva grabación crea una revisión de evidencia; cada
  regeneración solicitada por el QA crea otro intento ligado a esa revisión.
- Se mantienen las cuatro rutas vigentes y el contenido compartido. Si el QA
  movió archivos o cambió símbolos, la recuperación actualiza esas relaciones
  antes de generar: no vuelve a crear las rutas viejas ni duplica el escenario.
- La revisión registra padre, origen del cambio (`qa-framework`, `qa-recording`
  o `agent-refinement`), snapshots/hashes y contexto del checkout. La rama o
  el número del PR no sustituyen la identidad del caso.
- Un cambio de rama, rebase, merge o PR nuevo no elimina la posibilidad de
  retomarlo. Se comprueba el framework actualmente seleccionado y se captura
  su contenido real, incluyendo cambios sin commit. El estado remoto del PR
  no se presupone sincronizado con ese checkout.

Antes de regenerar o reexportar, el recorder compara la última versión exportada
con el contenido actual de los archivos vinculados. Integra las correcciones
del QA como baseline de la nueva propuesta. Las ediciones coincidentes o no
solapadas se conservan automáticamente; un conflicto real se muestra en el diff
para elegir el contenido final, manteniendo accesible el borrador.
`requireUnchangedAppliedFiles` debe evolucionar para ofrecer esta reconciliación
cuando detecta cambios esperados del QA, en lugar de dejar el caso sin camino de
actualización. No se elimina la comparación de hashes ni se sobrescribe el
framework con una respuesta antigua. Antes de escribir se comprueba que el
contenido no haya cambiado desde la revisión y la operación conserva rollback.

Los **dos intentos automáticos** se aplican a cada nueva solicitud de generación
del QA, no a toda la vida del caso. Retomar voluntariamente un caso abre una nueva
generación de hasta dos pasadas y conserva el historial anterior. Los reintentos
internos no pueden hacerse pasar por solicitudes nuevas para reiniciar el límite.

Un cambio posterior al golden crea una revisión de trabajo sin heredar la
aprobación de la versión previa. El golden histórico permanece intacto. Cuando
el QA verifica y guarda la revisión corregida, esta sustituye la referencia
activa compatible y actualiza sus fragmentos/cachés. Abrir un PR, recibir su
aprobación o hacer merge no promueve automáticamente sus bytes a golden.
Si se detecta que la referencia anterior ya no representa la implementación
vigente, se señala como pendiente de actualización para ese contexto y no se
reproduce automáticamente sobre el código corregido.

### Un límite único de iteración

Dos pasadas no significa dos llamadas totales al modelo: Lorem, Zorem y Sumrak
tienen responsabilidades distintas. Cada agente puede participar como máximo
una vez por pasada; en la segunda participan únicamente los responsables de
los errores y las dependencias afectadas.

El límite incluye correcciones en la misma sesión, relanzamientos de feedback
y resincronizaciones de interfaz. No se reinicia al cambiar de sesión ni al
pasar de validación de autor a integración. No basta con cambiar
`MAX_LAYERED_REPAIR_ATTEMPTS`: hoy coexiste con `MAX_LIVE_FEEDBACK_ROUNDS` y
otros caminos de resincronización. Las entregas completas sometidas a validación
deben consumir un presupuesto común, con pruebas que impidan una tercera
pasada automática. Las llamadas determinísticas y lecturas de caché se registran
aparte y no justifican nuevas correcciones del modelo.

Se conserva por capa la última entrega recuperable y su procedencia. Un timeout,
JSON final malformado o fallo del integrador no puede borrar una entrega anterior
ya disponible. Si solo existe borrador determinístico, se ofrece identificado
como tal. Los contenidos que no puedan interpretarse se conservan como evidencia,
sin inventar archivos de destino a partir de una respuesta malformada.

### Exportación y resultado del agente

La validación deja de ser el requisito de habilitación del botón de exportación.
Sus errores se presentan junto a los archivos y quedan asociados a la entrega.
La exportación normal no exige activar un modo avanzado o confirmar cada error.

El recibo de exportación debe contener `recordingId`, identidad del intento,
raíz del framework, rutas, archivos/símbolos afectados, hashes previos y
exportados, fecha y diagnósticos. Debe distinguirse de una certificación técnica.
El archivo realmente escrito es el que el QA vio, incluso cuando contiene
errores. Si hay destinos compartidos, se conserva el resto del contenido.

La revisión permite exportar los archivos disponibles cuando falte alguna capa
y registra esa falta. Recuperar el trabajo posterior admite vincular la capa
que el QA completó o una ruta que movió; no exige volver a generarla con agentes.

### Recuperar la corrección y actualizar el recording

La recuperación compara **baseline previo, versión exportada y versión actual**
del framework, tanto con cambios commiteados como sin commit. Usa el recibo y las
relaciones Feature → Steps → Screen → Locators; no recoge indiscriminadamente
todos los cambios de Git ni depende solo del basename.

En módulos compartidos distingue las adiciones/correcciones del caso de otras
ediciones. Conserva snapshots de los archivos completos necesarios para replay,
pero atribuye al caso únicamente los símbolos y diferencias seleccionados. Si
se movieron archivos o se incorporaron helpers, permite relacionarlos con el
caso sin exigir una nueva generación.

Actualizar la grabación significa crear una **revisión aceptada por QA**:

- mismo `recordingId`, nuevo identificador de revisión y vínculo al intento;
- cuatro capas finales y sus rutas reales;
- escenario, parámetros, referencias a métodos y locators, y trazas que puedan
  reconstruirse de manera fiable desde el código;
- diff de corrección, autor, fecha y declaración de verificación del QA;
- validación automática con sus resultados reales, aunque queden observaciones.

Las acciones, XML y capturas originales conservan su historia. Una corrección
de selector en código se registra como aportada/verificada por el QA; no se
inventa una comprobación Appium. Si cambió el flujo y no puede inferirse su
relación con una acción grabada, se marca el vínculo pendiente y se permite
asociarlo. Esto no impide guardar los archivos como referencia aprobada; sí evita
fabricar trazabilidad o reutilizar automáticamente un fragmento sin asociación.

### Golden aprobado y memoria

La fuente de ejemplos aprobados será el dataset golden. La memoria local anterior
deja de consumirse y se archiva durante la migración; no se elimina la historia
ni se promueven sus entradas automáticamente. Su reemplazo es un índice local
derivado, versionado y reconstruible exclusivamente desde golden aprobados. Se
retiran tanto la promoción al exportar como los lectores/cachés que podrían
reintroducir casos no aprobados; el índice del código actual del framework y los
diccionarios estáticos se conservan. El detalle de migración está en F1/F6 de las
fases ejecutables.

El golden conserva la entrada y el contexto previos a la generación, las
entregas del agente, la versión final del QA, el diff, hashes y versiones del
framework/contratos. Su aprobación humana y su validación automática son campos
independientes. Puede quedar `qaApproval: approved` y `automaticValidation:
failed`: esto registra una discrepancia a estudiar, no obliga a modificar código
correcto para satisfacer un patrón rígido del validador.

La verificación declarada por el QA se registra como tal, con actor y fecha.
La evidencia de una ejecución identificada puede vincularse cuando esté
disponible; no se exige un reporte adicional para aceptar su aprobación ni se
etiqueta su declaración como comprobación automática.

Guardar publica una versión inmutable e idempotente por contenido. Dataset y
memoria comparten el identificador de revisión: una corrección posterior
sustituye la referencia activa anterior e invalida la caché afectada. La
publicación debe ser recuperable para que un fallo no deje la memoria apuntando
a un golden inexistente. No se omite una corrección porque el fingerprint del
recording ya estuviera en memoria, como hace hoy `golden:seed-memory`.

La referencia completa aprobada puede orientar a los agentes; solo se extraen
fragmentos determinísticos con relaciones identificadas y compatibilidad con el
caso actual. El score técnico deja de ser la única condición de promoción en
este camino explícito del QA. El borrador fallido del agente se conserva para
evaluar errores, pero no se publica como ejemplo positivo. Las discrepancias
QA/validador sirven para probar y corregir reglas, sin desactivarlas globalmente.

### Medición

La corrección del QA no convierte retroactivamente al agente en exitoso. Por
intento se conservan resultado inicial, resultado tras la segunda pasada,
diagnósticos por capa, exportación del borrador, correcciones del QA y aprobación
final. Un caso puede terminar resuelto por el QA y contabilizarse como fallo de
generación autónoma. Se diferencian fallos del agente, del proveedor, de la app
y del entorno cuando exista evidencia para atribuirlos.

Se medirán primera pasada correcta, éxito autónomo tras corrección, intervención
del QA, reglas recurrentes, tiempo hasta entrega del borrador y hasta aprobación,
y errores que reaparecen después de incorporar una corrección. Cada tasa conserva
numerador y denominador. Los ejemplos entregados como memoria se separan de los
casos reservados para evaluar nuevas generaciones.

### Entregas de implementación actualizadas

| Entrega | Alcance | Criterio de aceptación |
| --- | --- | --- |
| E0 | Baseline actual y contratos de estados | Registrar `quality` y los SHA reales; el commit `4668b5d` ya contiene el trabajo que la F0 anterior pedía commitear. |
| E1 | Dos pasadas y entrega de borradores | Un agente que sigue fallando no obtiene una tercera pasada; sus archivos aparecen automáticamente, incluso ante fallo de integración. |
| E2 | Exportar con observaciones | Un borrador con errores TypeScript puede exportarse desde Revisión; conserva diagnósticos, contenido ajeno y rollback, sin promoción automática a memoria. |
| E3 | Recuperar correcciones del framework y del review de PR | Importar cambios commiteados o locales, reconocer rutas movidas, mostrar el diff y crear una revisión del mismo recording sin alterar su evidencia histórica. |
| E3B | Regrabar, regenerar y reexportar durante todo el ciclo del PR | Retomar un caso ya exportado, incorporar correcciones del reviewer como baseline, generar hasta dos pasadas por solicitud del QA y volver a exportar sin duplicar el caso ni perder cambios compartidos. |
| E4 | Golden aprobado y memoria coherente | Una corrección verificada por el QA se guarda aunque discrepe el validador; revisiones posteriores al PR actualizan el golden y la siguiente generación compatible recibe la versión corregida y no la anterior. |
| E5 | Regresión, aprendizaje de errores y métricas | Conservar fallos iniciales, distinguir intervención humana, verificar integridad y probar correcciones sobre casos reservados. |

Pruebas de aceptación adicionales para E3/E3B/E4:

1. Exportar, corregir un Step por review de PR, recuperar, regenerar y volver a
   exportar conserva la corrección y la identidad del caso.
2. Una nueva grabación del mismo caso conserva la evidencia anterior y actualiza
   las cuatro capas existentes al reexportar, con la cobertura real de plataforma.
3. Una edición ajena en un Screen compartido permanece después de reexportar;
   cambios solapados aparecen como conflicto revisable, sin pérdida de archivos.
4. Retomar el caso después de cambiar de rama o integrar el PR usa el checkout
   actual, sin exigir el recibo antiguo como si los archivos nunca hubieran cambiado.
5. Una segunda solicitud explícita de generación dispone de sus dos pasadas;
   ninguna solicitud obtiene una tercera pasada mediante feedback o relanzamiento.
6. Exportar una revisión nueva no modifica el golden anterior ni enseña un
   borrador a los agentes. Guardarla tras la verificación QA publica una versión
   nueva y retira del uso activo las referencias sustituidas.

EVAL-01 pasa a compartir preparación y escritura segura sin convertir compilación
o score en bloqueos de exportación. EVAL-02 mantiene parsing y diagnósticos
controlados; EVAL-03 y EVAL-08 soportan identidad e historial; EVAL-04 incorpora
aprobación QA y revisiones; EVAL-09 incluye discrepancias con validadores. El
baseline real y CI reproducible siguen siendo necesarios. Las estimaciones de
18–21 días del plan anterior deben recalcularse para este alcance.

## Plan anterior — referencia histórica del 2026-09-07

Las secciones siguientes conservan el diagnóstico y la propuesta previa. Ante
una diferencia de flujo o criterio de aceptación, prevalece la revisión de
producto del 2026-09-08 descrita arriba.

---

## 1. Veredicto — ¿nos sirve?

**Sí, aproximadamente dos tercios del backlog. El resto conviene aplazarlo o
convertirlo en documentación de límites.**

El punto de fondo es este: hoy el recorder afirma —correctamente— *«propuesta
validada contractualmente y comprobada con TypeScript dentro del alcance
indicado»*. Esa afirmación se sostiene gracias al camino de **apply**
(`applyReviewedAutomation` → `AutomationApplier`), que sí revalida, compila,
comprueba el registro de archivos administrados y escribe con rollback.

El problema es que las rutas que **certifican** esa afirmación —el guardado
golden, la clasificación de baseline, el helper de calidad, el validador de
schema de entrada— son más débiles que la ruta que protegen. Un dataset golden
construido sobre una escritura menos garantizada no es un dataset de referencia:
es una copia de algo que nadie verificó con el mismo rigor.

Por eso el criterio de adopción de este plan es **cerrar la brecha entre lo que
el recorder promete y lo que sus rutas de certificación comprueban**, y no
convertir el recorder en un framework de benchmarking de modelos, que es un
producto distinto con costos distintos.

### Qué adoptamos y qué no

| ID | Decisión | Razón |
| --- | --- | --- |
| EVAL-01 Unificar guardado golden y apply | **Adoptar (P0)** | Defecto verificado en código. Es el que invalida el resto. |
| EVAL-02 Validación uniforme de schemas | **Adoptar (P1)** | Defecto verificado: el validador ignora restricciones declaradas. |
| EVAL-03 Resultado por intento (`attemptId`) | **Adoptar (P1)** | Prerrequisito de toda métrica; sin él no hay denominador posible. |
| EVAL-04 Dataset golden aprobado | **Adoptar (P1), en versión mínima** | Un corpus de 5–8 casos ya da regresión útil; no hace falta un corpus «representativo» para empezar. |
| EVAL-05 Baseline real de regresiones | **Adoptar (P1)** | Defecto verificado y de esfuerzo bajo. |
| EVAL-09 Evaluar la calidad de los evaluadores | **Adoptar (P2), parcial** | El bug de cobertura está confirmado; la suite completa de mutaciones puede crecer por incrementos. |
| EVAL-10 CI reproducible | **Adoptar (P2), es barato** | Una línea del workflow. Sin esto, ninguna métrica es comparable entre corridas. |
| EVAL-08 Consolidar telemetría | **Adoptar después de EVAL-03** | Útil, pero sin identidad por intento solo produce números más ordenados y igual de poco comparables. |
| EVAL-06 Runner A/B de agentes reales | **Aplazar — condicionado** | Alto costo real (cada corrida de Zorem son 100–190 s más créditos). Sin corpus ni denominadores no hay nada que comparar. Reevaluar al cerrar F4. |
| EVAL-07 Aislamiento del proceso del agente | **No implementar ahora; documentar límites** | El modelo de amenaza no lo justifica: el agente corre en la máquina del propio QA, contra un repo que el QA ya puede escribir. Lo que sí falta es decir por escrito que `--add-dir` no es un sandbox. |
| EVAL-11 Privacidad y límites de logs | **Aplazar (P3)** | Vale la pena cuando los artefactos salgan de la máquina del QA (CI, dataset compartido). Hoy no salen. |
| EVAL-12 Consolidar índice y contexto | **Aplazar (P3)** | Optimización de I/O, no de confianza. Compite con trabajo de más valor. |

### Advertencia de alcance

La auditoría está escrita con el vocabulario de un *framework de evaluación de
agentes* (task success, A/B, tasas de falsos positivos, gates de release). Ese
vocabulario es correcto para diagnosticar, pero adoptarlo como hoja de ruta
completa desplaza el objetivo real del recorder, que es **que un QA obtenga en
minutos un caso que hoy le toma horas escribir a mano**.

La recomendación es tratar los gates de la sección 18 de la auditoría como
*criterios de madurez a futuro*, no como trabajo de este trimestre. Fijar
«éxito final ≥ 98 %» antes de tener un denominador medido solo produce una cifra
que nadie puede defender en una revisión.

---

## 2. Evidencia verificada (2026-09-07)

Revisé el código en la rama actual para no planificar sobre afirmaciones sin
comprobar. Cinco hallazgos de la auditoría quedan **confirmados**:

**1. El guardado golden no comparte las garantías del apply** — confirmado en
`recorder/src/ipc/automation/goldenCase.ts`.

| Garantía | `applyAutomation.ts` | `goldenCase.ts` |
| --- | --- | --- |
| Revalidación contractual | Sí | Solo si hubo edición (`accepted.edited`) |
| `FrameworkCompilationValidator` | Sí | **No** |
| `generatedFileRegistry.assess` (conflicto con archivos ajenos) | Sí | **No** |
| `requireUnchangedAppliedFiles` (cambios externos) | Sí | **No** |
| Escritura transaccional con rollback | Sí (`AutomationApplier.commit`) | **No**: `writeUtf8FileAtomic` en bucle, sin rollback del conjunto |
| Verificación del preview preparado | Sí (`previewToken` + `requireUnchanged`) | **No** |

Además, cuando `!accepted.edited` reutiliza `validation.json` del apply: si el
framework cambió después de aplicar, esa validación ya no describe los bytes en
disco.

**2. `validateWithSchema` ignora restricciones declaradas** — confirmado en
`core/automation/infrastructure/copilotCliAdapter.ts:145`. Implementa `const`,
`enum`, `type`, `minItems`, `maxItems`, `required`, `properties` y
`additionalProperties`. **No** implementa `minLength`, `maxLength`, `pattern`,
`minimum`, `maximum`, `format`, `anyOf`/`oneOf`, ni los tipos `boolean` y
`null` (que caen al `return true` final). Los dos ejemplos de la auditoría son
correctos.

**3. El corpus golden está vacío** — no existe el directorio `tests/golden` en
el repo. `listGoldenCases` devuelve `[]` cuando la raíz no existe, y el test de
replay recorre esa lista: **hoy pasa en verde sin evaluar ningún caso**.

**4. `readGoldenCase` no verifica integridad** — confirmado en
`goldenDataset.ts:309`. Comprueba `schemaVersion` del manifiesto pero nunca
recalcula el `sha256` que él mismo guardó por archivo en `saveGoldenCase`. El
manifiesto tampoco tiene campo de criticidad ni de aprobación.

**5. `phase43-baseline.js` clasifica por nombres fijos** — confirmado: un array
`REGRESSION_MATCHERS` de tres cadenas literales; todo lo demás se etiqueta
`PREEXISTING_CONFIRMED` sin comparar contra ninguna evidencia capturada.

**6. El workflow de calidad no fija el framework** — confirmado en
`.github/workflows/quality.yml`: el checkout de `yaperos/fwk-mobile-test` no
lleva `ref`, así que cada corrida usa la punta de su rama por defecto.

**Bug adicional encontrado (no estaba explícito en la auditoría):**
`calculateGenerationQuality` (`core/generation/domain/generationQuality.ts:20`)
calcula `actionCoverage` como `linkedActions.size / actionCount`, sin comprobar
que cada índice pertenezca al recording. Con `actionIndices: [99]` y una sola
acción, el tamaño del `Set` es 1 y la cobertura da 1 → score 100 y
`passed: true`. La corrección es una línea: filtrar los índices fuera de rango
antes de contar, y reportar los descartados como error, no ignorarlos.

**Lo que no pude verificar en esta sesión:** no ejecuté tests, typecheck ni
`npm run quality` — el shell de la VM del escritorio está caído (`device_bash`
falla; el puente de archivos sí responde). Todo lo anterior es lectura de código
y de estructura de directorios, no ejecución.

---

## 3. Plan por fases

Estimaciones en días de trabajo efectivo, no en calendario.

| Fase | Contenido | IDs | Est. | Bloquea a |
| --- | --- | --- | --- | --- |
| **F0** | Línea base limpia | — | 0,5 | Todas |
| **F1** | Cerrar la ruta de escritura golden | EVAL-01 + bug de cobertura | 2–3 | F4 |
| **F2** | Contratos de entrada | EVAL-02 | 2 | — |
| **F3** | Identidad y estado por intento | EVAL-03 | 3–4 | F5 |
| **F4** | Corpus golden con integridad + baseline real | EVAL-04, EVAL-05 | 4–5 | F6 |
| **F5** | Telemetría consolidada y tasas | EVAL-08 | 3 | Gates |
| **F6** | Calidad de los evaluadores | EVAL-09 | 3 | — |
| **Carril paralelo** | CI reproducible | EVAL-10 | 0,5 | — |
| **F7** | Condicional: runner repetido / A/B | EVAL-06 | Alto | — |

Total del núcleo (F0–F6 + carril): **~18–21 días**. F7 queda fuera hasta que
haya decisión explícita.

---

### F0 — Línea base limpia (0,5 d)

**Objetivo:** no arrancar el plan sobre un árbol de trabajo sin commitear.

1. Commitear los 26 archivos pendientes del golden dataset y de
   `gap-platform-coverage` (trabajo del 07-09 aún sin commit).
2. Ejecutar `npm run quality` completo desde el checkout dentro del framework
   padre y anotar el resultado exacto (tests, typecheck, arquitectura, métricas).
   Esta es la línea base de F4/EVAL-05: sin ella la clasificación de fallos
   sigue siendo por nombres.
3. Escribir tres tests **en rojo** que documenten los defectos confirmados:
   guardado golden con TypeScript inválido, `actionIndices` fuera de rango, y
   replay golden con corpus vacío.

**Criterio de aceptación:** los tres tests fallan por la razón esperada y el
reporte de `npm run quality` queda guardado como evidencia fechada.

---

### F1 — Cerrar la ruta de escritura golden (2–3 d) · **P0**

**Objetivo:** que guardar un golden ofrezca exactamente las mismas garantías que
aplicar.

Una advertencia de diseño: *no* se puede reutilizar `applyReviewedAutomation`
tal cual. Ese flujo exige un `previewToken` y estado vivo en
`RecorderRuntimeState`, y el guardado golden ocurre **después** del apply —
incluso días después, sobre correcciones que el QA hizo en el framework. La
forma correcta es extraer las garantías compartidas, no llamar al handler.

**Cambios:**

1. Extraer en `core/automation` un servicio `commitVerifiedFiles` (o similar)
   que encapsule: revalidación contractual → `FrameworkCompilationValidator` →
   `generatedFileRegistry.assess` → `requireUnchangedAppliedFiles` → escritura
   transaccional vía `AutomationApplier` con rollback.
2. `applyReviewedAutomation` pasa a consumirlo, sin cambio de comportamiento
   observable. Los tests existentes de `preparedAutomation` y
   `automationPatchWriter` son la red de seguridad.
3. `saveGoldenCaseFromPackage` lo consume también, siempre — no solo cuando
   `accepted.edited`.
4. Cuando **no** hubo edición: en vez de reutilizar `validation.json`, revalidar
   contra los bytes actuales en disco. Si el resultado difiere del guardado,
   fallar con el diagnóstico, no guardar.

**Criterio de aceptación:** existen tests que cubren, por la ruta golden,
(a) código TypeScript inválido → rechazo sin escribir nada; (b) archivo del
framework modificado por fuera → rechazo; (c) fallo en la segunda escritura →
restauración completa de framework, recibo, registro y memoria.

**Riesgo:** medio. Toca el camino de escritura, que es el más delicado del
proyecto. Mitigación: refactor en dos commits (extraer sin cambiar
comportamiento → luego enchufar golden), con `npm run quality` verde entre
ambos.

**Extra barato en esta fase:** corregir `calculateGenerationQuality` para
descartar índices fuera de rango y reportarlos.

---

### F2 — Contratos de entrada (2 d) · **P1**

**Objetivo:** que una respuesta malformada del agente produzca un diagnóstico,
no una excepción ni un falso PASS.

**Cambios:**

1. Completar `validateWithSchema` con `minLength`, `maxLength`, `pattern`,
   `minimum`, `maximum`, `boolean`, `null` y `anyOf`. Mantenerlo como
   subconjunto documentado —no hace falta un JSON Schema completo— pero que el
   subconjunto **declarado en los schemas del proyecto** esté cubierto por
   entero. Añadir un test que recorra los schemas reales y falle si usan una
   palabra clave no implementada: así el subconjunto no se desincroniza.
2. Límite global de bytes antes de leer y parsear JSON de la respuesta del
   agente, uniforme para todos los puntos de entrada.
3. Blindar `responseImport`: las operaciones que hoy pueden lanzar ante
   estructuras malformadas (`resolutions.forEach`, `files.filter`) devuelven
   error de validación con severidad, campo, valor esperado y observado.

**Criterio de aceptación:** entrada nula, campos ausentes, campos extra,
restricciones numéricas y de texto fuera de rango, y payload sobre el límite
producen todos un diagnóstico controlado. Ninguno produce excepción no
capturada ni `valid: true`.

---

### F3 — Identidad y estado por intento (3–4 d) · **P1**

**Objetivo:** que cada intento de generación tenga un identificador y un estado
terminal único. Es el prerrequisito de toda la sección de métricas: sin
`attemptId` no hay denominador y ninguna tasa es defendible.

**Cambios:**

1. `attemptId` generado al iniciar el intento, propagado por el orquestador
   layered, `agentRunStore` y los artefactos del paquete, junto a `recordingId`
   y `planId`.
2. Estado terminal único por intento, con estos valores como punto de partida:
   `generation-success`, `generation-failed`, `contract-invalid`, `timeout`,
   `cancelled`, `not-evaluated`. **Sin ejecución funcional se registra
   `not-evaluated`, nunca éxito implícito.**
3. Historial append-only de eventos y de decisiones del QA: actor, intento,
   valor anterior. Distinguir sugerencia de diseño (no bloqueante) de decisión
   obligatoria — hoy se confunden y contaminan `qaRequiredRate`.
4. Implementar `generationTaskSuccess` según la definición de la sección 9 de la
   auditoría. Dejar `functionalTaskSuccess` definido pero sin implementar hasta
   que exista ejecución en dispositivo.

**Criterio de aceptación:** en éxito, fallo, timeout, respuesta desde caché y
corrección manual posterior, el reporte layered y `agent-run.json` coinciden en
`attemptId` y estado terminal. El caso del recording `85a9110f` citado en la
auditoría queda reproducible sin ambigüedad.

---

### F4 — Corpus golden con integridad + baseline real (4–5 d) · **P1**

Depende de F1: no tiene sentido poblar un corpus por una ruta que aún no
garantiza lo que guarda.

**Cambios (EVAL-04):**

1. **Gate explícito de corpus vacío**: `test:golden` falla —o al menos reporta
   `not-evaluated` de forma visible— cuando no encuentra casos. Que hoy pase en
   verde sin evaluar nada es peor que no tener el test.
2. Verificar el `sha256` de cada archivo esperado al leer el caso, no solo al
   escribirlo.
3. Campos obligatorios en el manifiesto: `criticality` (`critical` | `normal`) y
   `approvedBy` / `approvedAt`. Un caso sin aprobación no entra al corpus.
4. Congelar el catálogo **previo** a la aplicación del caso, no el posterior:
   hoy el catálogo capturado ya contiene los artefactos del propio caso.
5. Reconstruir el framework del replay desde el `framework.head` del manifiesto,
   no desde el HEAD disponible. Si ese commit no está accesible, marcar el caso
   `skipped-unreproducible` en vez de evaluarlo contra otro estado.
6. Poblar **5 a 8 casos**: al menos uno por plataforma, uno con reutilización de
   step existente, uno con `update` sobre un módulo ajeno y uno negativo
   (aserción incorrecta que el validador debe rechazar). No apuntar a un corpus
   «representativo» en esta fase.

**Cambios (EVAL-05):**

7. `phase43-baseline.js` compara contra el reporte capturado en F0 en vez de la
   lista `REGRESSION_MATCHERS`. Clasificación derivada de la evidencia: fallo
   nuevo, preexistente o resuelto. Eliminar las cadenas literales.

**Criterio de aceptación:** `npm run test:golden` con corpus vacío falla; con
corpus poblado evalúa todos los casos y reporta cuántos; un archivo esperado
alterado a mano hace fallar el caso por hash; `test:phase43:baseline` distingue
correctamente un fallo nuevo introducido a propósito.

---

### F5 — Telemetría consolidada y tasas (3 d) · **P2**

Depende de F3.

**Cambios:**

1. Consolidar el reporte layered hacia `agent-run` por invocación real.
2. Separar explícitamente: invocaciones reales al modelo, tiempo de pared,
   espera del QA, tiempo servido por caché y concurrencia. **No sumar
   duraciones de etapas paralelas.**
3. Separar contexto *disponible* / *enviado* / *leído*. `hintsUsed` se documenta
   como contador de disponibilidad, no como prueba de lectura por el modelo.
4. Implementar los agregadores de la sección 10 con denominador explícito en el
   nombre y en el reporte: `firstPassSuccessRate`, `finalSuccessRate`,
   `repairRate`, `qaRequiredRate`, `contractViolationRate`, `stepReuseRate`,
   `verifiedSelectorUsageRate`, `timeoutRate`. `functionalFailureRate` queda
   declarado pero sin datos hasta que exista ejecución real.
5. No reportar tokens ni costo monetario cuando el proveedor no los expone;
   dejarlos nulos y visibles como nulos.

**Criterio de aceptación:** cada tasa publicada muestra numerador y denominador.
Ninguna métrica se calcula sobre intentos `not-evaluated`.

---

### F6 — Calidad de los evaluadores (3 d) · **P2**

**Objetivo:** medir si los validadores detectan lo que dicen detectar.

**Cambios:** suite de mutaciones sobre los casos del corpus de F4 — aserción
eliminada, selector alterado, orden de acciones incorrecto, parámetro fijado en
el Screen, keyword Gherkin incoherente. Cada mutación debe ser rechazada por una
regla nombrada. En paralelo, un conjunto de equivalencias válidas (helper
alternativo correcto, paráfrasis Gherkin correcta) que **no** deben rechazarse.

**Criterio de aceptación:** la suite produce una matriz de detección por regla.
No se fija un umbral de tasa en esta fase: primero se mide.

---

### Carril paralelo — CI reproducible (0,5 d) · **P2**

Independiente de todo lo demás; se puede hacer cualquier día.

Fijar `ref` en el checkout de `yaperos/fwk-mobile-test` en
`.github/workflows/quality.yml`, con el SHA como variable actualizable por PR
propio. Hoy cada corrida usa la punta de la rama por defecto, así que dos
corridas del mismo commit del recorder pueden dar resultados distintos — lo que
invalida cualquier comparación de F5.

---

### F7 — Runner repetido / A/B (condicional) · **P1 en la auditoría, aplazado aquí**

**No arrancar hasta cerrar F4.** Reevaluar entonces con estos datos en mano:
cuántos casos tiene el corpus, cuánto cuesta una corrida real de la pipeline y
cuántas repeticiones hacen falta para que la mediana sea estable.

Si se aprueba, el alcance mínimo es: mismo corpus, misma configuración, **una
sola variable por experimento**, todas las salidas conservadas incluidos los
fallos, y caché fría y caliente medidas por separado. Cualquier cosa más grande
que eso es un proyecto propio, no una fase de este plan.

---

## 4. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| F1 toca el camino de escritura | Refactor en dos commits con `quality` verde entre ambos; los tests de `preparedAutomation` y `automationPatchWriter` son la red |
| El corpus golden envejece con el framework | `framework.head` obligatorio + `skipped-unreproducible`; revisar el corpus cuando cambie el contrato |
| Poblar el corpus consume tiempo de QA real | Empezar con 5 casos, no con un corpus «representativo» |
| Las métricas de F5 se leen como garantías antes de tener baseline | Publicar siempre numerador y denominador; no activar ningún gate de la sección 18 hasta cerrar F5 |
| El plan desplaza el trabajo de producto | F7 queda fuera por defecto; el núcleo son ~18–21 días, no un trimestre |

---

## 5. Decisiones pendientes

1. **¿Se implementa EVAL-07 (aislamiento) o se documenta como límite conocido?**
   La recomendación es documentar: escribir en `OPERATIONS_AND_TROUBLESHOOTING`
   que `--add-dir` y las instrucciones de scope no son un sandbox del sistema
   operativo, y qué implica eso. Construir un sandbox real es alto esfuerzo para
   un modelo de amenaza que hoy no lo pide.
2. **¿Cuántos casos golden y de qué squads?** Afecta directamente el tamaño de
   F4.
3. **¿F7 entra este trimestre?** Decisión de presupuesto, no técnica.
