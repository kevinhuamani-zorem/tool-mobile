# Historial de automatización — F1

Cada grabación conserva sus versiones bajo
`generation/automation/history/v1/`. Este archivo describe el contrato implementado;
los pasos de producto posteriores siguen en
[las fases](AGENT_EVALUATION_IMPLEMENTATION_PHASES.md).

## Identidad

- `recordingId` y `caseId` identifican el mismo caso. El historial rechaza
  mezclar grabaciones o sustituir un caseId conocido.
- `revisionId` identifica una revisión; `parentRevisionId` apunta a su origen.
  Fuentes: recording, regeneración, edición QA, recuperación del framework y
  legacy. `framework-import` queda disponible para F4.
- `attemptId` **es el `runId` de AgentRunStore**. No se crea un contador paralelo
  de ejecuciones. `attempt-planned` añade el plan cuando termina el resolver.
  La primera ejecución consume el intento preparado; volver a ejecutar abre
  otro intento de la misma revisión, tanto por capas como en modo manual o
  heredado. Los subprocesos por gap pertenecen al intento del padre.
- Una edición humana crea una revisión sin simular otra llamada al agente.
  `basedOnAttemptId` conserva el intento del que procede.
- Los recibos v2 añaden `exportId`, revisión y procedencia del intento a los
  hashes de aplicación. Se aceptan los v1 existentes sin inventar una revisión
  retrospectiva. El constructor sin identidad conserva el formato v1 para esos
  consumidores; la aplicación del recorder pasa la identidad actual.

## Almacenamiento y lectura

`blobs/<sha256>` contiene bytes originales, también JSON incompleto o inválido.
`events/<secuencia>-<sha256>.json` contiene identidad, origen, fecha, etapa,
resultado y referencias por nombre lógico, hash y tamaño. El nombre lógico de
un artefacto nunca se usa como destino de escritura.

La publicación escribe un temporal y crea un enlace atómico al nombre final,
sin reemplazar contenido existente. Los temporales incompletos no son eventos.
Al leer se comprueban los hashes de eventos y artefactos; se rechazan enlaces
simbólicos en los destinos de historial. Un blob sin evento, tras un fallo de
publicación, no es una versión activa. Los checkpoints agrupan sus archivos en
un evento para evitar releer el índice por cada archivo.

Es un archivo local persistente. El rollback de una exportación cubre
excepciones del proceso; no representa una transacción distribuida ni garantiza
recuperación del framework ante un apagado entre escrituras.

## Puntos de captura

1. Preparar: conserva el paquete anterior antes de resetear, crea la revisión
   del escenario de entrada y abre el intento. Un fallo del resolver mantiene
   la evidencia anterior, sin dejarla disponible como respuesta vigente.
2. Editar la grabación: antes de sustituir acciones de un caso ya preparado,
   conserva acciones, manifest y escenario. La solicitud guardada usa las
   acciones redactadas para no duplicar credenciales en `request.actions`.
3. Autores: guarda lo entregado antes de la normalización mecánica y antes de
   sustituir salidas de feedback. Registra etapa y pasada exterior 1/2.
   **F2 todavía debe unificar los límites de feedback y resincronización**;
   registrar una pasada no implica que ese presupuesto ya esté aplicado.
4. Integración: conserva propuesta y ensamblado; guarda el reporte de resultado
   vinculado al intento y un checkpoint del paquete terminado/fallido.
5. Importación: captura bytes antes de leer/normalizar NFC, la versión
   normalizada y la preparada junto con sus diagnósticos. Una corrección QA crea
   una revisión y un `qa-validation-result`, no un éxito autónomo nuevo.
6. Aplicación: registra el recibo, respuesta exacta y validación como última
   operación fallible del commit. Si no puede publicar el evento, revierte los
   archivos y metadatos de aplicación. Un fallo no publica un evento `exported`.
7. Guardado golden actual: conserva la revisión QA antes de reemplazar metadatos.
   La publicación golden versionada y su aprobación explícita se completarán
   en F6; este hook no activa aprendizaje ni promociona memoria.

Los checkpoints conservan JSON, TypeScript, Features y Markdown disponibles;
no siguen enlaces ni duplican `history/`. Las entregas por gap se capturan en
el paquete padre y `history/` no se copia a esos workspaces. Los archivos de
log o evidencia visual originales mantienen sus ubicaciones existentes.

## Estados independientes

`lifecycle()` deriva cuatro estados sin usar el score como aprobación:

| Dimensión | Estados |
| --- | --- |
| Generación | no iniciada, en ejecución, aprobada por validación, fallida, desconocida |
| Exportación | no exportada, exportada, fallida |
| Aprobación QA | pendiente, aprobada, revocada |
| Verificación funcional | no reportada, pasó, falló |

Exportar no modifica las otras dimensiones. Una validación de cambios humanos
no reescribe el resultado del intento original. La API de eventos admite la
aprobación/verificación explícitas; la integración del flujo golden se completa
en F6. No se infiere ejecución móvil de una validación estática.

Los campos heredados de `agent-run.json` y `status.json` siguen siendo vistas
mutables para la UI existente. Las capturas de terminal y los eventos de
resultado conservan el estado anterior aunque aplicar actualice esas vistas.

## Mantenimiento

No borrar `history/` para reprocesar ni usarlo como caché de conocimiento. Una
limpieza explícita del paquete solo reinicia derivados. Las pruebas cubren
reapertura, bytes previos a NFC, revisión hija, vínculos al intento, recibos v1/v2,
contenido alterado, enlaces, publicación interrumpida y rollback de aplicación.
