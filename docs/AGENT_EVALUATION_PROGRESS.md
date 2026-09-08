# Avance — evaluación, revisiones QA y golden

Fecha: 2026-09-08. Rama: `feature/multi-agent-generation-pipeline`.

Los planes y diagramas locales se publicaron en `64423280de47681e6fa782eb324b9e0de2006374`.
Esta entrega inicia F0/F1 de [las fases acordadas](AGENT_EVALUATION_IMPLEMENTATION_PHASES.md).
No completa F1: falta el historial común por revisión e intento.

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

## Implementado en esta entrega

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

## Mapa de los siguientes cambios

| Punto actual | Trabajo pendiente |
| --- | --- |
| `automationRecordingStore`, `agentRunStore`, `automationPackageBuilder` | Unir recording, revisión e intento; capturar originales antes del reset/normalización. |
| `layeredGenerationOrchestrator`, `layered/roles` | Presupuesto común de dos pasadas. Hoy hay una reparación de integración, hasta dos rondas adicionales de feedback por autor y resincronización Lorem/Zorem; son contadores distintos. |
| Importación/revisión IPC y `applyAutomation` | Conservar borradores y permitir exportación con diagnósticos de calidad; mantener rutas, conflictos y transacciones. |
| `automationApplicationReceipt`, `generatedFileRegistry`, `goldenDataset` | Recuperar cambios del QA, registrar versiones, reexportar durante el PR y aprobar una revisión golden concreta. |
| Resolver y contexto de autores | Incorporar el índice reconstruible de golden aprobados y medir mejoras contra casos reservados. |

Se consultó CodeGraph para `AutomationMemory` y se inspeccionaron los puntos de
validación, aplicación, memoria, caché y reparación. El helper existente
`tests/helpers/isolatedFramework.js` y las pruebas de `preparedAutomation` dan
la base aislada; los fixtures completos del ciclo revisión/exportación/retorno
siguen pendientes junto con sus contratos, sin etiquetarlos como golden.

## Validación de esta entrega

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

## Próxima entrega

Completar F1 con contratos de revisión/intento y snapshots del original antes de
cualquier normalización o edición. Después, F2 limita las pasadas y conserva los
borradores; F3 habilita la exportación con diagnósticos. Recuperar correcciones,
seguir el PR, regenerar/reexportar y aprobar golden corresponden a F4–F7.
