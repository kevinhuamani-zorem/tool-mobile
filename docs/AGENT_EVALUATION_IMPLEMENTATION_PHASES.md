# Fases de implementación — generación, revisión QA y golden

Fecha: 2026-09-08.

Estado: **F0–F6 implementadas y verificadas localmente**.
La siguiente entrega es F7; conserva sus pendientes debajo. Ver
[avance y evidencia](AGENT_EVALUATION_PROGRESS.md). Referencia inicial inspeccionada del recorder:
`feature/multi-agent-generation-pipeline`, commit `4668b5d`, bajo
`fwk-mobile-test-updated/tools/visual-recorder`.

Este documento convierte las decisiones de
[AGENT_EVALUATION_PLAN.md](AGENT_EVALUATION_PLAN.md) en entregas ejecutables.
La auditoría de [AGENT_EVALUATION_IMPROVEMENTS.md](AGENT_EVALUATION_IMPROVEMENTS.md)
conserva los hallazgos de origen. Esta secuencia reemplaza la numeración de
entregas E0–E5/E3B y las fases históricas F0–F7 del plan anterior para el trabajo
nuevo. Los documentos históricos no constituyen evidencia de pruebas actuales.

## Resultado de producto

Un QA puede generar un caso, recibir el borrador tras un máximo de dos pasadas,
exportarlo aunque haya diagnósticos, corregirlo y probarlo en el framework,
enviar un PR y recuperar sus cambios en el recorder. Puede regrabar, regenerar
y reexportar ese mismo caso durante todo su ciclo de vida. Cuando aprueba una
versión como golden, esta pasa a ser una referencia para nuevas generaciones.

El dataset golden es la fuente de conocimiento aprobado. El almacenamiento local
de ejemplos es un índice derivado y reconstruible. Exportar una propuesta no la
convierte en ejemplo positivo. La memoria antigua se retira del consumo y se
conserva como archivo histórico, sin promoverla automáticamente a golden.

## Secuencia y dependencias

| Fase | Entrega | Depende de | Resultado visible |
| --- | --- | --- | --- |
| F0 | Baseline y mapa de cambios | — | Evidencia real del punto de partida. |
| F1 | Historial por revisión e intento; retirada de memoria antigua | F0 | Cada versión tiene identidad y los borradores dejan de enseñar al sistema. |
| F2 | Dos pasadas y conservación de borradores | F1 | El QA recibe los archivos disponibles al terminar el límite. |
| F3 | Exportación con observaciones | F1, F2 | El QA puede continuar corrigiendo en el framework. |
| F4 | Recuperación de correcciones del framework | F1, F3 | Los cambios del QA vuelven al recording como una revisión. |
| F5 | Regeneración y reexportación durante el PR | F2, F3, F4 | El mismo caso puede actualizarse repetidamente sin perder correcciones. |
| F6 | Golden versionado e índice local derivado | F1, F4, F5 | La versión aprobada por QA se conserva y sustituye las referencias anteriores. |
| F7 | Ejemplos, aprendizaje de correcciones y evaluación | F2, F6 | Las correcciones ayudan a generar y su efecto se mide. |

**Hito 1 — F0 a F3:** el agente entrega un borrador utilizable y el QA puede
exportarlo sin esperar que todos los diagnósticos desaparezcan.

**Hito 2 — F4 y F5:** el recorder recupera el trabajo del QA y soporta sucesivas
revisiones del mismo caso durante y después del PR.

**Hito 3 — F6 y F7:** solo los golden aprobados alimentan los ejemplos; existe
evidencia de cuáles errores se reducen o reaparecen.

## F0 — Baseline y mapa de cambios

Objetivo: empezar desde el estado real del recorder y del framework.

- [x] Capturar SHA y estado de trabajo de ambos repositorios, versiones de
  Node/dependencias y resultado fechado de `npm run quality`.
- [x] Consultar CodeGraph antes de modificar módulos grandes y registrar los
  puntos donde se valida, exporta, corrige, cachea y promociona memoria.
- [x] Identificar todos los límites de corrección, incluyendo feedback dentro
  de sesiones y resincronización de la interfaz Lorem/Zorem.
- [x] Fijar una referencia real del framework para CI y comparar fallos con la
  evidencia capturada, sustituyendo la clasificación por nombres hardcodeados
  de `phase43-baseline.js`. No inventar un SHA ni esconder fallos preexistentes.
- [x] Preparar fixtures aislados de borrador inválido, archivo compartido con
  cambios QA y recording ya exportado. No convertirlos en golden aprobado.

Superficie: `.github/workflows/quality.yml`, `scripts/phase43-baseline.js`,
`tests/helpers/isolatedFramework.js` y documentación de calidad.

Salida: reporte reproducible con fallos nuevos/preexistentes distinguidos y
mapa concreto de la implementación. El baseline se captura al ejecutar esta
fase; no se reutilizan como resultado actual las 402 pruebas de la auditoría.

## F1 — Historial e inhabilitación de la memoria antigua

Objetivo: poder reconstruir cada cambio y dejar de asumir que exportar demuestra
un caso exitoso.

- [x] Introducir contratos versionados para revisión del recording, intento y
  recibo de exportación. Reutilizar o mapear el `runId` existente a la identidad
  común del intento, sin crear dos identificadores con significado ambiguo.
- [x] Conservar `caseId` y `recordingId`; generar `revisionId`, `parentRevisionId`
  y `attemptId` cuando corresponda. Registrar pasada 1/2 y origen de cada artefacto.
- [x] Guardar eventos y snapshots sin sobrescribir la primera respuesta al
  normalizarla, corregirla o recibir una edición humana. Los archivos actuales
  del paquete pueden seguir como vistas compatibles del historial.
- [x] Separar estados de generación, exportación, aprobación QA y verificación
  funcional. Una exportación con observaciones no significa generación exitosa.
- [x] Retirar la promoción automática desde `applyAutomation` y deshabilitar
  los lectores de casos, fragmentos, gaps y vocabulario de la memoria antigua,
  incluyendo su reconstrucción automática y los caminos manual/heredado.
- [x] Invalidar las cachés persistentes de respuestas previas del agente. Las
  entregas de un intento en curso pueden conservarse para continuar ese intento;
  no se reutilizan entre casos como conocimiento aprobado.
- [x] Preparar una migración idempotente que archive la memoria anterior sin
  borrado destructivo. Conservar el índice del framework, los diccionarios
  estáticos, las grabaciones y la evidencia; no son casos aprendidos.
- [x] Permitir generación con el índice golden vacío: usar contratos, resolver
  y evidencia actual del framework. No reactivar memoria antigua como fallback.

Superficie: `automationRecordingStore.ts`, `agentRunStore.ts`,
`layeredGenerationContracts.ts`, `automationMemory.ts`, `memoryFragments.ts`,
`automationPackageBuilder.ts`, `layered/artifacts.ts`, `layered/memoryReuse.ts`,
`applyAutomation.ts` y `scripts/golden-seed-memory.js`.

Salida comprobable: una entrada antigua con score 100 no llega al agente ni
reaparece después de reiniciar; exportar no crea aprendizaje nuevo; todos los
artefactos de un intento y las revisiones QA tienen un vínculo inequívoco.

Contrato y límites de esta entrega: [AUTOMATION_HISTORY.md](AUTOMATION_HISTORY.md).
El historial registra las pasadas comunes del pipeline por capas de F2.
Los estados QA/funcional existen separados en el contrato,
pero su captura desde la interfaz golden corresponde a F6.

## F2 — Dos pasadas y entrega automática del borrador

Objetivo: terminar la intervención automática y permitir continuar al QA.

- [x] Implementar un presupuesto común de dos pasadas por solicitud del QA:
  generación inicial y una corrección. Cada agente participa como máximo una
  vez por pasada, solo si hace falta; no son dos llamadas globales al modelo.
- [x] Contar las correcciones entregadas dentro de la sesión, relanzamientos
  y resincronizaciones. Ningún contador interno puede abrir una tercera pasada.
- [x] Dirigir el feedback al autor responsable con código, archivo/símbolo,
  esperado y observado. Reutilizar el catálogo de reglas existente.
- [x] Mantener originales y últimas entregas recuperables por capa. Un fallo de
  Sumrak o un timeout no descarta las salidas de Lorem/Zorem.
- [x] Abrir Revisión automáticamente al terminar, con diagnóstico, procedencia
  y capas faltantes. Ofrecer borrador determinístico si existe, identificado.
- [x] Validar tamaño y forma de los envelopes antes de recorrer/normalizar sus
  campos. Un JSON malformado no permite inventar rutas: se conserva como evidencia
  y se ofrece la última entrega recuperable si la hay.

Superficie: `layeredGenerationOrchestrator.ts`, `layered/roles.ts`,
`copilotCliAdapter.ts`, `agentLaunch.ts`, `responseImport.ts` y las features
`review`/`generation` del renderer.

Salida comprobable: proveedores simulados que fallan repetidamente no reciben
una tercera pasada; la UI muestra los archivos y errores sin requerir otro
relanzamiento. Repetir voluntariamente la generación crea un intento nuevo.

Contrato y alcance de F2 en el pipeline por capas:
[AGENT_TWO_PASS_GENERATION.md](AGENT_TWO_PASS_GENERATION.md). Las sesiones
terminan en la primera entrega estable: las correcciones se procesan en la
segunda pasada común, sin rondas internas adicionales.

## F3 — Exportar con observaciones

Objetivo: entregar el trabajo al framework sin convertir calidad automática en
un impedimento para el QA.

- [x] Separar los diagnósticos de contenido del estado que habilita exportación.
  Errores de TypeScript, aserciones, Gherkin o parámetros siguen visibles y no
  deshabilitan la escritura del borrador revisado.
- [x] Extraer/reutilizar preparación y escritura transaccional sin imponer score
  100. La exportación escribe los bytes revisados, con las rutas asociadas al caso.
- [x] Conservar límites del workspace, snapshots, protección de contenido ajeno
  y rollback. La revisión de un conflicto de escritura no obliga a corregir
  todos los diagnósticos del código.
- [x] Exportar las capas disponibles y registrar las faltantes; no fabricar
  contenido para aparentar completitud ni inferir destinos de JSON ilegible.
- [x] Guardar recibo versionado con hashes previos/exportados, identidad del
  intento/revisión, rutas y símbolos. Registrar `exported-with-observations`
  cuando corresponda, sin certificar éxito ni promover memoria.
- [x] Actualizar el flujo completo de IPC, preload, tipos, UI y mensajes de
  producto. El QA no tiene que activar un modo avanzado para exportar.

Superficie: `applyAutomation.ts`, `automationApplier.ts`,
`automationPatchWriter.ts`, `generatedFileRegistry.ts`,
`automationApplicationReceipt.ts`, `responseImport.ts`, `automationHandlers.ts`,
`preload.ts`, tipos del renderer y features `review`/`generation`.

Salida comprobable: un Screen con un método inexistente puede exportarse como
borrador; el diagnóstico se conserva. Una falla en la segunda escritura restaura
el conjunto. Una edición en un archivo compartido no desaparece al exportar.

Contrato: [AUTOMATION_DRAFT_EXPORT.md](AUTOMATION_DRAFT_EXPORT.md).

## F4 — Recuperar las correcciones del framework

Objetivo: obtener exactamente lo que el QA corrigió, con o sin commit.

- [x] Añadir **Recuperar cambios del framework** al caso retomado.
- [x] Comparar baseline previo, versión exportada y contenido actual. Seguir
  Feature → Steps → Screen → Locators y dependencias reales, no todos los cambios
  de Git ni coincidencias de basename.
- [x] Reconocer rutas/símbolos movidos y permitir asociar los que no puedan
  resolverse con certeza. Incluir helpers añadidos por el QA como dependencias
  del caso sin inventar una quinta capa obligatoria.
- [x] Mostrar un diff de los cambios vinculados al caso, distinguiendo ediciones
  ajenas en módulos compartidos. No hace falta commitear para recuperarlos.
- [x] Crear una revisión con el código final y relaciones reconstruibles:
  Gherkin, parámetros, métodos, locators y trazas. Conservar evidencia grabada
  original y registrar las correcciones de código como aportadas por el QA.
- [x] Mantener asociaciones no inferibles explícitamente pendientes; permitir
  guardar los archivos recuperados sin inventar eventos ni verificaciones Appium.
- [x] Registrar referencia opcional al PR y contexto local de repo/rama/commit.
  No exigir conexión a GitHub ni aprobación/merge para recuperar o exportar.

Superficie: `automationRecordingStore.ts`, `automationApplicationReceipt.ts`,
`goldenCase.ts`, CodeGraph/relaciones existentes, `automationHandlers.ts`,
preload/tipos y revisión del renderer. El servicio de recuperación será nuevo
si el código existente no permite aislar esa responsabilidad.

Salida comprobable: el QA cambia un parámetro, renombra un método y modifica una
aserción en el framework; Recuperar muestra y conserva esos cambios en la nueva
revisión del mismo recording, sin capturar trabajo ajeno ni alterar su historia.

Contrato: [AUTOMATION_FRAMEWORK_RECOVERY.md](AUTOMATION_FRAMEWORK_RECOVERY.md).

## F5 — Regrabar, regenerar y reexportar durante el PR

Objetivo: mantener abierto el ciclo del mismo caso durante toda su vida útil.

- [x] Retomar una revisión mediante **Volver a grabar** o **Regenerar con agente**,
  conservando identidad del caso y creando una revisión/intento nuevo.
- [x] Recuperar el código actual antes de construir el paquete de regeneración;
  las correcciones del QA/reviewer forman su baseline, no una respuesta antigua.
- [x] Combinar cambios no solapados y presentar conflictos reales entre versiones.
  Adaptar `requireUnchangedAppliedFiles` al camino de reconciliación, sin quitar
  la comprobación de cambios concurrentes justo antes de escribir.
- [x] Reexportar las rutas vigentes como actualización del mismo caso, preservando
  métodos/locators compartidos y evitando duplicar escenarios.
- [x] Soportar cambio de rama, rebase o merge usando el checkout seleccionado;
  registrar su estado real sin asumir que coincide con el PR remoto.
- [x] Permitir reiterar el ciclo a petición del QA. Cada solicitud tiene sus dos
  pasadas; exportar o actualizar el PR no promociona automáticamente un golden.

Superficie: `prepare-automation-regeneration`, `automationPackageBuilder.ts`,
`automationCorrectionBaseline.ts`, `automationApplicationReceipt.ts`,
`automationApplier.ts`, stores de revisión y features `platform-completion`,
`review` y `generation`.

Salida comprobable: exportar → corrección por review → recuperar → regrabar o
regenerar → reexportar mantiene la corrección, la identidad y el contenido
compartido. Repetir el ciclo después del merge sigue siendo posible.

Contrato: [AUTOMATION_RECONCILIATION.md](AUTOMATION_RECONCILIATION.md).

## F6 — Golden aprobado e índice local reconstruible

Objetivo: que el conocimiento aprobado tenga una única fuente y versiones claras.

- [x] Evolucionar **Guardar como dataset** a **Guardar como golden verificado
  por QA**, usando la revisión y bytes que el QA acaba de aceptar.
- [x] Guardar versiones inmutables, con aprobación/actor/fecha, hashes, contexto
  previo, baselines, entregas del agente y diferencias con la corrección final.
  La declaración QA y la evidencia automática de ejecución son campos distintos.
- [x] Guardar los diagnósticos reales sin exigir score 100 ni un reporte adicional
  para aceptar la aprobación QA. Señalar discrepancias para evaluar las reglas.
- [x] Recalcular hashes al leer y verificar la integridad de los artefactos.
  La integridad del almacenamiento no equivale a calidad funcional del caso.
- [x] Publicar de forma idempotente por contenido, con recuperación ante fallo.
  Un índice derivado desactualizado se reconstruye desde el golden confirmado;
  nunca es la autoridad para decidir cuál versión aprobó el QA.
- [x] Construir el índice local únicamente desde revisiones golden activas:
  `goldenId`, `revisionId`, hash, ámbito, plataforma, contrato y procedencia.
  Actualizar también estadísticas y el script de reconstrucción de memoria.
- [x] Retirar referencias sustituidas e invalidar cachés dependientes. Un cambio
  posterior del framework no hereda la aprobación; la versión histórica sigue
  disponible y la compatibilidad actual se comprueba antes de reutilizarla.
- [x] Permitir revisar casos antiguos y promoverlos explícitamente por QA; no
  convertir su score, existencia en disco o PR integrado en aprobación nueva.

Superficie: `goldenDataset.ts`, `goldenCase.ts`, `automationMemory.ts` o su
reemplazo como índice derivado, `memoryFragments.ts`, `golden-seed-memory.js`,
`golden-save.js`, APIs y panel golden del renderer.

Salida comprobable: guardar dos veces los mismos bytes no duplica versiones;
corregir y aprobar publica otra revisión y sustituye la referencia activa;
borrar solo el índice derivado y reconstruirlo produce los mismos resultados.
Un fallo de publicación no deja referencias activas a artefactos inexistentes.

## F7 — Ejemplos útiles, correcciones y evaluación

Objetivo: demostrar cómo los golden influyen en las nuevas generaciones.

- [ ] Seleccionar ejemplos al preparar el paquete según intención/acciones,
  plataforma, squad y contrato. Lorem recibe Feature/Steps; Zorem recibe patrones
  de Screen/Locators; Sumrak solo recibe lo necesario para sus gaps de integración.
- [ ] Mantener evidencia del framework/recording como autoridad para rutas,
  métodos y selectores actuales. Un golden no autoriza copiar selectores a otro
  caso ni evita comprobar su compatibilidad. Las consultas nuevas siguen la
  política de gaps y el índice no reemplaza al resolver completo.
- [ ] Reutilizar fragmentos determinísticos solo si tienen relaciones verificables.
  Un golden con trazas pendientes sigue guardado como referencia del QA, pero
  no fabrica asociaciones para cerrar gaps automáticamente.
- [ ] Guardar diferencias y razones de corrección como lecciones por capa.
  Convertir errores recurrentes en reglas/pruebas revisadas; no publicar el
  código fallido como ejemplo positivo ni desactivar reglas globalmente.
- [ ] Poblar un corpus inicial de 5–8 casos revisados: Android/iOS, parámetros,
  aserción de texto, reutilización y actualización compartida. Mantener casos
  reservados para evaluación sin entregar sus soluciones a los agentes.
- [ ] Añadir negativos y equivalencias válidas. Corregir el helper de cobertura
  fuera de rango y completar el subconjunto de schema utilizado por el proyecto,
  con pruebas para palabras clave no soportadas. Los errores son diagnósticos,
  no un bloqueo de exportación del borrador.
- [ ] Medir primera/final respuesta autónoma, intervenciones QA, errores por
  capa/regla, timeouts, reaparición de errores, invocaciones y tiempos de pared.
  Publicar numeradores/denominadores y versiones de contexto/contratos utilizados.
- [ ] Conservar fallos en los denominadores correspondientes. Una corrección
  humana no convierte el intento previo en éxito del agente; una prueba que
  detecta un defecto real de la app no es automáticamente un fallo del generador.
- [ ] Ejecutar replay con contexto/framework fijados, verificar integridad y
  reportar corpus vacío o casos irreproducibles explícitamente. Un golden que
  discrepa del validador conserva su aprobación QA y su resultado automático;
  no se cambia su código esperado para ocultar la discrepancia.
- [ ] Realizar un piloto del ciclo completo en el recorder, incluyendo reapertura
  y el runtime del `.app`, y una comparación acotada con/sin ejemplos sobre casos
  reservados. Con pocos casos se informa el tamaño de muestra, sin prometer una
  tasa general de éxito ni imponer porcentajes no medidos.

Superficie: `automationContextProjections.ts`, `layered/projections.ts`,
`layered/prompts.ts`, resolver, catálogo de validación, `agentRunStore.ts`,
reportes de UI, suites de golden/regresión y scripts de evaluación mínimos.

Salida comprobable: una corrección QA sustituye al ejemplo anterior en un caso
compatible; una prueba detecta si el error regresa; el reporte distingue el éxito
autónomo del asistido y demuestra qué referencias recibió cada agente.

## Verificación por fase y entrega

Cada fase se implementa en cambios pequeños y revisables. Antes de cambiar un
contrato, leer los módulos afectados y actualizar las instrucciones vigentes
de `AGENTS.md`/generación para reflejar la decisión del usuario: exportación
con diagnósticos, aprobación QA y conocimiento derivado exclusivamente de golden.
No hay que solicitar otra aprobación de producto para estas decisiones acordadas.

Por fase: ejecutar pruebas focalizadas de los contratos modificados y luego
`npm run quality` cuando cambien generación, IPC o workspace. No modificar los
casos de referencia para hacer pasar una regresión. Guardar reporte con resultado
real y limitaciones; las pruebas con proveedor simulado no certifican al agente
real ni una ejecución móvil.

| Fase | Suites existentes a reutilizar y extender |
| --- | --- |
| F1 | `agentRunStore`, `memoryFragments`, `automationPackageProvenance` |
| F2 | `layeredGenerationOrchestrator`, `copilotCliAdapter`, `screenApiContract`, `rendererAgentStages` |
| F3 | `preparedAutomation`, `automationPatchWriter`, `automationPipeline`, `automationProductUx` |
| F4–F5 | `chainedGenerationWithoutCommit`, `preparedAutomation`, `automationScenarioPackage`, `goldenDataset`, más casos de recuperación/renombre/conflicto |
| F6 | `goldenDataset`, `memoryFragments`, más migración, publicación y reconstrucción del índice |
| F7 | `generationQuality`, validación por reglas, regresión determinística, golden y piloto del ciclo QA |

## Alcance de esta implementación

Se implementa el ciclo local del recorder y la procedencia opcional del PR.
Commit, push, comentarios, aprobación y merge permanecen en el flujo habitual
del QA. No se requiere un servicio nuevo de GitHub ni que cada PR esté integrado
para retomar su caso.

Un benchmark amplio de modelos, fine-tuning, una base vectorial o sincronización
centralizada entre equipos no son dependencias de estas fases. Las estimaciones
anteriores de 18–21 días no cubren este alcance; cualquier estimación de calendario
se recalcula después de F0, atendiendo especialmente a reconciliación de archivos
compartidos, migración y disponibilidad del QA para el piloto.
