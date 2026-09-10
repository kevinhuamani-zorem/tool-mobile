# Estrategia del harness de agentes del Recorder

Fecha: 2026-09-09. Estado: **H0/H1 iniciadas; herramientas offline implementadas. Cierre QA/entorno y H2–H5 pendientes**.
Referencia inspeccionada: Recorder `ae4e68607ef76bd5f5edffb8be2eb9240d3d1173`.

Esta continuación organiza el trabajo pendiente de F7 y de evaluación. Conserva
las entregas F0–F7 existentes; los identificadores H0–H5 permiten seguir esta
estrategia sin reiniciar ni renumerar aquellas fases.

## Objetivo y punto de partida

Conseguir que la generación de las cuatro capas tenga contexto comprobable,
contratos verificables, correcciones acotadas y resultados medidos. El harness
de ejecución coordina al modelo y sus herramientas; el harness de evaluación
repite tareas, comprueba los resultados y permite comparar cambios. Esta
separación corresponde al concepto descrito por [Anthropic](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

El Recorder ya implementa gran parte de ambos. La prioridad es operarlos con
casos representativos, corregir sus brechas a partir de evidencia e incorporar
la ejecución funcional del código generado.

| Capacidad | Estado comprobado | Acción de esta estrategia |
| --- | --- | --- |
| Recording, plan determinista, catálogo y recuperación golden | Implementada | Fijar entradas y procedencia en cada evaluación. |
| Derek, Lorem, Zorem y Sumrak; contratos de cuatro capas | Implementada | Medir resultados por rol y respetar interfaces existentes. |
| Dos pasadas y borradores recuperables | Implementada | Mantener la política en app y evaluadores. |
| Corrección mecánica de TypeLocator, validación y compilación de archivos preparados | Implementada | Medir por separado entrega del modelo y resultado corregido por Recorder. |
| Historial, hashes, recuperación QA, PR y nuevas versiones golden | Implementada | Enlazar evidencia funcional y mantener atribución por revisión. |
| Piloto repetido con/sin golden | Runner implementado; comprobado con proveedor simulado | Ejecutar campañas con el modelo real y publicar resultados comparables. |
| Replay, evaluación de reutilización y defectos controlados | Implementada con alcance acotado | Ampliar corpus y comprobar al evaluador con etiquetas QA independientes. |
| Ejecución automática en dispositivo dentro de la evaluación | Pendiente | Añadir un adaptador funcional, inicialmente para una matriz concreta. |
| CI de software | Implementada | Integrar informes de evaluación y comparación de regresiones. |

Como referencia previa, la verificación del cambio de Gherkin obtuvo **1005/1006 pruebas de
software aprobadas**, tipos, arquitectura, métricas y empaquetado correctos. El
fallo restante es la discrepancia del golden TC-10239 frente al plan reproducido.
Esta cifra no mide el éxito del LLM. El estado previo y la procedencia de la
discrepancia están en [AGENT_EVALUATION_PROGRESS.md](AGENT_EVALUATION_PROGRESS.md).

## Invariantes del producto

- Máximo de dos pasadas automáticas de generación: inicial y una corrección.
  Los controles mecánicos no añaden sesiones de agente ni rondas encubiertas.
- El QA recibe las capas disponibles al terminar y puede exportar el borrador
  con diagnósticos. El score, las evaluaciones y la ejecución funcional no
  añaden requisitos a esa exportación; permanecen los controles de escritura.
- Los steps reutilizados, las rutas, la identidad de selector y las decisiones
  fijadas por QA mantienen su autoridad. Los agentes resuelven los gaps permitidos.
- Cada comprobación corresponde a los archivos preparados para exportar,
  identificados por hash. Una edición abre otra revisión e invalida la vigencia
  del resultado anterior sobre la nueva versión, conservando su historial.
- QA puede corregir en el framework, enviar PR, recuperar, regrabar, regenerar
  y reexportar. La corrección humana conserva su autoría y no cambia el resultado
  autónomo del intento original.
- Sólo una aprobación QA explícita publica una nueva versión golden. Pasar
  pruebas, exportar o fusionar un PR no sustituye esa aprobación.
- Los golden compartidos permanecen en `tests/golden` del Recorder. La memoria
  legacy sigue deshabilitada. El corpus reservado no llega a los agentes.
- Los costes y tiempos se miden; la evidencia necesaria no se recorta para
  satisfacer un presupuesto. Se mantienen los controles operativos existentes.

## Fases y dependencias

| Fase | Entregable principal | Dependencia | Responsable propuesto |
| --- | --- | --- | --- |
| H0 | Baseline reproducible y registro de discrepancias | — | Desarrollo + QA propietario del caso |
| H1 | Corpus versionado y contratos de evaluación comprobados | H0 | QA de cada flujo + desarrollo |
| H2 | Informe del primer piloto con agente real | H1 | Desarrollo; QA revisa las etiquetas y resultados |
| H3 | Mejoras del harness demostradas mediante comparación | H2 | Desarrollo + QA |
| H4 | Ejecución funcional aislada y recibo de evidencia | H1; requiere entorno preparado | QA mobile + desarrollo |
| H5 | Informes visibles, regresión en CI y ciclo de mantenimiento | H2; incorpora H3/H4 cuando estén disponibles | Desarrollo + equipo QA |

H4 puede preparar su entorno mientras se ejecuta H2. H5 puede incorporar los
controles offline después de H1; su cierre funcional depende de H4.

### H0 — Fijar una base reproducible

**Trabajo:**

- [x] Registrar commit del Recorder, commit del framework, lockfiles, versiones
  de herramientas y configuración utilizada. Separar checkout exportado de
  baseline anterior a generar; una exportación previa no acredita reutilización.
- [ ] Preparar checkouts y dependencias reproducibles. El piloto actual no
  instala las dependencias del target: verificar su disponibilidad antes del
  experimento para evitar campañas enteras sin compilación evaluable.
- [x] Revisar procedencia del golden TC-10239: catálogo capturado, baseline,
  operaciones create/update y versiones aprobadas. Conservar sus bytes y
  expectativas históricas; cualquier nueva publicación requiere revisión QA.
- [x] Mantener un registro explícito de casos reproducibles, discrepantes y sin
  evidencia suficiente. Los no evaluables permanecen visibles en el informe.
- [x] Separar la referencia histórica de CI de la referencia del nuevo piloto.
  Actualizar una referencia exige su evidencia; no sustituir silenciosamente
  el commit fijado por `main`.

**Avance:** `harness:baseline` congela el commit y corpus con hashes, registra
el entorno y deja visibles los requisitos pendientes. La procedencia de ambos
golden está auditada; los snapshots aprobados permanecen intactos. Preparar e
instalar dependencias compatibles y cerrar la revisión QA sigue pendiente.
Ver [operación y evidencia H0/H1](AGENT_HARNESS_OFFLINE.md).

**Entrega:** manifiesto del baseline y matriz de compatibilidad por caso.
**Cierre:** los casos seleccionados reproducen sus entradas y precondiciones;
las exclusiones/discrepancias tienen causa y responsable. El golden problemático
puede seguir pendiente sin impedir trabajar con otros casos válidos, pero no
se interpreta como control positivo ni se declara verde una puerta que falla.

### H1 — Construir un corpus que reproduzca nuestros fallos

**Trabajo:**

- [ ] Empezar con ventas, movimientos y yapeo, usando variantes revisadas por
  QA. Cubrir reutilización, creación, ampliación de módulos compartidos y
  regeneración después de cambios del framework.
- [ ] Para cada caso fijar objetivo, verificaciones, criterios críticos,
  precondiciones de datos, usuario válido y fijo del squad, plataforma, baseline
  y etiquetas de reutilización
  revisadas por QA con independencia del resolver.
- [x] Añadir controles negativos: TypeLocator cambiado, selector inventado,
  usuario inexistente, step duplicado, método reutilizado con efecto diferente,
  rango 30→90, aserción omitida y Gherkin mecánico.
- [ ] Añadir una contraparte válida a cada defecto: selección de destinatario,
  mensaje citado, helper equivalente y step heredado literal, por ejemplo.
  Detectar más errores no debe convertir casos correctos en falsos positivos.
- [x] Usar los runners existentes. Las mutaciones no soportadas quedan
  explícitas; ampliar sólo los adaptadores/fixtures necesarios para cubrirlas.
- [ ] Reservar casos y variantes cercanas por familia de comportamiento. La
  exclusión automática actual de TC/recording propio y golden reservado se
  complementa con revisión QA de duplicados semánticos entre familias.

**Avance:** tres escenarios sintéticos versionados y controles independientes
sobre el validador real. Las etiquetas son propuestas, la asociación por familia
no ejecuta esos escenarios y `pilotEligible` continúa en `false`. Revisar las
variantes reales con QA, sus contrapartes y reservar familias permanece abierto.

**Almacenamiento:** especificaciones/etiquetas y fixtures en
`tests/fixtures/agent-harness`, controles adicionales en tests y referencias
aprobadas en `tests/golden`. Los defectos inyectados son fixtures de evaluación,
no casos golden positivos. Las rutas de equipo y datos de sesión se resuelven
localmente; el corpus compartido no depende de rutas absolutas de una PC.

**Entrega:** catálogo de casos con etiquetas, controles positivos/negativos y
matriz de cobertura. **Cierre:** cada defecto soportado se detecta por su regla
esperada y su contraparte válida pasa; lo no soportado conserva estado explícito.
Esta es cobertura de regresión del corpus, no precisión general del agente.

### H2 — Medir al generador con el piloto existente

**Trabajo:**

- [ ] Preparar el protocolo de `agents:pilot` con commit, modelo explícito,
  hash del código, corpus, referencias y 3 repeticiones por caso y brazo.
  El runner también admite 5 repeticiones para ampliar un experimento.
- [ ] Ejecutar los dos brazos existentes: con y sin golden. Tres casos con
  tres repeticiones por brazo programan **18 generaciones**; cada una conserva
  su propio máximo de dos pasadas. Es un piloto exploratorio.
- [ ] Comprobar versión del proveedor/modelo realmente reportado, dependencias
  y acceso al entorno. Una llamada no realizada no es evidencia del modelo.
- [ ] Conservar respuesta original, normalizaciones del Recorder, ambas
  pasadas, diagnósticos, archivos preparados, compilación y resultado final.
- [ ] Revisar una muestra de salidas con QA usando la misma rúbrica, también
  las que pasan automáticamente. No ajustar etiquetas para favorecer un brazo.
- [ ] Publicar resultados por caso, por rol y agregados, con errores de entorno,
  interrupciones, casos sin evaluación y versiones de golden realmente usadas.

**Entrega:** manifest e informe del piloto, con lista priorizada de fallos y
muestra QA. **Cierre:** todas las generaciones programadas tienen un resultado
o una ausencia explicada. Hay evidencia del proveedor real; los resultados de
mocks sólo acreditan el funcionamiento del runner.

Este experimento mide el efecto de los ejemplos manteniendo constante el
harness. Para medir una versión nueva del harness, H3 usa dos protocolos,
uno por versión, con el resto fijado. Cambiar modelo es otro experimento.

### H3 — Mejorar el harness según los fallos medidos

**Trabajo:**

- [ ] Ordenar fallos por frecuencia, impacto y esfuerzo QA; distinguir defecto
  del agente, del resolver, del evaluador y del entorno.
- [ ] Reproducir cada fallo elegido antes de cambiar prompts o código.
- [ ] Para reglas mecánicas, extender componentes deterministas existentes
  cuando el contrato y la evidencia permitan una solución inequívoca. Mantener
  el diagnóstico si la corrección exige inventar comportamiento o selectores.
- [ ] Para problemas semánticos, mejorar el contexto del rol responsable,
  ejemplos pertinentes y feedback esperado/observado. Conservar trazas,
  parámetros, interfaces y los steps reutilizados.
- [ ] Revisar también falsas alarmas. Un evaluador que sólo comprueba estilo
  no acredita que el Gherkin describa fielmente el objetivo de negocio; QA
  juzga intención, claridad y correspondencia con las verificaciones.
- [ ] Comparar baseline y candidata mediante protocolos separados del piloto:
  mismos casos, framework, modelo, referencias y repeticiones; variar únicamente
  el cambio del harness. Alternar su ejecución cuando el proveedor lo permita
  y registrar fechas/versiones para reconocer cambios externos.

**Entrega:** PR acotado con regresión, comparación y efectos secundarios.
**Cierre:** los controles críticos conocidos pasan, no aparece pérdida de
cobertura y el informe muestra el efecto observado. Si la mejora es incierta,
se reporta así; se amplía la muestra o se revisa el cambio antes de atribuirle
una mejora del agente. El ensayo pequeño no demuestra cero fallos futuros.

### H4 — Ejecutar los archivos generados en mobile

**Trabajo:**

- [ ] Definir el adaptador funcional sobre el runner real del framework:
  selección inequívoca del caso, configuración, preparación, ejecución y lectura
  del resultado. Mantenerlo separado de la sesión de grabación.
- [ ] Empezar con Android local, ambiente QA, un dispositivo, un TC de consulta
  de movimientos y una fila de Examples. Fijar app/build, OS y usuario. Ampliar
  después a Android BrowserStack, iOS local e iOS BrowserStack mediante perfiles
  explícitos, sin asumir equivalencia.
- [ ] Ejecutar en checkout temporal del commit fijado con los archivos exactos
  preparados, dependencias compatibles y datos/precondiciones controlados.
  Reservar dispositivo y cuenta por ejecución; evitar ensayos simultáneos
  sobre el mismo estado mutable. Fijar login, permisos, fecha/zona horaria y
  estado inicial; elegir usuarios al azar impediría comparar las ejecuciones.
- [ ] Resolver el runtime del target por sus propios requisitos. El framework
  inspeccionado declara Node >=24 y npm >=11; no asumir que el runtime de
  Electron los satisface. WDIO/Cucumber pertenecen al framework; Appium y los
  drivers locales continúan administrados por el Recorder, con sesión y puerto
  exclusivos para evitar competir con la grabación.
- [ ] Comprobar que se ejecutó el TC esperado y sus verificaciones. Un proceso
  con exit code 0 y cero escenarios, todo omitido o sin evidencia no acredita éxito.
  En la configuración inspeccionada, `wdio.shared.conf.ts` usa por defecto
  `@one_step_login`; local y BrowserStack tienen `strict: false` e
  `ignoreUndefinedDefinitions: true`. El adaptador debe generar configuración
  temporal con selección explícita y control estricto de steps indefinidos,
  sin cambiar las configuraciones compartidas del QA. Exigir eventos/reportes
  estructurados de Cucumber para el TC y Examples elegidos y detectar pasos
  `undefined`, `pending`, omitidos o fallidos. Allure es evidencia complementaria.
- [ ] Registrar recibo con attempt/revision/execution ID, hash de artefactos,
  framework, app/build, plataforma, entorno, perfil de datos, inicio/fin y
  resultados. Enlazar reportes, logs y evidencia visual disponible.
- [ ] Clasificar resultado: aprobado, fallo de automatización/aserción, fallo
  de datos/precondición, fallo de infraestructura, posible defecto de producto
  o sin evaluar. Una aserción fallida requiere diagnóstico: no se atribuye
  automáticamente al agente. Una discrepancia de hashes deja el resultado sin
  atribución a los archivos actuales.
- [ ] Conservar cada nueva ejecución con identidad propia. Deshabilitar o
  hacer visibles los retries del runner: `specFileRetries` y reintento Cucumber
  desactivados en el piloto inicial; reintentos de transporte explícitos y medidos.
  Una repetición en dispositivo no
  reabre automáticamente la generación ni consume una tercera pasada.

**Entrega:** comando/adaptador funcional y recibo que el evaluador pueda leer.
**Cierre:** un control correcto y defectos de locator/aserción se ejecutan y
clasifican con evidencia; se distinguen fallos de entorno y artefactos modificados.
El resultado se atribuye únicamente a los bytes probados. La salida al framework
sigue disponible aunque el QA no ejecute esta evaluación o el caso falle.

### H5 — Hacer útil la evidencia para todo el equipo

**Trabajo:**

- [ ] Integrar primero controles offline, replay y evaluación del validador en
  CI. Usar el baseline apropiado y conservar las discrepancias históricas.
- [ ] Añadir ejecución manual del piloto real con manifest revisable y entorno
  preparado. Una programación posterior es una decisión operativa separada;
  los PR de documentación no necesitan ejecutar modelos ni dispositivos.
- [ ] Unificar la presentación de los resultados en Revisión con el diseño del
  Recorder: validación técnica, criterios implementados, ejecución funcional,
  modelo, pasada y diagnóstico, sin convertirlos en un único score ambiguo.
- [ ] Añadir comparación por versión/caso: errores nuevos, persistentes y
  corregidos, intervenciones QA y resultados con/sin referencias.
- [ ] Incorporar al recuperar cambios QA el vínculo a evidencia de ejecución
  verificable cuando exista. La declaración manual del QA mantiene su origen
  separado de un recibo automático.
- [ ] Mantener el ciclo de PR: nueva edición → nueva revisión → revalidación/
  ejecución cuando corresponda → aprobación QA → nueva versión golden → commit/PR.
  La siguiente campaña usa otro snapshot del corpus; no cambia los informes previos.
- [ ] Documentar mantenimiento de corpus, responsables de discrepancias y
  retirada/sustitución de referencias sin borrar su historial aprobado.

**Entrega:** informes CI, comparación visible y guía operativa del equipo.
**Cierre:** otro QA reproduce el protocolo con los repositorios actualizados,
puede seguir corrigiendo/reexportando y distingue resultado autónomo, corrección
QA, resultado funcional y versión golden aprobada.

## Métricas y lectura de resultados

Cada porcentaje muestra numerador, denominador y no evaluados; sin denominador
la tasa es `null`, nunca 0 % o 100 %. Mantener los
campos existentes; cualquier proyección nueva documenta su definición. No mezclar
casos, acciones, invocaciones de rol y pasadas en el mismo denominador.

| Medida | Definición para el informe |
| --- | --- |
| Resultado operativo | Generaciones que cumplen el objetivo evaluado / generaciones programadas. Mostrar preparación fallida, interrupciones y desconocidos; no darles crédito de éxito. |
| Éxito autónomo | Resultado sin intervención QA conforme a las condiciones de `autonomousTaskSuccess` / intentos programados; exigir evidencia de invocación real y mostrar cobertura. No reemplazarlo por score técnico. |
| Calidad de primera pasada | Primeras pasadas válidas / primeras pasadas evaluables; acompañar con cobertura de evaluación y total de intentos iniciados. |
| Recuperación en segunda pasada | Intentos inicialmente inválidos que pasan al terminar / intentos inicialmente inválidos con evidencia. Mostrar los que no completaron la reparación. |
| Implementación de criterios | Criterios implementados / criterios evaluados, junto a evaluados / criterios QA totales y estado individual de los críticos. |
| Calidad final estática | Resultados preparados válidos / resultados preparados evaluables, con cantidad ausente/no evaluable y compilación limpia/heredada/no disponible separadas. |
| Ejecución funcional | Casos aprobados / ejecuciones funcionales evaluables, más cobertura respecto de las programadas. Mostrar fallos de datos/infraestructura y ausencias por separado. |
| Reutilización | Precisión TP/(TP+FP), recall TP/(TP+FN), usando etiquetas QA y baseline anterior a la generación; parametrizaciones no soportadas quedan sin evaluar. |
| Fidelidad del selector | Pares tipo/valor correctos antes de corregir / pares comprobados. Mostrar aparte correcciones deterministas y pendientes. |
| Consistencia | Resultado por caso en cada repetición y proporción de casos evaluados que pasan todas sus repeticiones; comparar comportamiento, no igualdad de texto. |
| Esfuerzo QA | Revisiones que requieren corrección, tipo de cambio y tiempo sólo cuando esté registrado. Un diff pequeño no demuestra poco tiempo humano. |
| Coste operativo | Duración y llamadas por rol/pasada; tokens/coste sólo si el proveedor ofrece datos verificables. |

Los resultados sin llamadas al proveedor se clasifican como ejecución
determinista, caché u omisión; no acreditan capacidad del modelo. Las repeticiones
del mismo caso no equivalen a casos independientes: publicar detalle por caso y
ampliar familias/plataformas antes de generalizar. Una muestra inicial pequeña
sirve para detectar problemas y orientar trabajo, no para prometer un porcentaje
de mejora para toda la automatización.

## Archivos y superficies de implementación

- Reutilizar `AutomationPackageBuilder`, `DeterministicResolver`,
  `LayeredGenerationOrchestrator`, contratos y `AutomationResponseValidator`.
- Reutilizar `agents:pilot`, `agents:evaluate`, `reuse:evaluate`,
  `validator:evaluate` y `golden:replay`; evitar otro orquestador paralelo.
- Versionar protocolos portables, criterios, etiquetas, fixtures y resúmenes
  revisados. Un config local materializa las rutas absolutas que exige hoy el
  runner; esas rutas no forman parte del protocolo compartido.
- Guardar salidas extensas del piloto/dispositivo en runtime o artefactos de CI,
  por protocolo/intento/ejecución, con hashes y conservación del historial.
  Las credenciales y archivos locales de sesión no se publican con el informe.
- Un futuro runner funcional y su contrato de recibo son trabajo nuevo de H4;
  sus nombres/rutas se definirán al implementar, según los límites de arquitectura.

## Primer lote y seguimiento

El primer lote es **H0 + H1**: fijar el baseline de los tres flujos, revisar la
procedencia del golden de ventas y preparar controles y etiquetas independientes.
Después ejecutar H2 para escoger las primeras correcciones de H3 con evidencia.

| Fase | Estado actual | Evidencia requerida para cerrar |
| --- | --- | --- |
| H0 | Parcial: captura y auditoría implementadas | Dependencias compatibles y decisión QA sobre controles seleccionados. |
| H1 | Parcial: corpus sintético y controles offline implementados | Variantes reales, etiquetas y reserva revisadas por QA. |
| H2 | Pendiente | Protocolo ejecutado con proveedor real e informe. |
| H3 | Pendiente | PR de mejora y comparación baseline/candidata. |
| H4 | Pendiente | Recibos de ejecución funcional atribuibles. |
| H5 | Pendiente | Informes CI/UI y reproducción por otro QA. |

Actualizar [AGENT_EVALUATION_PROGRESS.md](AGENT_EVALUATION_PROGRESS.md) con la
evidencia al completar cada entrega. Los controles offline no ejecutan el piloto
ni acreditan éxito del modelo o ejecución mobile; el cierre de fase conserva
sus requisitos de QA y entorno.

Referencias de implementación: [piloto y evaluación](AGENT_EVALUATION_PILOT.md),
[fidelidad de locators](LOCATOR_FIDELITY.md), [contrato de generación](GENERATION_CONTRACT.md),
[criterios QA](ACCEPTANCE_CRITERIA.md), [golden y referencias](AUTOMATION_GOLDEN_LEARNING.md)
y [fases existentes](AGENT_EVALUATION_IMPLEMENTATION_PHASES.md).
