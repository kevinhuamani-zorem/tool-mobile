# Referencias QA y evaluación de agentes (F7)

Fecha: 2026-09-08. Contrato: `mobile-four-layers/v1`.

F7 conecta las versiones golden aprobadas a la generación y añade medición sobre
el historial inmutable. Aprender significa recuperar referencias y correcciones
aprobadas para el contexto del agente; no modifica los pesos del modelo ni elimina
sus posibles fallos. La memoria legacy permanece deshabilitada.

Los casos se comparten en `tests/golden/` del repositorio del recorder, también
cuando se usa la app instalada. La aprobación queda local hasta incluirla en un
commit/PR; los demás QA reciben las versiones y revocaciones con Git y los agentes
las consultan al generar. La selección de otro checkout invalida el preview QA.
Ver [configuración, versionado y actualizaciones](../tests/golden/README.md).

## Selección y responsabilidad

`goldenExamples.ts` verifica publicaciones y hashes, exige squad, plataforma,
ambiente, subruta Feature y contrato compatibles, y comprueba los bytes actuales
del framework. Ordena por coincidencia de acciones (65 %) e intención (35 %),
con coincidencia no nula en ambas. Incluye todas las referencias pertinentes, sin
recortarlas por cantidad o bytes. La compatibilidad sigue siendo conservadora: cambiar un módulo compartido puede excluir el ejemplo hasta que
QA revise y publique su versión actualizada.

El modal permite elegir **Referencia para los agentes** o **Reservado para evaluación**.
La clasificación se conserva en nuevas aprobaciones del caso; cambiarla requiere
seleccionarla explícitamente. Los casos reservados y el propio recording/caseId
se excluyen de los ejemplos. El índice muestra su uso. Antes de cada etapa se
recomprueba la autoridad; una publicación nueva sustituye a la anterior y una
revocación retira la referencia.

| Destino | Contexto golden |
| --- | --- |
| Lorem, autor y revisión de diseño | Feature/Steps aceptados y lecciones de esas capas |
| Zorem | Screen/Locators aceptados y lecciones de esas capas |
| Sumrak | Solo lecciones/relaciones verificadas vinculadas al error o gap abierto; sin archivos completos |

Los archivos `golden-examples.json` de cada workspace se registran en el manifiesto
y en `history/v1`: rol, pasada, hash, versión de selección, fingerprint del índice
y versiones efectivamente entregadas. Desde `golden-selection/v2` no hay límite
de 24 KB ni de cantidad de ejemplos. Cada autor recibe íntegros los archivos propios
de sus capas. Login, Home y helpers reutilizados se identifican como dependencias
por ruta, símbolos y hashes del código aprobado y del framework observado, junto
con el commit del framework cuando existe. Las relaciones determinan qué autor
necesita cada referencia; los renombrados recuperados conservan su identidad de
archivo propio. Los cuerpos de las dependencias permanecen en la evidencia del
golden, sin presentarse como código que el agente deba volver a generar.
Las dos pasadas por solicitud QA se mantienen. La evidencia obligatoria del
recording/framework no se recorta. Los avisos técnicos `budgetWarnings` quedan en
telemetría interna y no se muestran en la interfaz; fallos y timeouts siguen visibles.

El ejemplo aporta estructura y correcciones. El recording, plan y framework actuales
siguen autorizando datos, rutas, métodos y selectores. No habilita consultas fuera
de `GapQueryPolicy` ni sustituye el índice completo del resolver.

## Fragmentos y lecciones

La reutilización determinista usa exclusivamente golden recuperados del framework
con trazas preservadas, sin asociaciones pendientes. Además exige datos/aserciones
idénticos y una definición Gherkin única que invoque el método y ruta recuperados
en el framework actual. Recomprueba publicaciones, bytes y ambigüedad al recuperar
el fragmento. No replica decisiones `verification-semantics` de otros casos.
Un golden con trazas pendientes sigue disponible como referencia QA.

`qa-changes.json` conserva el antes/después. Cada ejemplo proyecta solo el código
aceptado y la lección de su capa: ruta corregida, motivo QA y códigos de diagnóstico
originales asociados. Si QA no registra motivo se declara esa ausencia. El código
fallido permanece como evidencia histórica y no se publica como ejemplo positivo.

Cuando una regla reaparece, el reporte la identifica por código, rol e intento.
El mantenimiento debe reproducir el fallo, revisar si la regla o el generador es
incorrecto y añadir un negativo junto con una equivalencia válida antes de cambiar
el código. F7 incorpora esa pareja para cobertura y validación de schema. Las
observaciones QA no modifican reglas globales automáticamente.

## Métricas y límites

`agents:evaluate` lee eventos y artefactos inmutables; no invoca agentes ni dispositivos.

| Medida | Numerador / denominador |
| --- | --- |
| Primera pasada autónoma | Primera pasada válida / intentos finalizados con agente y evidencia de primera pasada |
| Respuesta final autónoma | Intentos válidos / intentos finalizados con agente, incluidos fallos y timeouts |
| Intervención QA | Intentos con revisión/corrección QA registrada / intentos finalizados con agente |
| Aprobación QA después del fallo | Intentos fallidos después aprobados por QA / intentos fallidos |
| Timeout | Intentos con al menos una invocación cortada por timeout / intentos finalizados con agente |
| Recurrencia | Intentos afectados por cada código / intentos finalizados con agente |

El reporte incluye pasadas, errores por capa/regla, invocaciones reales (no cachés
ni materialización determinista), tiempo de pared del pipeline y modelos reportados.
La corrección humana no cambia el resultado autónomo anterior. `rate: null` significa
sin denominador, nunca 0 % de fallos. Los intentos legacy sin artefactos suficientes
figuran como `not-evaluated`; los errores de integridad se reportan por separado.
Las intervenciones solo son observables cuando el recorder registra la revisión;
el trabajo externo aún no recuperado no se puede medir.

La ejecución funcional y los defectos de la app se mantienen separados de la
validación estática del código generado. Aprobar o declarar ejecución desde QA no
es una prueba automática en dispositivo. Los grupos con/sin ejemplos son
observacionales: no certifican causalidad ni equivalen a un benchmark controlado.

## Comandos

```sh
npm run agents:evaluate -- --output /private/tmp/recorder-evaluation.json
npm run golden:replay -- --output /private/tmp/recorder-golden-replay.json
npm run golden:save -- <recording> --usage evaluation
```

El último comando muestra un preview; publicar requiere el `--approve <approvalDigest>`
y la revisión QA ya previstos en F6. Ambos reportes admiten `--golden-root`; evaluación
admite `--recordings` y replay `--framework`. Eval: salida 0 para observaciones con
corpus/reserva, 2 para falta de evidencia y 1 para integridad/error. Replay: salida 0
cuando coincide, 2 cuando no hay corpus y 1 para discrepancia o irreproducibilidad.

El replay exige un commit local inmutable del framework, lo extrae a un temporal
y usa el catálogo, escenario y baselines guardados. Compara el plan y el perfil
de errores del validador. No usa HEAD como sustituto, no descarga commits, no escribe
en el checkout QA y no modifica esperados. Una dependencia compartida proyectada
que no puede reconstruirse fielmente produce `unreproducible`. Una discrepancia
conserva ambos resultados y la aprobación QA.

## Cierre pendiente con QA

El chequeo local del 2026-09-08 encontró **0 golden aprobados** y **7 ejecuciones
legacy sin evidencia suficiente**. Ambos reportes devolvieron `not-evaluated`;
no existe aún una tasa observada atribuible a referencias golden.

1. QA elige 5–8 casos aprobados que cubran Android/iOS, parámetros, texto y módulos
   compartidos, y reserva parte del corpus para evaluación. No promover fixtures
   ni grabaciones antiguas por su score o por haberlas exportado.
2. Conservar commit y dependencias reproducibles, registrar el motivo de cada
   corrección y ejecutar replay. Revisar discrepancias sin cambiar los esperados
   solo para aceptar el validador.
3. Sobre las mismas entradas reservadas y baselines previos a sus soluciones,
   fijar modelo, contratos, framework y corpus. Ejecutar con ejemplos habilitados
   y con `RECORDER_GOLDEN_EXAMPLES=0` al iniciar el recorder, creando intentos
   independientes. Evitar que el framework ya contenga las soluciones reservadas;
   medir el contexto efectivamente recibido y conservar también los fallos.
4. Ejecutar el ciclo real: dos pasadas → revisar/exportar borrador → QA corrige y
   verifica → PR → recuperar/aprobar → regenerar/reexportar → nueva aprobación.
   Repetir tras cerrar/reabrir el recorder y en el runtime empaquetado `.app`.
5. Publicar tamaño de muestra, numeradores/denominadores y hallazgos. Solo entonces
   cerrar el piloto de F7; con pocos casos no extrapolar una tasa general de éxito.

## Compactación del almacenamiento

Los snapshots mantienen su manifiesto y código propio legibles; el resto de los
artefactos se conserva en `evidence.pack.gz`, sin pérdida y deduplicado por hash.
La selección, el índice y el replay admiten tanto el formato anterior como el
compacto. Ver [migración y lectura de evidencia](AUTOMATION_GOLDEN_APPROVAL.md).

La primera referencia QA compartida, `TC-10239`, conserva su aprobación original.
Su migración pasa de 72 archivos (1 413 673 bytes) a 7 (253 925 bytes), comprobando
los 72 hashes originales. En un caso similar, Lorem recibe los dos archivos de
comportamiento y Zorem los dos de interacción. Esto demuestra entrega de contexto,
no ejecución de agentes ni mejora medida de su tasa de éxito.

El replay de esta referencia ya discrepaba con el código anterior a la compactación:
el catálogo del preview no reproduce el plan original. La prueba del corpus sigue
reportándolo; no se cambiaron el expected, los diagnósticos ni la aprobación para
silenciar el fallo. Resolver esta reproducibilidad permanece pendiente del piloto.
