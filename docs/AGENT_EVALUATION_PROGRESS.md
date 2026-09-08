# Avance — evaluación, revisiones QA y golden

Fecha: 2026-09-08. Rama: `feature/multi-agent-generation-pipeline`.

Los planes y diagramas locales se publicaron en `64423280de47681e6fa782eb324b9e0de2006374`.
El baseline y la retirada de memoria se publicaron en `8a2a4fa0a1ec9e8ad22a4d711a930342f1782d83`.
La entrega del historial completa F1 de
[las fases acordadas](AGENT_EVALUATION_IMPLEMENTATION_PHASES.md).
F2–F7 siguen abiertas; los checklists de ese documento son la lista de pendientes
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

## Pendientes hasta completar F7

| Fase / estado | Trabajo por abordar y evidencia de cierre |
| --- | --- |
| F0 — completada | Baseline real, contexto CI fijado, comparación TAP y fixtures aislados disponibles. |
| F1 — completada | Memoria antigua fuera del consumo; historial y recibos vinculados. Falta el piloto real, compartido con F7. |
| F2 — siguiente | Un presupuesto de dos pasadas por solicitud para autores e integración, incluyendo feedback, relanzamientos y resincronización. Conservar capas recuperables ante timeout/error, validar envelopes antes de recorrerlos y abrir Revisión con diagnósticos y capas faltantes. Probar que no hay tercera pasada oculta. |
| F3 — pendiente de F2 | Permitir exportar bytes revisados y capas disponibles pese a errores de calidad. Mantener rutas, contenido compartido, conflictos, rollback y comprobaciones concurrentes. Registrar exportación con observaciones y actualizar IPC/preload/UI. Probar un borrador inválido exportado y una escritura fallida revertida. |
| F4 — pendiente de F3 | Recuperar cambios del framework con comparación baseline/exportado/actual; seguir relaciones, renombres y helpers del caso. Mostrar diff y asociaciones pendientes; guardar revisión QA sin inventar eventos Appium. Registrar PR y repo/rama/commit opcionales, incluso con cambios sin commit. |
| F5 — pendiente de F4 | Usar las correcciones recuperadas como baseline para regrabar/regenerar y reexportar el mismo caso durante y después del PR. Resolver solapamientos reales, mantener símbolos compartidos y soportar cambio de rama/rebase/merge. Probar dos ciclos sucesivos sin perder la corrección QA. |
| F6 — pendiente de F4/F5 | Guardar golden por aprobación QA explícita, con actor/fecha, diagnóstico y verificación funcional separados. Versionar por contenido, publicar de forma idempotente y verificar hashes. Construir el índice solo desde versiones aprobadas activas, retirar sustituidas y reconstruirlo sin perder autoridad. Revisar los golden antiguos sin aprobación automática. |
| F7 — pendiente de F6 | Seleccionar ejemplos compatibles por capa, conservar diferencias QA como lecciones y completar negativos/schema/cobertura. Curar 5–8 casos con QA y reservar casos sin filtrar soluciones al agente. Medir primera/final respuesta, intervención QA, fallos por capa/regla, recurrencia, timeouts, invocaciones y tiempos con denominadores y contexto. Ejecutar replay y piloto real, incluyendo reapertura y `.app`, y comparar con/sin ejemplos. |

Hoy aún existen una reparación de integración, rondas internas de feedback y
resincronización Lorem/Zorem con contadores distintos. Registrar `pass: 1/2` en
F1 no limita esas invocaciones: F2 debe sustituir los contadores independientes.
También siguen vigentes los bloqueos de exportación/regeneración por calidad
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

Implementar F2 en `layeredGenerationOrchestrator`, `layered/roles` y el adapter
de sesiones, y conectar la entrega del borrador a `agentLaunch`, importación y
Revisión. El criterio de cierre es un proveedor que falla persistentemente y
se detiene después de la segunda pasada mostrando todos los archivos recuperables.
Después abordar F3; no esperar al dataset golden para habilitar la salida al QA.
