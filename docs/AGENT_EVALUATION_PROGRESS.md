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
índice local reconstruible. F7 se publicó en `b05c77b`, con código y pruebas.
La continuación conecta la app al dataset compartido del recorder en `tests/golden`.
Su cierre con corpus QA y piloto real sigue abierto; el checklist en
[las fases acordadas](AGENT_EVALUATION_IMPLEMENTATION_PHASES.md) conserva todos
los pendientes hasta terminar el ciclo completo.

## Continuación: harness H0/H1 — 2026-09-09

La [estrategia H0–H5](AGENT_HARNESS_STRATEGY.md) ya tiene su primer lote de
herramientas offline. [Operación y pendientes](AGENT_HARNESS_OFFLINE.md) documenta
los comandos, límites de la evidencia y responsables. El código parte de
Recorder `ae4e68607ef76bd5f5edffb8be2eb9240d3d1173`.

| Fase | Entregado | Pendiente para cerrar |
| --- | --- | --- |
| H0 | Captura/verificación por commit, hashes, lockfiles, entorno y auditoría de los dos golden. | Dependencias compatibles; resolver nuevas capturas golden y revisión de ventas. |
| H1 | Tres casos sintéticos versionados; 10 controles negativos y tres positivos del validador real; cobertura y ausencias explícitas. | Entradas reales, precondiciones y etiquetas QA, contrapartes adicionales y reserva por familias. |
| H2 | Runner existente conservado. | Piloto con proveedor real, con/sin golden y repeticiones. |
| H3 | Regresiones conocidas convertidas en controles. | Mejoras justificadas por resultados y comparación baseline/candidata. |
| H4 | Estrategia Android local QA definida. | Adaptador funcional, entorno y recibos de ejecución. |
| H5 | Reportes offline disponibles por CLI. | CI/UI y reproducción desde otra PC. |

Verificación de este lote:

- **46/46 pruebas focalizadas**: baseline, corpus, controles y compatibilidad de
  evaluación/piloto. Cubren hashes alterados, rutas/enlaces, fuentes QA intactas,
  contraparte fallida, código equivocado, mutación vacía y cobertura incompleta.
- **Modo sintético:** 13 controles medidos: tres positivos correctos y diez
  negativos detectados por su código; cero falsos positivos/negativos y cero
  sin evaluar. Las 24 etiquetas propuestas se asocian con las diez sondas;
  esa asociación no acredita ejecución de los tres escenarios del corpus.
- **Framework fijado `09674ce8ba298f650ad116c8d1dd82c7e19e8577`:** 11 controles
  medidos (dos positivos y nueve negativos detectados), cero falsas alarmas.
  La contraparte de rango y su mutación quedan sin evaluar, exit 2: el locator
  compartido del commit difiere del fixture mínimo. El runner conserva esa
  diferencia y no sobrescribe el contexto para aprobar el control.
- **Suite completa: 1030/1031 aprobadas** en el Recorder real. Tipos y arquitectura
  pasan. `quality` conserva exit 1 por la discrepancia histórica del golden de
  ventas TC-10239; métricas y build se ejecutaron después y pasaron.
- Captura y `--verify` del baseline completadas, con fuente y compilado identificados.
  El framework exige Node >=24/npm >=11; el runtime disponible es Node 22.18.0/npm
  10.9.3. Dependencias y QA siguen pendientes; no se declara listo el piloto.
- [Resumen verificable](reports/harness-h0-h1-summary.json): huellas y resultados
  por control. Los 11 archivos pendientes del framework conservaron sus hashes.
  Los artefactos completos de ejecución quedaron fuera del repositorio.

La [auditoría golden](reports/harness-h0-golden-audit.json) conserva hash idéntico
del corpus antes/después. TC-10251 reproduce una regeneración, con baseline que
ya incluye el caso. TC-10239 mezcla plan inicial y catálogo posterior a exportar,
y `locator-provider.ts`/`redis.helper.ts` están proyectados parcialmente. Además,
su aprobación QA convive con validación técnica histórica fallida: no es un
control técnico positivo. Ninguna aprobación ni expectativa fue reescrita.

No hubo llamadas LLM ni Appium. H0/H1 están **parciales**, H2–H5 **pendientes**;
estas cifras no son una tasa de éxito de los agentes ni cierran F7. Las cifras
históricas de las secciones siguientes mantienen su contexto original.

### Seguimiento de yapeo TC-10240 — 2026-09-09

La generación `run-151a3c56-fda0-406f-8b7c-1d3bb295c3d8` terminó en una pasada,
con score técnico 100 y TypeScript del preview sin errores. Las cuatro capas
coinciden byte a byte con la exportación anterior; el plan las marca update.
La nueva corrida no registra exportación propia. El resultado funcional y la
aceptación estructurada siguen sin evaluar (`acceptanceChecks` vacío).

Pendiente: completar comparaciones del monto, teléfono ofuscado y comentario
esperados, reformular los pasos imperativos heredados y ejecutar en Android QA.
La comprobación actual del teléfono sólo afirma `¡Yapeaste!` y visibilidad de
nombre/fecha/comentario. La sugerencia `test-design-review.json` conserva las
carencias de las acciones 14 y 18; no se convierte el score en aprobación QA.
Después corresponde recuperar correcciones, revisar la versión y proponer golden
con su aprobación explícita. No se modificaron ni ejecutaron archivos del framework.

## Continuación: aceptación y evaluación — 2026-09-09

| Fase de esta continuación | Entrega | Estado |
| --- | --- | --- |
| 1. Diagnósticos e identidad | Separación de señales; TC duplicado y pérdida de cobertura; regeneración conserva decisiones de reutilización y evidencia | Implementada |
| 2. Criterios del QA | Editor en Análisis, persistencia, comprobación sobre el Feature/Step/Screen y hash de los archivos; Revalidar usa las ediciones actuales | Implementada |
| 3. Calidad del evaluador | Regresiones de 30→90 días, aserciones ausentes/inalcanzables y control de TypeLocator; runner de fallos inyectados; precisión/recall con etiquetas independientes | Implementada; interpretación del corpus histórico requiere revisar discrepancias |
| 4. Piloto repetido | Preparación/ejecución/informe de generaciones nuevas, commit/modelo/corpus fijos, brazos con/sin ejemplos y 3 o 5 repeticiones | Herramienta probada con proveedor simulado; ejecución real pendiente |

Un criterio desconocido queda sin evaluar. El perfil inicial de rango comprueba
estáticamente la aserción Android conocida del framework que valida la fecha
más antigua; cambios de helpers, otras implementaciones o iOS no reciben crédito
automático. La ejecución funcional permanece pendiente hasta disponer de su
evidencia. Una declaración QA se vincula a la revisión golden y no convierte
las correcciones humanas en éxitos autónomos.

Las métricas `agent-evaluation/v3` conservan intentos interrumpidos, numeradores,
denominadores y observaciones sin evaluar. La reutilización se mide sobre el
Feature final y métodos existentes en un baseline independiente. Las decisiones
del resolver se presentan por separado. El dataset aprobado sigue versionado en
`tests/golden`; esta entrega no modifica ni crea aprobaciones.

Pendientes del cierre experimental: ampliar y reservar casos con aprobación QA,
fijar sus criterios/etiquetas independientes, ejecutar el piloto con LLM y
registrar la ejecución en dispositivo. Todavía no hay una tasa medida que
permita afirmar cuánto mejoraron los agentes.

Guías: [criterios de aceptación](ACCEPTANCE_CRITERIA.md) y
[evaluación y piloto](AGENT_EVALUATION_PILOT.md).

Verificación local sobre el framework `09674ce8ba298f650ad116c8d1dd82c7e19e8577`:

- Suite completa: **955/956 pruebas aprobadas**. Tipos y arquitectura pasan.
  `quality` mantiene salida fallida por la discrepancia del golden de ventas
  TC-10239. También se reprodujo con el Recorder anterior
  `c739deb8d30369023cc6a34d539a5f3fe277bdcb`: su plan conserva Feature `create` y
  locators `create`, mientras su catálogo produce Feature `update` y locators
  `reuse`. La aprobación QA y los archivos esperados permanecen intactos; hace
  falta revisar la procedencia de ese snapshot antes de usarlo como oracle.
- Corregidos dos problemas de contexto revelados por la suite: Phase43 fija su
  commit histórico `57e60c58b28ad4981e9a0b20ec50563c36ff854c`, y replay v2 separa
  el control de regeneración añadido por PackageBuilder de las decisiones del
  resolver. Conserva el control en el reporte y no ignora otros gaps, rutas ni
  resoluciones. Las expectativas de los fixtures/golden no se cambiaron.
- El evaluador de fallos controlados examinó un golden reproducible: control
  válido y dos defectos inyectados detectados por su regla específica (TC
  duplicado y TypeLocator). El golden de ventas queda **sin evaluar** porque su
  snapshot de `locator-provider.ts` requiere un baseline completo. Dos defectos
  detectados no estiman la precisión general ni el éxito de los agentes.
- Las nuevas pruebas de aceptación usan un framework mínimo versionado en
  `tests/fixtures/acceptance-framework`, independiente del HEAD local. El piloto
  se verificó con proveedor simulado, preparación/compilador reales y fallos de
  integridad/pipeline; no se ejecutó Copilot ni Appium en esta entrega.
- Interfaz: pruebas automatizadas de formularios y flujo aprobadas; inspección
  visual en navegador pendiente (Chrome no pudo arrancar en el entorno restringido).

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


## Dataset compartido por Git — continuación de F7

- Desarrollo y app empaquetada usan `tests/golden` del checkout Git del recorder.
  Si no se detecta, **Casos golden → Seleccionar repositorio** permite elegirlo
  y conserva la selección local. No crea un dataset alternativo en runtime.
- Snapshots, aprobaciones y revocaciones se comparten por commit/PR del recorder;
  otros QA actualizan su rama. El índice y la selección local quedan excluidos.
  `.gitattributes` conserva bytes/hash incluso con `core.autocrlf`.
- El cambio de repositorio invalida la aprobación pendiente. Sin repositorio,
  la generación sigue entregando archivos sin ejemplos golden. Las pruebas
  verifican un commit/clone/pull real entre dos clones temporales, recepción de
  correcciones QA, integridad y revocación.
- La limpieza solicitada retiró ejecuciones antiguas y memoria legacy. Conservó
  las 7 grabaciones (76 acciones) y los cambios ajenos de configuración/dependencias
  del framework. El corpus real continúa sin aprobaciones; no se usaron fixtures
  como casos QA ni se afirma una tasa de fallos a partir de un corpus vacío.

- Validación: `npm run quality`, **825/825 pruebas aprobadas**, sin omitidas
  ni canceladas; tipos, arquitectura, métricas y builds correctos. La suite golden
  también rechaza un dataset versionado corrupto aunque no tenga entradas activas.
- App macOS reconstruida; el resolver empaquetado apunta al mismo `tests/golden`
  del checkout y los módulos empaquetados coinciden con el build verificado.
  El piloto funcional del ciclo QA continúa pendiente.

Configuración y flujo de PR: [tests/golden/README.md](../tests/golden/README.md).
Continúan abiertos el corpus de 5–8 casos, la reserva de evaluación, el piloto
funcional completo y la comparación con/sin ejemplos.

## R1–R6: reutilización por comportamiento (2026-09-09)

Implementación y alcance en [BEHAVIOR_REUSE.md](BEHAVIOR_REUSE.md). El catálogo
se actualiza con el checkout; el resolver agrupa acciones compatibles con Steps
existentes y conserva sus firmas, aserciones y dependencias. La decisión viaja
a los autores y al validador. Revisión muestra decisiones reales y conflictos
de cobertura del mismo TC. La evaluación compara con grupos independientes.

Validación contra el framework commiteado `09674ce`, en una copia aislada:

- 30 pruebas nuevas de reutilización aprobadas; 34/34 junto con casos encadenados.
- `npm run quality`: tipos y arquitectura aprobados; 908/910 pruebas aprobadas.
  El comando conserva salida fallida por dos replays preexistentes.
- `npm run quality:metrics` y `npm run build` ejecutados por separado: aprobados,
  con los umbrales vigentes y compilación de main y renderer.
- El mismo replay golden de TC-10251 (revisión `7a4b0600`) y el fixture
  `rec-7588c175` fallan también con Recorder anterior `672e5cdf`. El primero
  espera un gap de refinamiento que no reproduce el resolver inicial; el segundo
  encuentra colisiones con el contenido de main actualizado. No se modificaron
  sus snapshots ni expected. Requieren reconciliar evidencia histórica y contexto
  de replay en un cambio separado, manteniendo las aprobaciones originales.
- El piloto estático TC-10140 reutiliza cinco Steps de negocio y cubre 11/13
  acciones. Las cinco decisiones coinciden con los grupos esperados de la
  auditoría técnica: cero reutilizaciones incorrectas, perdidas o sin evaluar.
  Las dos verificaciones de fecha requieren implementación/revisión; el borrador
  presenta el conflicto de cobertura con hoy/7/15 días del escenario vigente.
- No se ejecutaron Copilot ni Appium y no se concedió aprobación golden. El QA
  debe ejecutar, recuperar las correcciones y aprobar una revisión como referencia.

La evidencia local de esta entrega está en
`/private/tmp/recorder-behavior-reuse-c4fzkswl/`: `quality-complete.log`,
`baseline-replay.log`, `options-focused.log` y `pilot-evaluation.json`. Los
reportes temporales no forman parte de los golden versionados.
