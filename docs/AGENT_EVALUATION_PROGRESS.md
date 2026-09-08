# Avance — evaluación, revisiones QA y golden

Fecha: 2026-09-08. Rama: `feature/multi-agent-generation-pipeline`.

Los planes y diagramas locales se publicaron en `64423280de47681e6fa782eb324b9e0de2006374`.
El baseline y la retirada de memoria se publicaron en `8a2a4fa0a1ec9e8ad22a4d711a930342f1782d83`.
El historial se publicó en `504e7eb40eb51254af134b2bc6d09f2bbe732987` (F1).
Las dos pasadas se publicaron en `95322f1` (F2).
La exportación con observaciones se publicó en `30ae8e0` (F3).
La recuperación QA se publicó en `25d412d` (F4).
La reconciliación se publicó en `41bf2b4` (F5).
F6 se publicó en `c4f01aa`: aprobación QA explícita, versiones inmutables e
índice local reconstruible. Esta entrega implementa el código y las pruebas de
F7. Su cierre con corpus QA y piloto real sigue abierto; el checklist en
[las fases acordadas](AGENT_EVALUATION_IMPLEMENTATION_PHASES.md) conserva todos
los pendientes hasta terminar el ciclo completo.

## Punto de partida y medición

- Recorder antes del cambio funcional: `64423280de47681e6fa782eb324b9e0de2006374`.
- Framework destino: `57e60c58b28ad4981e9a0b20ec50563c36ff854c`; esa referencia real
  queda fijada en `.github/workflows/quality.yml`.
- Node `v22.18.0`, npm `10.9.3`, macOS. Los hashes de lockfiles y del estado de
  trabajo se capturan mediante `test:phase43:baseline`.
- Baseline previo: `npm run quality` completó **730 pruebas, 730 aprobadas**,
  tipos, arquitectura, métricas y builds. Log local:
  `/private/tmp/recorder-agent-f0-quality-unrestricted.log`.
- La primera ejecución en sandbox obtuvo 728/730: dos pruebas de proxy del
  inspector fallaron por `listen EPERM`. La repetición con puertos locales
  habilitados pasó completa; no se clasifican esos fallos como deuda del código.
- El framework conserva los cambios del QA en configuración, dependencias,
  Screen/Locators de movimientos y el Feature/Steps de correo. No se incluyeron
  en los commits del recorder. Los tests que usan `isolatedFramework` prueban el
  estado commiteado en una carpeta temporal, no esos cambios sin commit.

`scripts/phase43-baseline.js` captura resultados TAP reales, contexto y salida del
proceso; acepta `--baseline` para comparar capturas compatibles. Ya no contiene
una lista de nombres que declare fallos preexistentes sin evidencia. Un fallo
conocido conserva exit code fallido. Las cancelaciones, tests omitidos y nombres
ambiguos no pueden contar como correcciones confirmadas. La clasificación es
por test: la causa concreta se investiga con el log y los diagnósticos.

## Entrega inicial: baseline y retirada de memoria

- Aplicar los archivos no llama a `AutomationMemory.promote`, no emite una nueva
  `memoryVersion` y elimina esa propiedad de un estado anterior al actualizarlo.
  La UI indica que los archivos quedan pendientes de verificación del QA.
- Los lectores legacy devuelven vacío para casos, fragmentos, gaps y vocabulario.
  No reconstruyen entradas desde `cases/`; `promote` rechaza llamadas antiguas
  incluso con score 100. `golden:seed-memory` explica su retirada sin escribir.
- Al iniciar Electron, `archiveLegacyAutomationMemory` mueve las entradas
  conocidas a `runtime/automation-memory/legacy-v1/<lote>/`. Es idempotente,
  conserva bytes y revierte los movimientos ante un fallo capturado. Si no
  puede archivar, la generación continúa con las lecturas deshabilitadas.
  No modifica recordings, golden ni código del framework.
- El pipeline no recupera respuestas previas como caché ni convierte un
  `agent-response.json` existente en una respuesta de la nueva ejecución.
  El caché temporal de autores/revisión pertenece a `agents/derek/attempt-cache/`
  y se reinicia en cada `run`.
- El atajo de autores exige reutilización del framework: `wording: memory`
  legacy no lo habilita. La revisión omitida por preferencia explícita del QA
  queda identificada como `source: framework`, sin afirmar aprobación golden.

Tras F0, y hasta conectar los ejemplos en F7, los agentes siguen usando
contratos, evidencia grabada y el índice actual del framework. La generación
puede consumir más tiempo al dejar de reutilizar propuestas previas; todavía
no se midió ese coste con un agente real.

## F1 completada: historial por revisión e intento

- `AutomationHistoryStore` guarda eventos versionados y bytes por SHA-256 bajo
  `generation/automation/history/v1/`. Conserva originales inválidos o parciales,
  versiones normalizadas, diagnósticos, recibos y checkpoints antes de reemplazar
  el paquete. Limpiar o reprocesar conserva ese historial.
- Las revisiones mantienen `recordingId`/`caseId`, `revisionId` y padre. El intento
  usa el `runId` existente, enlaza el plan y registra etapas, origen y pasada
  exterior. Una nueva ejecución manual, heredada o por capas abre otro intento;
  la primera usa el intento preparado. Los gaps conservan el vínculo al padre.
- La importación conserva bytes anteriores a NFC. La edición del QA abre una
  revisión hija con `basedOnAttemptId`; su validación no convierte el fallo
  autónomo anterior en éxito. La solicitud de grabación guarda acciones
  redactadas también en `request.actions` y filas de escenarios.
- Los recibos v2 vinculan exportación y revisión, conservando lectura de v1.
  El evento exitoso se publica al finalizar la transacción. Si falla esa
  publicación, se restauran archivos, registry y metadatos del paquete.
- Generación, exportación, aprobación QA y verificación funcional son estados
  independientes. Exportar sigue sin crear aprendizaje ni afirmar ejecución móvil.
  F6 incorpora la interfaz de aprobación y declaración de ejecución QA.

Se consultó CodeGraph para `AutomationMemory` y `AgentRunStore`, además de leer
los módulos afectados. Los fixtures aislados de `preparedAutomation` cubren
borradores inválidos, cambios QA en archivos compartidos, casos ya exportados,
escritura concurrente y rollback. `automationHistoryStore` añade contenido parcial
y publicación fallida. Ninguno se promociona como golden aprobado.

Contrato de almacenamiento, compatibilidad y límites:
[AUTOMATION_HISTORY.md](AUTOMATION_HISTORY.md).

## F2 completada: dos pasadas y entrega del borrador

- La coordinación por capas usa una sola secuencia de dos pasadas. Cada rol
  participa como máximo una vez por pasada; resincronización, feedback y fallback
  de revisión de diseño comparten ese límite. No quedan rondas `feedback-N`.
- El adapter cierra la sesión con la primera entrega estable, incluso JSON
  inválido. Derek valida fuera de la sesión y dirige la única corrección disponible
  por código/archivo, conservando el esperado y observado que informa la regla.
- El fallo de un autor paralelo espera al otro. `layered-draft.json` conserva
  las capas recuperables del intento, con origen y pasada. Si una entrega posterior
  es ilegible, mantiene la anterior recuperable; puede incluir borrador determinista
  identificado. Nunca reutiliza outputs de una ejecución anterior.
- Los envelopes se comprueban antes de normalizar/recorrer, con límite de 4 MiB,
  cuatro archivos y 2000 trazas/resoluciones. Los bytes inválidos no se truncan
  para hacerlos válidos y no permiten deducir destinos.
- IPC y Revisión muestran el borrador al finalizar, aunque no exista Feature,
  junto con diagnóstico, faltantes y procedencia. El fallo no recibe un token
  de aplicación en F2 ni se convierte en éxito autónomo. F3 agrega preparación de exportación independiente.

Alcance y contrato: [AGENT_TWO_PASS_GENERATION.md](AGENT_TWO_PASS_GENERATION.md).
El pipeline heredado de diagnóstico conserva su protocolo de queries; la entrega
corresponde al pipeline `layered` predeterminado del wizard.

## Pendientes hasta completar F7

| Fase / estado | Trabajo por abordar y evidencia de cierre |
| --- | --- |
| F0 — completada | Baseline real, contexto CI fijado, comparación TAP y fixtures aislados disponibles. |
| F1 — completada | Memoria antigua fuera del consumo; historial y recibos vinculados. Falta el piloto real, compartido con F7. |
| F2 — completada | Dos pasadas comunes en layered, envelopes comprobados y Revisión de capas recuperables. Pruebas sin tercera llamada por rol, incluso con resincronización y fallos persistentes. |
| F3 — completada | Exportación de bytes revisados y capas disponibles con observaciones. Se conservan rutas, contenido compartido, conflictos, rollback y comprobaciones concurrentes. Recibo parcial con hashes/símbolos, historial separado y botón disponible sin score 100. |
| F4 — completada | Recuperación por relaciones, comparación baseline/exportado/actual y diff del caso. Rutas/símbolos movidos, helpers, asociaciones pendientes y revisión QA con código sin modificar eventos Appium. PR opcional y contexto Git local; no exige commit ni dispositivo. |
| F5 — completada | Usar las correcciones recuperadas como baseline para regrabar/regenerar y reexportar el mismo caso durante y después del PR. Resolver solapamientos reales, mantener símbolos compartidos y soportar cambio de rama/rebase/merge. Probar dos ciclos sucesivos sin perder la corrección QA. |
| F6 — completada | Guardar golden por aprobación QA explícita, con actor/fecha, diagnóstico y verificación funcional separados. Versionar por contenido, publicar de forma idempotente y verificar hashes. Construir el índice solo desde versiones aprobadas activas, retirar sustituidas y reconstruirlo sin perder autoridad. Revisar los golden antiguos sin aprobación automática. |
| F7 — código implementado; validación real pendiente | Selección por capa, lecciones, fragmentos verificados, negativos/schema/cobertura, métricas y replay implementados. Faltan 5–8 casos revisados por QA, casos reservados y el piloto real con/sin ejemplos, incluyendo reapertura y `.app`. No hay aún una tasa medida de mejora. |

F2 sustituyó los contadores independientes del pipeline por capas.
F3 retira los bloqueos de exportación por calidad. Los ciclos de regeneración y
reexportación con correcciones externas están implementados en F5; F4 conserva esas correcciones en una revisión QA.

## Validación de la entrega inicial (`8a2a4fa`)

- Pruebas focalizadas: 133/133, incluyendo los contratos modificados.
- Migración extraída a infraestructura: 4/4 pruebas de archivo y rollback;
  comprobación de arquitectura sin violaciones.
- `npm run quality`: **737/737 pruebas**, sin fallos ni tests omitidos; tipos,
  arquitectura, métricas y build de Electron/React aprobados. Log local:
  `/private/tmp/recorder-agent-f1-quality.log`.
- Captura estructurada con `test:phase43:baseline`: 737/737, corrida completa;
  primera captura sin baseline previo, sin atribuciones inventadas.
  [Reporte versionado](evaluation/baseline-2026-09-08.json), con contexto y
  resultados por test para futuras comparaciones en un entorno compatible.
- Segunda corrida contra esa captura: `comparison: comparable`, 737/737,
  cero fallos. Log local `/private/tmp/recorder-agent-f1-baseline-compare.log`.

La validación usa proveedores de agente simulados. No se ejecutó un caso en un
dispositivo ni se verificó una corrida real de Copilot o CI remoto.

## Validación del historial

- Pruebas focalizadas de historial y orquestación heredada: **26/26**, incluyendo
  revisiones, relanzamientos y conservación de entregas por gap.
- `npm run quality`: **747/747 pruebas**, cero fallos, cancelaciones u omisiones;
  tipos, arquitectura sin ciclos/violaciones, métricas y builds de Electron/React
  aprobados. Log local: `/private/tmp/recorder-f1-history-quality.log`.
- Pruebas de integración del historial: originales previos a normalización,
  limpieza conservando evidencia, corrección QA sin reclasificar el fallo y
  rollback si no se puede registrar la exportación.
- Una corrida completa detectó diferencias `/var` y `/private/var` en macOS.
  Se corrigió la comparación con rutas canónicas y se añadió regresión que sigue
  rechazando enlaces hacia archivos fuera del paquete.

Estos resultados no certifican que el agente real genere cuatro capas correctas
ni eliminan los fallos. El corpus aprobado y la medición de ese efecto corresponden
a F7; F6 implementa su almacenamiento. No se ejecutó todavía el piloto con dispositivo/Copilot.

## Próxima entrega concreta

Cerrar F7 con QA: curar 5–8 casos y reservar entradas de evaluación; ejecutar
replay y piloto real con/sin ejemplos, incluyendo reapertura y runtime `.app`.
La infraestructura está implementada; estos puntos de evidencia siguen abiertos.

## Validación de F2

- Pruebas focalizadas: **92/92**, antes de añadir el caso de importación parcial.
- Cierre focalizado: **54/54** de orquestación y **4/4** de recuperación/IPC/editor,
  incluida la dependencia de Zorem cuando Lorem se recupera y la limpieza de una
  revisión vacía para no mostrar código del intento anterior.
- `npm run quality`: **757/757 pruebas**, cero fallos, cancelaciones u omisiones;
  tipos, arquitectura sin ciclos/violaciones, métricas y builds aprobados.
  Log local: `/private/tmp/recorder-f2-quality.log`.
- La primera corrida completa detectó que la comprobación nueva se había colocado
  también en un helper de normalización que acepta entradas parciales. Se mantuvo
  ese helper compatible y la comprobación quedó en las entradas de proveedor,
  caché del intento e importador, antes del recorrido de campos.
- Se sustituyeron las pruebas que exigían rondas adicionales por los contratos
  acordados de dos pasadas; no se cambiaron golden ni se omitieron regresiones.
- Los proveedores, IPC y DOM están simulados. No se ejecutó Copilot real, un caso
  móvil ni el runtime empaquetado del `.app`; ese piloto permanece en F7.

## Implementación de F3

- Exportación independiente de validación en importación normal y recuperación F2,
  incluido un Screen sin Feature. Revalidar un borrador no necesita una respuesta
  completa del agente.
- Escritura de bytes revisados con observaciones, recibo del conjunto real con
  hashes previos/exportados, símbolos propios, faltantes y diagnóstico.
- Historial y resultado del intento conservados; la exportación tiene su propio
  resultado y no acredita aprobación QA, verificación funcional ni memoria.
- Contrato y límites: [AUTOMATION_DRAFT_EXPORT.md](AUTOMATION_DRAFT_EXPORT.md).
- Pruebas focalizadas: **68/68**. Log: `/private/tmp/recorder-f3-focused.log`.
- `npm run quality`: **765/765**, cero fallos, cancelaciones u omisiones;
  tipos, arquitectura, métricas y builds correctos. Log: `/private/tmp/recorder-f3-quality.log`.
- El framework padre conserva sus cambios locales. No se ejecutó el piloto con
  dispositivo/Copilot ni la reapertura del `.app`; siguen pendientes en F7.

## Implementación de F4

- Recuperación accesible desde Configuración sin dispositivo, Revisión y selector
  de grabaciones existentes. Comparación de baseline/exportado/actual, con cambios
  propios y ajenos diferenciados.
- Relaciones Gherkin/Examples, Steps, métodos, locators y helpers. Rutas movidas por
  referencias de código, incluso sin conservar sufijos; asociaciones manuales y
  pendientes guardables sin inventar eventos Appium.
- Revisión `framework-import` con usuario/fecha, código QA, PR opcional y estado
  local de repo/rama/commit. Mantiene el fallo original y no aprueba golden/memoria.
- Token, hashes, límites de lectura y rollback de la vista mutable si falla el
  evento. El framework solo se lee; sus cambios locales se conservan.
- Contrato: [AUTOMATION_FRAMEWORK_RECOVERY.md](AUTOMATION_FRAMEWORK_RECOVERY.md).
- Pruebas focalizadas: **71/71**. Log: `/private/tmp/recorder-f4-focused.log`.
- `npm run quality`: **784/784 pruebas aprobadas**, sin omitidas ni canceladas;
  tipos, arquitectura, métricas y builds correctos. Log:
  `/private/tmp/recorder-f4-quality.log`.

## Implementación de F5

- Preparación desde código actual del framework, con revisión QA, identidad y
  rutas vigentes. Regrabación vuelve a resolver las acciones actuales.
- Baseline inmutable y contexto por autor; no hereda una entrega del intento
  anterior ni exige score 100 o cuatro capas ya exportadas.
- Combinación de tres versiones, conflictos visibles y resolución en el editor.
  Conserva métodos/locators compartidos y valida cambios concurrentes del checkout.
- Dos ciclos sucesivos probados, también con rutas movidas y rebase/merge reales
  en repositorios temporales. Exportación parcial y rollback siguen disponibles.
- Nueva cobertura F5: **12/12 pruebas aprobadas**. Log: `/private/tmp/recorder-f5-new.log`.
- `npm run quality`: **796/796 pruebas aprobadas**, sin omitidas ni canceladas;
  tipos, arquitectura, métricas y builds correctos. Log:
  `/private/tmp/recorder-f5-quality.log`.
- Contrato: [AUTOMATION_RECONCILIATION.md](AUTOMATION_RECONCILIATION.md).

## Implementación de F6

- Aprobación QA explícita desde la revisión, recuperación F4 y biblioteca sin
  dispositivo. No exige score/PR/ejecución ni escribe en el framework al aprobar.
- Snapshot por contenido/contexto, actor/fecha, hashes, entregas originales,
  dependencias, PR, diagnósticos y comparaciones antes/después del QA.
- Publicación inmutable idempotente; sustitución y revocación de referencias;
  índice descartable, verificado y reconstruible. Recuperación ante fallo de
  publicación y aviso si falla una proyección posterior al commit.
- Legacy requiere nueva revisión y aprobación. Estadísticas y comando de
  reconstrucción leen únicamente publicaciones activas; memoria legacy sigue vacía.
- Contrato: [AUTOMATION_GOLDEN_APPROVAL.md](AUTOMATION_GOLDEN_APPROVAL.md).
- `npm run quality`: **808/808 pruebas aprobadas**, sin omitidas ni canceladas;
  tipos, arquitectura, métricas y builds correctos. Log:
  `/private/tmp/recorder-f6-quality.log`.
- Las pruebas usan frameworks aislados y un DOM de prueba. No se ejecutó el
  piloto con dispositivo/Copilot ni la reapertura de `.app`; siguen en F7.
- Al cerrar F6 quedaban corpus, ejemplos por rol, medición y piloto para F7.
  La entrega descrita a continuación implementa ejemplos y medición.


## Implementación técnica de F7

- Avisos de presupuesto retirados de la UI; telemetría, evidencia completa y
  errores reales conservados.
- Selección de publicaciones QA compatibles por intención/acciones y scope.
  Proyecciones por rol, lecciones desde correcciones, reserva de evaluación,
  exclusión del propio caso y procedencia de las referencias efectivamente usadas.
- Fragmentos automáticos solo con relaciones/trazas preservadas, datos exactos
  y definición única del framework. Memoria legacy y decisiones de gap antiguas
  permanecen deshabilitadas.
- Negativos/equivalencias de schema y cobertura fuera de rango. Denominadores,
  primera/final pasada, QA, timeouts, recurrencia, capas/reglas, invocaciones,
  contexto/modelos y tiempos desde artefactos inmutables.
- Replay en commit local fijado con baselines explícitos: detecta discrepancia,
  irreproducibilidad y corrupción sin modificar los esperados.
- Chequeo sobre datos locales: **0 golden aprobados, 7 intentos legacy sin evidencia
  suficiente**. `agents:evaluate` y `golden:replay` devolvieron código 2 y estado
  `not-evaluated`. No equivale a 0 % de fallos ni certifica mejora.
- Reportes locales: `/private/tmp/recorder-f7-evaluation.json` y
  `/private/tmp/recorder-f7-replay.json`. Son datos observados; los casos sintéticos
  de las pruebas no se promocionaron al corpus real.
- `npm run quality`: **816/816 pruebas aprobadas**, sin omitidas ni canceladas;
  tipos, arquitectura, métricas y builds correctos. Log:
  `/private/tmp/recorder-f7-quality.log`. La prueba de replay fijado conserva
  la discrepancia de un fixture inválido y no altera los archivos aprobados.
- Cierre pendiente: corpus 5–8 QA, reserva, replay del corpus real y piloto de
  dos pasadas/corrección/PR/recuperación/regeneración/reexportación, reapertura y
  runtime `.app`; comparación controlada con/sin ejemplos.

Contrato y procedimiento: [AUTOMATION_GOLDEN_LEARNING.md](AUTOMATION_GOLDEN_LEARNING.md).
