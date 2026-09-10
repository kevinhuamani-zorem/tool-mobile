# Conservación de cobertura al regenerar un caso

Inicio: 2026-09-10. Complementa [BEHAVIOR_REUSE.md](BEHAVIOR_REUSE.md).

## Alcance del producto

El objetivo del Recorder es generar o reutilizar las cuatro capas a partir de
grabaciones de cualquier flujo y squad del framework seleccionado. La solución
de cobertura debe servir a ese contrato general. TC-10240 motivó la regresión
descrita abajo; no define los flujos admitidos ni requiere reglas especiales
de yapeo. Las correcciones de una grabación pertenecen al QA de ese caso y no
son un requisito para avanzar las capacidades generales del Recorder.

## Problema y contrato

TC-10240 se regeneró con siete frases declarativas nuevas, conservando las
llamadas, los argumentos y las aserciones de sus Steps anteriores. El control
anterior buscaba las frases normalizadas en orden; no podía distinguir ese
cambio de redacción de una pérdida de comportamiento. Restaurar definiciones
legacy no resolvía esa comparación del Feature.

El contrato nuevo compara la cadena Feature → Steps → Screen → dependencias y
locators de dos instantáneas. No acepta una declaración de equivalencia del
agente, la similitud del texto ni `actionTrace` como prueba por sí solas.

| Resultado | Significado | Consecuencia |
| --- | --- | --- |
| `preserved` | Las operaciones y comprobaciones anteriores siguen presentes con sus argumentos y orden, bajo el mismo contexto de ejecución. | No hay error por cambiar solamente la redacción. Siguen aplicando las demás reglas. |
| `lost` | La propuesta elimina una operación/aserción anterior, altera un argumento o no conserva su orden/repetición. | `case-coverage-review` solicita corregir la cobertura. |
| `unverified` | La evidencia no alcanza: binding ambiguo, dependencia ausente o código cambiado cuya equivalencia no está demostrada. | `case-coverage-unverified` solicita revisar la equivalencia, sin afirmar una pérdida demostrada. |

Un resultado `preserved` conserva la cobertura previa; **no demuestra que esa
cobertura sea suficiente**, ni que la prueba se haya ejecutado con éxito. No
concede aprobación QA, no agrega golden y no convierte el score técnico en
éxito funcional. Los criterios de aceptación se evalúan por separado.

## Implementación y límites

`compareCaseCoverage` es puro: recibe textos de dos instantáneas, no ejecuta
TypeScript, no consulta al LLM y no lee el disco. Expande Examples, resuelve
Steps con el matcher común del Recorder y compara las operaciones de callbacks
reconocibles. Los nombres de variables locales y las frases pueden cambiar;
los valores enlazados, las aserciones y el orden deben conservarse.

Los métodos Screen y su cierre de dependencias se identifican por código
canónico. Se reconoce además una extracción mecánica acotada: separar un
prefijo de instrucciones await de un método async void sin parámetros, cuando
la concatenación reconstruye exactamente el cuerpo anterior, la clase mantiene
su contexto y el Feature ejecuta ambas partes en el mismo orden. Los getters,
locators y dependencias deben conservar su contrato. Otros cambios de
implementación, helper, getter, JSON o TypeLocator requieren revisar la
equivalencia; esta versión no interpreta métodos arbitrarios para declararlos
equivalentes. Las
estructuras no soportadas quedan sin verificar. Los hooks y el contexto de los
módulos Steps también forman parte de la comparación. El alcance es el código
aportado por las instantáneas; los paquetes externos y el entorno del runner se
suponen iguales entre revisiones. Esto no simula Appium, plugins ni el estado
del dispositivo y no demuestra equivalencia de ejecución de extremo a extremo.

`collectCaseCoverageSnapshots` lee una sola vez cada archivo físico y separa el
baseline de la propuesta. Los textos de baseline proporcionados tienen
prioridad sobre el checkout; el resto de dependencias se obtiene del checkout
seleccionado durante esa comprobación. **No reconstruye una revisión histórica
completa a partir del framework actual.** La validación normal compara contra
el checkout de destino; los replays históricos necesitan aportar sus fuentes
congeladas. Los imports respetan los aliases estándar; una configuración no
soportada se mantiene sin verificar. Se confinan rutas y symlinks al framework.

`validation.caseCoverage` persiste estado, plataforma, hashes de ambas
instantáneas, diferencias, correspondencias de pasos y cantidad de Examples
examinados. No incluye valores de los Examples en mensajes ni credenciales.
Cambiar archivos exige revalidar. El reporte acompaña `validation.json` y el
historial de validación ya existente.

La generación aplica el mismo comparador después de combinar las cuatro capas.
Una equivalencia demostrada puede actualizar el Feature sin un conflicto por
redacción. Una pérdida o equivalencia pendiente mantiene ambas propuestas para
revisión. La conservación de APIs compartidas, unicidad de Steps, contratos de
locators y exportación segura siguen siendo comprobaciones independientes.

La reutilización reconoce ahora parámetros `string` simples por posición,
forwarding directo y capturas canónicas con Examples comprobados. No inventa
argumentos ni wrappers para métodos parametrizados que carecen de un Step
reutilizable probado. Transformaciones, parámetros opcionales, defaults,
destructuring y regex ambiguos continúan pendientes. Una aserción explícita de
visibilidad no se descarta como una simple espera antes de un click.

## Fases y pendientes

| Fase | Entrega | Estado |
| --- | --- | --- |
| F1 | Contrato de tres estados y controles sintéticos positivos/negativos. | Implementada; ver pruebas. |
| F2 | Comparador determinista, instantáneas, Examples, dependencias y hashes. | Implementada con el alcance conservador descrito. |
| F3 | Integración en generación/validación y reutilización de Steps con parámetros comprobables. | Implementada para bindings directos; equivalencias arbitrarias y Steps compuestos no reconocidos quedan pendientes. |
| F4 | Vista de comparación de cobertura, diagnósticos agrupados entre pasadas y reparación dirigida a la capa que cambió. | Implementada: panel en Revisión, alertas QA independientes, invalidación al editar y enrutado por diferencias de las instantáneas. |
| F5 | Verificar y cerrar brechas generales de evidencia y revisión QA para grabaciones de distintos flujos y squads. | Pendiente de auditoría transversal; las alertas y el ciclo de revisión existentes son la base. No implica corregir todos los casos particulares. |
| F6 | Piloto/harness con diversidad de squads, capacidades y plataformas, etiquetas independientes, métricas antes/después y ejecución móvil. | Pendiente. Los controles offline y una familia de casos no acreditan soporte general ni éxito funcional. |

### F5 — Evidencia y revisión para cualquier grabación

Comprobar con grabaciones variadas que las acciones, el orden, los parámetros,
la plataforma y el par selector/TypeLocator mantienen su identidad hasta las
cuatro capas, sean nuevas o reutilizadas. El contexto de negocio, los datos
válidos y el catálogo provienen del squad y framework seleccionados; los golden
son referencias opcionales y no sustituyen la evidencia del caso.

Las comprobaciones deben corresponder al esperado definido por QA y a lo
observado. Si faltan datos, asociación de elemento o evidencia del resultado,
mostrar qué acción requiere revisión, corrección o nueva grabación. No inventar
selectores ni aserciones. Separar esos pendientes del QA de un incumplimiento
del contrato de generación, que sí corresponde corregir al Recorder.

Cierre: documentar las brechas encontradas, resolver las generales con
contrapruebas en otros contextos y verificar el ciclo grabar → generar/reutilizar
→ revisar → exportar → recuperar correcciones. Mantener las limitaciones no
resueltas visibles. No exigir una aprobación golden ni una corrección de yapeo
para automatizar otro flujo.

### F6 — Evaluación transversal

Construir una matriz de casos reales de varios squads y capacidades:
navegación, formularios, permisos, filtros, listas, parámetros y aserciones.
Separar creación inicial sin salidas previas, reutilización y regeneración
después de cambios QA/framework. Incluir casos sin golden previo y reservar
familias de comportamiento para evaluar sin entregar su solución al agente.

Fijar versiones y precondiciones; medir calidad en ambas pasadas, reutilización,
conservación de cobertura, falsas alarmas, errores no detectados, consistencia,
intervención QA y ejecución funcional. Desglosar por squad, capacidad,
plataforma y modo de conexión evaluados; mostrar lo pendiente sin extender las
conclusiones a plataformas o flujos no probados. Comparar con/sin referencias y
versiones del harness en experimentos separados con el resto del protocolo fijo.

Cierre: informe reproducible de esa matriz con etiquetas QA independientes,
evidencia de generaciones reales y resultados móviles ligados a sus archivos.
Ventas, movimientos y yapeo pueden iniciar el piloto, pero pertenecen al mismo
squad y no bastan para demostrar generalización entre squads.

### Pendiente particular del QA: TC-10240

El recording inspeccionado conserva verificaciones de presencia para importe
y teléfono cuyo selector no estaba verificado. Las aserciones previas del Screen
no demostraban esos resultados de negocio. El QA debe verificar elementos y
esperados, corregir o regrabar, ejecutar y recuperar las correcciones si desea
aprobar otra revisión golden. Este pendiente se sigue por caso, separado de F5.

Se mantienen las dos pasadas automáticas. Tras ellas, el borrador con las capas
disponibles sigue siendo exportable para corrección por QA. Una aprobación
golden siempre corresponde a los bytes revisados y a una acción explícita del QA.

## Revisión y diagnósticos (F4)

Revisión muestra `preserved`, `lost` y `unverified` con las diferencias y las
correspondencias entre los índices de pasos de ambas versiones, por fila de
Examples. Los números pertenecen a los pasos Gherkin, no a las acciones Appium.
Editar código deja esa comparación pendiente de revalidación; cambiar de
recording limpia el resultado anterior.

Los diagnósticos se presentan una sola vez, agrupando las pasadas donde se
observaron. Los errores históricos que ya no aparecen tras una validación
correcta se muestran en un apartado cerrado. Eso no acredita quién los corrigió
ni altera el resultado autónomo conservado en el historial.

Las observaciones sobre la grabación y las sugerencias de diseño son alertas
para el QA. Un selector no verificado o una asociación pendiente indica revisar
la acción, corregir su comprobación o volver a grabar el tramo en el dispositivo.
No se pide al agente inventar esa evidencia. Estas alertas no cambian el score
ni bloquean exportar el borrador o la aprobación explícita de una revisión.
Las formas anteriores y actuales de `testDesignReview.issues` se muestran de
forma compatible. Cuando una sugerencia del agente afirma cubrir una acción
con selector pendiente, prevalece la advertencia derivada de la grabación.

Para los errores técnicos de conservación, `coverageRepairTargets` indica las
rutas/capas que cambiaron entre las instantáneas usadas por el comparador.
Feature/Steps corresponden a Lorem; Screen/Locators a Zorem. Si cambiaron ambos,
se dirige a ambos; una dependencia compartida o evidencia incompleta requiere
integración conservadora. La ausencia de metadata antigua nunca demuestra que
el error sea solo de Feature. Se mantienen las dos pasadas; las observaciones
QA de grabación no abren reparaciones automáticas.

El IPC entrega `reviewDiagnostics` como una proyección para presentación. Los
archivos de validación, informes originales de agentes e historial mantienen
sus diagnósticos completos. Fallar al leer un informe opcional no impide revisar
ni exportar el código preparado. No hay canales de filesystem nuevos en el
renderer ni aprobación automática de golden.

## Verificación

- `tests/caseCoverage.test.js`: contrato puro, redacción, operaciones, datos,
  repeticiones, dependencias, ambigüedad y controles contra falsos positivos.
- `tests/caseCoverageSnapshot.test.js`: autoridad del baseline, overlay aislado,
  imports, lectura única, rutas y symlinks.
- `tests/caseCoverageIntegration.test.js`: misma decisión en merge y validación,
  aserción eliminada con frase intacta y reparación con equivalencia pendiente.
- `tests/parameterizedBehaviorReuse.test.js`: parámetros directos, Examples,
  conservación de tipos/orden/aserciones y rechazos conservadores.

La ejecución completa de calidad y la auditoría del caso local se registran en
[AGENT_EVALUATION_PROGRESS.md](AGENT_EVALUATION_PROGRESS.md).
