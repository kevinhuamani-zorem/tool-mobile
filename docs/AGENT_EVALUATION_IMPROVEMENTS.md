# Mejoras por implementar — Evaluación y validación de agentes

Fecha de la auditoría: 2026-09-07.

Estado: **backlog pendiente de implementación**. Este documento conserva los
hallazgos, prioridades y criterios de aceptación de la auditoría; no introduce
contratos nuevos ni modifica el comportamiento del recorder.

Referencia inspeccionada: rama `feature/multi-agent-generation-pipeline`, commit
`3269813`, incluyendo los cambios locales presentes durante la auditoría.
Los resultados no certifican por sí solos el estado publicado de `main`.

## 1. Resumen ejecutivo

El proyecto tiene una base sólida de generación y validación determinística,
pero todavía no constituye un framework completo de evaluación funcional y
regresión de agentes.

Se comprueban relaciones entre capas, reutilización, selectores, parámetros,
sintaxis, compilación acotada y aplicación segura. Esto supera una validación
de JSON, pero no demuestra que el caso cumpla el resultado de negocio al
ejecutarse en un dispositivo.

Durante la auditoría pasaron 402 pruebas focalizadas, sin fallos ni omisiones;
también pasaron el typecheck y el control de arquitectura. No se ejecutaron
agentes reales ni pruebas móviles.

Prioridades principales:

- P0: cerrar la ruta alternativa de escritura del guardado golden, que no
  comparte todas las garantías de compilación y transacción del apply normal.
- P1: disponer de un dataset golden real, validación uniforme de schemas,
  resultados por intento y comparación reproducible de agentes.
- P2: consolidar métricas reales, negativos/equivalencias y controles de CI.

## 2. Veredicto general

| Pregunta | Estado observado |
| --- | --- |
| ¿Existe un framework de evaluación? | Parcial: hay validadores y pruebas, no un harness funcional completo. |
| ¿Se evalúa más que la estructura? | Sí, pero sin un oráculo completo del comportamiento de negocio. |
| ¿Las grabaciones constituyen un dataset golden? | No automáticamente; existe el mecanismo y dos fixtures técnicos, no un corpus aprobado poblado. |
| ¿Se detectan regresiones? | Sí, determinísticas; no la variabilidad funcional de ejecuciones reales del agente. |
| ¿Existe comparación A/B controlada? | No implementada. |
| ¿Existe una definición única de task success? | Parcial; los estados están repartidos entre proveedor, pipeline, validación, UI y aplicación. |
| ¿Se miden falsos positivos y negativos? | Hay pruebas negativas, pero no tasas contra una referencia independiente. |
| ¿Hay trazabilidad completa? | Parcial: IDs, hashes y paquetes, sin historial completo e inmutable por intento. |
| ¿CI garantiza calidad funcional? | No; comprueba contratos, arquitectura y regresión determinística. |
| ¿Qué falta para aumentar la confianza? | Unificar escrituras, resultados y métricas; aprobar un corpus y ejecutar benchmarks controlados. |

## 3. Arquitectura observada

Flujo principal:

```text
Acción ejecutada correctamente → grabación → resolver / catálogo
  → plan, hints, gaps y contexto por rol → borrador determinístico
  → Lorem + Zorem → ensamblado determinístico o Sumrak
  → validación contractual → preview + compilación
  → revisión del QA → aplicación segura → memoria / golden opcional
```

Derek cumple el rol de owner determinístico; no representa necesariamente una
invocación al modelo. Tampoco debe confundirse el número de roles con el de
llamadas: intervienen caché, generación determinística e integración omitida.

| Etapa | Implementación principal | Garantía y límite |
| --- | --- | --- |
| 1. Registro | `interactionHandlers`, `automationRecordingStore` | Persiste después de ejecutar; no prueba futuras ejecuciones. |
| 2. Escenario | `automationRecordingStore` | Construye escenario e identidad/fingerprint. |
| 3. Paquete | `automationPackageBuilder` | Prepara contratos, baselines y contexto; reinicia derivados. |
| 4. Resolución | `deterministicResolver` | Decide reutilización, creación y gaps. |
| 5. Consultas | Proyecciones, `gapQueryPolicy`, `FrameworkQueryService` | Consultas autorizadas y acotadas. |
| 6. Plan | Resolver | Fija rutas, operaciones y presupuestos. |
| 7. Ejecución | Orquestador layered y adaptador Copilot | Gestiona salidas, feedback, cancelación y timeouts. |
| 8. Materialización | Lorem, Zorem, generador determinístico | Produce las cuatro capas y sus relaciones. |
| 9. Evaluación | `automationResponseValidator` | Contratos, trazas, parámetros y estructura. |
| 10. Corrección | Orquestador y adaptador | Rondas limitadas y detección de no convergencia. |
| 11. Importación | `responseImport`, decisiones QA | Mantiene borradores revisables aun con observaciones. |
| 12. Aplicación | `applyAutomation`, `automationApplier` | Preview exacto, compilación y escritura transaccional en el flujo normal. |
| 13. Observabilidad | `agentRunStore`, reportes layered | Métricas parciales, no un resultado autoritativo por intento. |
| 14. Regresión | Fixtures de fase 4.3 y golden | Replay determinístico; no benchmark funcional de agentes reales. |

## 4. Matriz de capacidades

| Capacidad | Estado | Brecha principal |
| --- | --- | --- |
| Dataset de evaluación | Parcial | Corpus golden aprobado vacío. |
| Contratos de entrada/salida | Parcial | Validación de schema incompleta y rutas heterogéneas. |
| Evaluadores determinísticos | Implementados | No equivalen a oráculos funcionales. |
| Evaluación funcional | Parcial | Sin ejecución real y evidencia de negocio. |
| Reutilización | Implementada | Coincidencia estructural no garantiza equivalencia de intención. |
| Selectores verificados | Implementados | Garantía vinculada al estado grabado. |
| Hints y consultas controladas | Implementados | Falta medir utilidad y precisión. |
| Task success | Parcial | Sin estado terminal único por intento. |
| Métricas | Parciales | Faltan consolidación y denominadores. |
| Regresión | Parcial | Fixtures determinísticos, no benchmark repetido del modelo. |
| Comparación A/B | No implementada | Falta runner controlado. |
| Human-in-the-loop | Implementado | Historial de decisiones incompleto. |
| Trazabilidad | Parcial | Artefactos mutables y ausencia de identidad completa del intento. |
| Seguridad | Parcial | Apply normal protegido; golden y permisos del proceso requieren revisión. |

## 5. Dataset golden

Existe soporte para guardar IDs, plataforma, squad, objetivo, autor, fecha,
notas, respuesta aceptada, archivos esperados, hashes, plan, baselines,
catálogo y referencia del framework. Sin embargo:

- No se encontró un corpus aprobado en `tests/golden` durante la auditoría.
- El replay golden puede terminar en verde cuando no encuentra casos, sin
  marcar explícitamente que no evaluó ninguno.
- `executed: passed/failed/not-run` es información declarada, no evidencia
  enlazada de una ejecución funcional.
- Falta una taxonomía obligatoria de criticidad y cobertura.
- El catálogo capturado al guardar puede ser posterior a la aplicación del
  caso y contener ya sus propios artefactos.
- Se guardan hashes, pero la lectura no verifica su integridad.
- El replay evalúa plan y validación, no agentes, compilación ni dispositivo.
- Los fixtures reconstruyen el framework desde el HEAD disponible, no
  necesariamente desde el commit del manifiesto.

Los dos fixtures técnicos de fase 4.3 proporcionan regresión determinística
real, pero no sustituyen un dataset funcional aprobado.

## 6. Contratos y evaluadores

Los validadores cubren identidad, rutas, capas, gaps, selectores, trazabilidad,
estructura, parámetros e imports. Persisten diferencias entre puntos de entrada:

- Hay compatibilidad que permite omitir `schemaVersion` en ciertos envelopes.
- La importación manual puede normalizar o consultar campos antes de validar
  completamente el envelope.
- Algunas operaciones como `resolutions.forEach` o `files.filter` pueden
  producir excepciones ante estructuras malformadas, en vez de diagnósticos.
- No hay un límite global uniforme de bytes previo a leer y parsear JSON.
- `validateWithSchema` implementa un subconjunto de JSON Schema.

Comprobaciones de solo lectura realizadas:

```text
validateWithSchema("abcdef", {type: "string", maxLength: 3}) → true
validateWithSchema(-1, {type: "integer", minimum: 1}) → true
```

Hay controles posteriores que compensan algunas restricciones, pero no puede
afirmarse cumplimiento completo del schema.

Los errores tampoco tienen uniformemente severidad, reparabilidad y valores
esperado/observado. El verificador de paquete generado incluye lógica propia:
su PASS no equivale al importador completo más compilación del framework.

## 7. Alcance funcional de la validación

| Nivel | Alcance actual |
| --- | --- |
| Estructura y contratos | Implementado. |
| Compilación acotada contra el framework | Implementado. |
| Ejecución correcta en dispositivo | No verificada por esta auditoría. |
| Cumplimiento del resultado de negocio | Parcial; faltan oráculos y evidencia ejecutada. |

Se detectan parámetros perdidos, selectores inventados, trazas incompletas,
keywords incoherentes y determinados usos incorrectos de aserciones y booleanos.
No se garantiza el estado futuro de la app, los datos, la sincronización ni
que el criterio definido por el QA sea correcto.

La revisión de diseño de Lorem debe conservarse como sugerencia no bloqueante.
El estado de compilación con errores preexistentes significa ausencia de
errores nuevos dentro del alcance evaluado, no compilación global limpia.

## 8. Contexto, consultas e índice

La política permite consultar gaps abiertos autorizados y limita repeticiones,
consultas y respuestas truncadas. Están disponibles `inspectScenario`,
`findExistingScreen`, `findExistingStep`, `findExample`, `findLocator`,
`getContract`, `getHelperApi` y `validateImports`.

Las pruebas cubren caché fría, caliente y actualización incremental. Los límites
de resultados usan un valor predeterminado de 40 y máximo de 50. El límite de
bytes no es universal: `maxBytes` puede quedar sin definir, aunque la política
de gaps lo suministra en determinados caminos.

Los presupuestos de contexto/duración por etapa generan advertencias, no un
límite duro de costo. ReuseAnalyzer consume información del grafo, pero aún
relee y parsea archivos para su catálogo: la migración a una única fuente de
verdad es parcial.

No se encontró vector DB ni búsqueda por embeddings. La recuperación es
estructurada por símbolos, términos, módulos, relaciones y scopes. Falta medir
precisión, recall, utilidad de hints y qué fragmentos causaron cada decisión.
Un contador `hintsUsed` no demuestra lectura efectiva por el modelo.

## 9. Resultado por intento y task success

Hoy coexisten estados del proveedor, etapa, pipeline, validador, UI y aplicación.
En los artefactos del recording `2026-09-06T21-51-23-848Z-85a9110f` se observaron
estados distintos entre el reporte layered y `agent-run.json`; el runtime
cambió durante la inspección hacia una corrección manual. Esto no prueba una
contradicción dentro del mismo intento: evidencia la necesidad de `attemptId`
y de historial, además de `recordingId` y `planId`.

Definiciones propuestas, todavía no implementadas:

- `generationTaskSuccess`: salida completa del intento, identidad/rutas/trazas
  correctas, contrato válido, preview final comprobado por la política de
  compilación y ausencia de decisiones obligatorias sin resolver.
- `functionalTaskSuccess`: lo anterior más ejecución identificada por entorno,
  oráculo de negocio y evidencia vinculada a los mismos bytes generados.
- Sin ejecución funcional, registrar `not-evaluated`, no éxito implícito.

Las sugerencias de diseño no deben confundirse con decisiones obligatorias.

## 10. Métricas y calidad

Faltan agregadores con denominadores explícitos para:

| Métrica propuesta | Definición inicial |
| --- | --- |
| firstPassSuccessRate | Intentos correctos sin reparación / intentos evaluables. |
| finalSuccessRate | Intentos correctos al finalizar / intentos evaluables. |
| repairRate | Intentos con reparación / intentos totales. |
| qaRequiredRate | Intentos con decisión obligatoria / intentos totales; excluir sugerencias. |
| contractViolationRate | Intentos con violaciones / intentos; separar primera y última salida. |
| functionalFailureRate | Ejecuciones funcionales fallidas / ejecuciones funcionales realizadas. |
| stepReuseRate | Steps correctamente reutilizados / steps elegibles. |
| verifiedSelectorUsageRate | Acciones con par verificado / acciones que requieren selector. |
| timeoutRate | Intentos con timeout / intentos ejecutados. |

Las duraciones, bytes e invocaciones existen parcialmente, pero deben separarse
espera del QA, tiempo del modelo, caché y concurrencia. Sumar duraciones de
etapas paralelas no equivale al tiempo de pared.

Otras limitaciones observadas:

- La consolidación del reporte layered hacia `agent-run` es incompleta.
- `filesRead` y `bytesRead` no abarcan necesariamente todo el I/O del agente
  y del compilador.
- El contexto disponible en una carpeta no equivale a contexto realmente leído.
- Algunos acumulados conservan la última pasada, no toda la historia de reintentos.
- `responseBytes` no incluye necesariamente respuestas descartadas.
- Los tokens son nullable y no se encontró escritura efectiva de ambos contadores.
- El modelo usado se obtiene cuando el proveedor lo expone; no debe inventarse.
- Los créditos extraídos de eventos no constituyen un costo monetario verificado.

Los scores actuales son heurísticos. Una comprobación del helper de calidad con
una referencia fuera de rango (`actionIndices: [99]`, con una sola acción)
devolvió cobertura y score de 100. Esto demuestra una debilidad de ese helper,
no que todos los validadores acepten ese caso.

## 11. Regresión y comparación A/B

Hay regresión determinística por comparación canónica y perfiles esperados,
además de proveedores simulados para probar la mecánica de orquestación.
No hay un runner que repita agentes reales sobre el mismo corpus, cambie una
sola variable y conserve todas las salidas, incluidos los fallos.

`scripts/phase43-baseline.js` clasifica mediante nombres de tests predefinidos,
sin comparar contra un baseline capturado. Otros fallos pueden etiquetarse como
preexistentes confirmados sin evidencia dinámica. El proceso sigue devolviendo
error ante tests fallidos: el problema es la clasificación, no un bypass del exit code.

El workflow de calidad no fija un ref del framework. Esto reduce reproducibilidad.
Sus controles de typecheck, arquitectura, pruebas, métricas y build no equivalen
a un gate de calidad funcional de agentes. Los ejemplos sintéticos y límites
configurados tampoco son mediciones de ejecuciones reales.

## 12. Revisión del QA y aprendizaje

El recorder permite preview, edición, reimportación, decisiones estructuradas,
revalidación y aplicación. Debe conservar esta capacidad de trabajar sobre un
borrador con observaciones.

Pendientes:

- Historial append-only de decisiones: actor, intento y valores anteriores.
- Distinguir sugerencias de decisiones que sí requieren autorización.
- No marcar como funcionalmente probado un caso por haber sido aplicado.
- Separar memoria de aceptación técnica y memoria con ejecución comprobada.
- Evitar inferir que guardar un golden exige o demuestra `executed: passed`.

## 13. Falsos positivos y falsos negativos

Las probabilidades siguientes son estimaciones técnicas, no tasas medidas.

| Riesgo | Tipo | Evaluación propuesta |
| --- | --- | --- |
| Golden acepta código con símbolo inexistente | Falso positivo, prioridad alta | Guardado con TypeScript inválido debe usar la misma política del apply normal. |
| Restricciones de schema ignoradas | Falso positivo comprobado en helper | Casos `minimum`, `maxLength`, tipos y tamaño máximo. |
| Índices de cobertura fuera de rango | Falso positivo comprobado en helper | Validar pertenencia de cada acción al recording. |
| Código compila pero comprueba otro resultado | Falso positivo funcional | Golden negativo con oráculo independiente. |
| Step existente coincide en expresión pero no intención | Falso positivo semántico | Fixtures con misma forma y comportamiento distinto. |
| Método/helper válido rechazado por patrón rígido | Falso negativo posible | Equivalencias AST y helpers válidos, sin relajar todas las reglas. |
| Paráfrasis Gherkin correcta rechazada | Falso negativo posible | Corpus positivo y negativo de redacción. |
| Mismos mensajes de error aunque el código progresa | Corte prematuro posible | Evaluar cambios relevantes además del texto de diagnósticos. |

Los tests de booleanos retornados y normalización de keywords cubren fallos
concretos recientes, pero no establecen una tasa general de falsos negativos.

## 14. Seguridad y escritura

El apply normal comprueba el preview preparado, hashes, cambios externos,
rutas autorizadas, contrato y compilación, y utiliza escritura con rollback.
Las pruebas incluyen fallo en una segunda escritura y restauración de metadata,
registro y memoria. No se verificó recuperación garantizada ante corte de energía
o terminación abrupta del proceso.

Hallazgo prioritario: el guardado golden puede reutilizar `validation.json`
cuando considera que no hubo cambios, o validar solo el contrato cuando hubo
ediciones. No comparte siempre la compilación ni la transacción del apply normal;
comprueba la existencia de la respuesta, no necesariamente un recibo de aplicación
exitosa. Debe unificarse esta ruta antes de usar golden como garantía de calidad.

Otros pendientes:

- `--add-dir` y las instrucciones de scope no constituyen un sandbox del sistema operativo.
- Permitir shell Node/Python requiere evaluar acceso fuera del paquete y entorno heredado.
- No se ejecutaron intentos de escape durante la auditoría.
- El saneamiento de secretos y logs es parcial; stdout de herramientas puede incluir datos.
- Falta límite consistente de stdout/stderr, retención y purga centralizada.
- No se verificó una defensa completa contra instrucciones maliciosas en contexto recuperado.

## 15. Validaciones ejecutadas en la auditoría

| Grupo | Resultado | Tiempo de pared observado |
| --- | --- | --- |
| Pipeline, contexto, queries, resolver, generador, selectors, inspector, métricas, compilación, regresión y layered | 247 pass, 0 fail, 0 skip | 7.293 s |
| Adaptador, patch writer, prepared apply, provenance, orquestador, steps, parámetros, aserciones, identidad, locators, sintaxis, UTF-8 y escenario | 150 pass, 0 fail, 0 skip | 2.100 s |
| Calidad y planificación de gaps | 5 pass, 0 fail, 0 skip | 0.293 s |
| `npm run typecheck` | Correcto | 3.058 s |
| `npm run architecture:check` | 159 archivos, 0 violaciones, 0 ciclos | 0.481 s |
| `git diff --check` | Correcto | No medido por separado |

Total: **402 pruebas**, sin fallos ni omisiones en esos grupos.

Comandos de tests usados:

```sh
node --test tests/automationPipeline.test.js tests/automationContextPolicy.test.js tests/frameworkQueryService.test.js tests/deterministicResolverGaps.test.js tests/deterministicGenerator.test.js tests/verifiedSelectorCandidates.test.js tests/inspectorWorkflow.test.js tests/embeddedInspectorProtocol.test.js tests/agentRunStore.test.js tests/frameworkCompilation.test.js tests/phase43DeterministicRegression.test.js tests/goldenDataset.test.js tests/gherkinKeywordNormalizer.test.js tests/returnedBooleanUsage.test.js tests/layeredGenerationOrchestrator.test.js

node --test tests/copilotCliAdapter.test.js tests/automationPatchWriter.test.js tests/preparedAutomation.test.js tests/automationPackageProvenance.test.js tests/agentOrchestrator.test.js tests/stepAmbiguity.test.js tests/parameterFlow.test.js tests/textAssertion.test.js tests/elementIdentity.test.js tests/locatorRoundTrip.test.js tests/automationResponseValidatorSyntax.test.js tests/utf8Text.test.js tests/automationScenarioPackage.test.js

node --test tests/generationQuality.test.js tests/gapExecutionPlanner.test.js
```

Se usó el `dist` disponible para las pruebas que lo consumen; no se reconstruyó
el proyecto durante la auditoría. El typecheck se realizó sobre el código fuente.
No se ejecutaron el quality completo, agentes reales, dispositivos, un benchmark
funcional ni el workflow remoto. Estas cifras son evidencia histórica de la
auditoría, no pruebas repetidas al crear este documento.

## 16. Capacidades pendientes

- [ ] Resultado terminal autoritativo por intento.
- [ ] Corpus golden aprobado, representativo y con integridad verificada.
- [ ] Oráculos de negocio y evidencia de ejecución cuando corresponda.
- [ ] Replay repetido de agentes conservando todas las salidas.
- [ ] Comparación A/B con una variable por experimento.
- [ ] Tasas agregadas con denominadores explícitos.
- [ ] Telemetría layered consolidada por invocación.
- [ ] Validación uniforme de schemas y tamaños de entrada.
- [ ] Guardado golden mediante la misma ruta segura de aplicación.
- [ ] Retención, privacidad y límites de salida.
- [ ] Framework, dependencias y configuración fijados para CI.
- [ ] Matriz medida de falsos positivos y negativos.

## 17. Backlog priorizado

Todos los elementos siguientes están pendientes. El esfuerzo es una estimación,
no un compromiso de duración. Los IDs sirven para seguir estas propuestas.

| ID | Prioridad | Mejora | Esfuerzo | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| EVAL-01 | P0 | Unificar guardado golden y apply seguro | Medio | Compilación, preview actual y transacción compartidos; probar código inválido, cambios externos y fallo en segunda escritura. |
| EVAL-02 | P1 | Validación uniforme de schemas | Medio | Entradas nulas, campos ausentes/extra, restricciones numéricas/textuales y tamaño máximo producen diagnósticos controlados. |
| EVAL-03 | P1 | Resultado por intento | Medio | `attemptId`, eventos y estado terminal coherentes en éxito, fallo, timeout, caché y corrección manual. |
| EVAL-04 | P1 | Dataset golden aprobado | Medio | Catálogo previo congelado, hashes verificados, criticidad y aprobación; gate explícito cuando el corpus esté vacío. |
| EVAL-05 | P1 | Baseline real de regresiones | Bajo | Comparar evidencia capturada; distinguir fallos nuevos, preexistentes y resueltos sin listas de nombres hardcodeadas. |
| EVAL-06 | P1 | Runner de evaluación repetida y A/B | Alto | Misma entrada/configuración, una variable por variante, todas las salidas conservadas y caché fría/caliente separadas. |
| EVAL-07 | P1 | Aislamiento del proceso del agente | Alto | Política verificable de rutas, secretos y red; documentar límites si no hay sandbox real. |
| EVAL-08 | P2 | Consolidar telemetría | Medio | Medir invocaciones reales, tiempo de pared, espera QA, concurrencia y contexto disponible/enviado/leído sin mezclarlos. |
| EVAL-09 | P2 | Evaluar la calidad de los evaluadores | Medio | Suite de mutaciones y equivalencias: aserción eliminada, selector alterado, orden incorrecto y helper válido. |
| EVAL-10 | P2 | CI reproducible | Bajo/medio | Fijar SHA del framework, dependencias y configuración; mismo corpus reproducible en instalación limpia. |
| EVAL-11 | P2 | Privacidad y límites de logs | Medio | Redacción de secretos incluso en JSON fragmentado, límites de volumen y retención comprobados. |
| EVAL-12 | P3 | Consolidar índice y utilidad del contexto | Medio | Reutilizar representación de CodeGraph sin parseo paralelo innecesario; mismos resultados con menos I/O medido. |

Áreas involucradas:

- EVAL-01: `goldenCase`, `applyAutomation`, `automationApplier`.
- EVAL-02: adaptador Copilot, `responseImport`, contratos de gaps/envelopes.
- EVAL-03 y EVAL-08: `agentRunStore`, `agentLaunch`, orquestador layered y budgets.
- EVAL-04: `goldenDataset`, handler golden y pruebas de replay.
- EVAL-05 y EVAL-10: scripts de baseline, fixtures y workflow de calidad.
- EVAL-06: harness nuevo alrededor del orquestador y del corpus existente.
- EVAL-07 y EVAL-11: permisos, adaptador, construcción de paquetes y logs.
- EVAL-09: reglas de validación y helper de calidad.
- EVAL-12: `ReuseAnalyzer`, `CodeGraph` y `FrameworkQueryService`.

## 18. Gates de aceptación propuestos

No adoptar porcentajes altos como garantía antes de contar con dataset,
denominadores y baseline medidos.

| Gate candidato | Condición previa |
| --- | --- |
| 100 % de casos críticos correctos | Definir casos críticos y oráculos independientes. |
| Éxito final ≥ 98 % | Medir primero un baseline representativo y repetido. |
| Éxito en primera pasada ≥ 90 % | Separar reparación y efecto de caché. |
| Cero violaciones contractuales en salida aprobada | Evaluar salida final, sin confundir borradores intermedios. |
| 100 % de selectores autorizados/verificados | Denominador por acción elegible y política explícita de reutilización/reemplazo. |
| Cero fallos funcionales críticos | Requiere ejecución real; no inferirlo por compilación. |
| Regresión temporal ≤ 15 % | Misma máquina, modelo, corpus y caché; comparar mediana y p95. |
| Aumento de contexto ≤ 10 % | Definir si se mide contexto disponible, enviado o leído. |
| Cero decisiones obligatorias sin resolver | No incluir sugerencias de diseño no bloqueantes. |

Orden recomendado: cerrar la ruta golden y los contratos de entrada; establecer
identidad por intento; aprobar un corpus pequeño con negativos y equivalencias;
medir un baseline repetido; después activar gates de release.

La afirmación actualmente defendible es:

> Propuesta validada contractualmente y comprobada con TypeScript dentro del alcance indicado.

No debe sustituirse por una garantía de caso funcionalmente correcto o de PR sin
observaciones. Las mejoras deben ser incrementales, conservar la arquitectura
actual y no modificar las grabaciones para hacer pasar validaciones.

## Referencias de código

Rutas relativas al repositorio, verificadas durante la auditoría. El código y
los artefactos runtime pueden cambiar después de esta instantánea.

- [Resolver determinístico](../core/automation/application/deterministicResolver.ts)
- [Preparación del paquete](../core/automation/infrastructure/automationPackageBuilder.ts)
- [Orquestador layered](../core/automation/infrastructure/layeredGenerationOrchestrator.ts)
- [Adaptador Copilot](../core/automation/infrastructure/copilotCliAdapter.ts)
- [Permisos Copilot](../core/automation/infrastructure/copilotPermissions.ts)
- [Telemetría](../core/automation/infrastructure/agentRunStore.ts)
- [Política de consultas](../core/automation/infrastructure/gapQueryPolicy.ts)
- [FrameworkQueryService](../core/workspace/infrastructure/frameworkQueryService.ts)
- [CodeGraph](../core/indexing/infrastructure/codeGraph.ts)
- [ReuseAnalyzer](../core/indexing/infrastructure/reuseAnalyzer.ts)
- [Validador de respuestas](../core/validation/infrastructure/automationResponseValidator.ts)
- [Compilación contra el framework](../core/validation/infrastructure/frameworkCompilationValidator.ts)
- [Calidad de generación](../core/generation/domain/generationQuality.ts)
- [Importación de respuestas](../recorder/src/ipc/automation/responseImport.ts)
- [Aplicación normal](../recorder/src/ipc/automation/applyAutomation.ts)
- [Escritura transaccional](../core/automation/infrastructure/automationApplier.ts)
- [Handler golden](../recorder/src/ipc/automation/goldenCase.ts)
- [Dataset golden](../core/automation/infrastructure/goldenDataset.ts)
- [Tests golden](../tests/goldenDataset.test.js)
- [Regresión determinística](../tests/phase43DeterministicRegression.test.js)
- [Clasificación de baseline](../scripts/phase43-baseline.js)
- [Métricas de calidad](../scripts/quality-metrics.js)
- [Workflow de calidad](../.github/workflows/quality.yml)
