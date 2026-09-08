# Avance — evaluación, revisiones QA y golden

Fecha: 2026-09-08. Rama: `feature/multi-agent-generation-pipeline`.

Los planes y diagramas locales se publicaron en `64423280de47681e6fa782eb324b9e0de2006374`.
El baseline y la retirada de memoria se publicaron en `8a2a4fa0a1ec9e8ad22a4d711a930342f1782d83`.
El historial se publicó en `504e7eb40eb51254af134b2bc6d09f2bbe732987` (F1).
La entrega actual completa F2 del pipeline por capas de
[las fases acordadas](AGENT_EVALUATION_IMPLEMENTATION_PHASES.md).
F3–F7 siguen abiertas; los checklists de ese documento son la lista de pendientes
hasta terminar el ciclo completo. La aprobación golden nueva aún no está habilitada.

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

Con el índice golden todavía sin implementar, los agentes siguen usando
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
  La interfaz que declarará aprobación/verificación se implementa en F6.

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
  de aplicación ni se convierte en éxito autónomo. F3 habilitará la exportación.

Alcance y contrato: [AGENT_TWO_PASS_GENERATION.md](AGENT_TWO_PASS_GENERATION.md).
El pipeline heredado de diagnóstico conserva su protocolo de queries; la entrega
corresponde al pipeline `layered` predeterminado del wizard.

## Pendientes hasta completar F7

| Fase / estado | Trabajo por abordar y evidencia de cierre |
| --- | --- |
| F0 — completada | Baseline real, contexto CI fijado, comparación TAP y fixtures aislados disponibles. |
| F1 — completada | Memoria antigua fuera del consumo; historial y recibos vinculados. Falta el piloto real, compartido con F7. |
| F2 — completada | Dos pasadas comunes en layered, envelopes comprobados y Revisión de capas recuperables. Pruebas sin tercera llamada por rol, incluso con resincronización y fallos persistentes. |
| F3 — siguiente | Permitir exportar bytes revisados y capas disponibles pese a errores de calidad. Mantener rutas, contenido compartido, conflictos, rollback y comprobaciones concurrentes. Registrar exportación con observaciones y actualizar IPC/preload/UI. Probar un borrador inválido exportado y una escritura fallida revertida. |
| F4 — pendiente de F3 | Recuperar cambios del framework con comparación baseline/exportado/actual; seguir relaciones, renombres y helpers del caso. Mostrar diff y asociaciones pendientes; guardar revisión QA sin inventar eventos Appium. Registrar PR y repo/rama/commit opcionales, incluso con cambios sin commit. |
| F5 — pendiente de F4 | Usar las correcciones recuperadas como baseline para regrabar/regenerar y reexportar el mismo caso durante y después del PR. Resolver solapamientos reales, mantener símbolos compartidos y soportar cambio de rama/rebase/merge. Probar dos ciclos sucesivos sin perder la corrección QA. |
| F6 — pendiente de F4/F5 | Guardar golden por aprobación QA explícita, con actor/fecha, diagnóstico y verificación funcional separados. Versionar por contenido, publicar de forma idempotente y verificar hashes. Construir el índice solo desde versiones aprobadas activas, retirar sustituidas y reconstruirlo sin perder autoridad. Revisar los golden antiguos sin aprobación automática. |
| F7 — pendiente de F6 | Seleccionar ejemplos compatibles por capa, conservar diferencias QA como lecciones y completar negativos/schema/cobertura. Curar 5–8 casos con QA y reservar casos sin filtrar soluciones al agente. Medir primera/final respuesta, intervención QA, fallos por capa/regla, recurrencia, timeouts, invocaciones y tiempos con denominadores y contexto. Ejecutar replay y piloto real, incluyendo reapertura y `.app`, y comparar con/sin ejemplos. |

F2 sustituyó los contadores independientes del pipeline por capas.
Siguen vigentes los bloqueos de exportación/regeneración por calidad
en el código actual; F3 y F5 los cambiarán según lo acordado.

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
a F6/F7; no se ejecutó todavía el piloto con dispositivo/Copilot.

## Próxima entrega concreta

Implementar F3 en preparación/aplicación, IPC y Revisión. Separar diagnóstico de
calidad de autorización de escritura; convertir el borrador revisado en un conjunto
de archivos exportables con rutas del caso y transacción. Conservar las comprobaciones
concurrentes, contenido compartido y rollback. El criterio de cierre es exportar un
borrador con error semántico sin perder su diagnóstico, y revertir todas las escrituras
ante un fallo. No esperar al dataset golden para habilitar la salida al QA.

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
