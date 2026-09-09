# Evaluación de generación, aceptación y reutilización

## Qué afirma cada resultado

- `static`: el validador no detectó errores en los archivos examinados.
- `acceptance`: cumplimiento **estático de la implementación** de los criterios
  estructurados confirmados por QA. Un rango implementado no acredita que se
  haya ejecutado correctamente en un dispositivo.
- `functional`: requiere evidencia de ejecución. El piloto de generación lo
  deja `not-evaluated`; no ejecuta Appium ni declara éxito a partir de código.
- `qaDeclaredFunctional`: declaración QA de una revisión golden aprobada,
  identificada por versión, revisión y hash. Incluye correcciones humanas y no
  altera el resultado autónomo original. `qaDeclaredAutonomousFunctional` exige
  además los mismos archivos y revisión originales sin corrección QA.

Todos los cocientes publican numerador, denominador, tasa anulable y cantidad no
medida. Los intentos interrumpidos o sin salida permanecen en el denominador de
terminación y éxito sobre intentos iniciados. Las observaciones antiguas sin
historial no se convierten en intentos medidos. El campo heredado
`autonomousFinal` continúa siendo una métrica **estática**; para el cumplimiento
implementado del caso usar `autonomousTaskSuccess` junto con su cobertura.

```bash
npm run agents:evaluate -- --recordings /ruta/recordings --golden-root /ruta/recorder/tests/golden --output /ruta/evaluation.json
```

El informe `agent-evaluation/v3` acepta un assessment solo cuando procede de un
artefacto del Recorder en el historial inmutable y su `artifactHash` coincide con
los archivos finales. La importación usa `prepared-response.json`; la generación
por capas conserva además sus invocaciones previas. Revalidar una edición QA no
se atribuye al agente.

## Precisión y recall de reutilización

Las etiquetas las revisa QA de manera independiente del resolver. Ejemplo:

```json
{
  "caseId": "TC-10140",
  "groups": [
    { "sequences": [1, 2, 3], "expected": "reuse", "method": "userViewAllMovements", "screenFile": "screenobjects/payment/movements.screen.ts" },
    { "sequences": [4], "expected": "create" }
  ]
}
```

`baseline-files.json` es una lista `{path, content}` tomada del commit del
framework **anterior** a la generación. No usar el checkout después de exportar,
porque acreditaría como existente el código recién creado.

```bash
npm run reuse:evaluate -- --plan generation-plan.json --labels labels.json --response agent-response.json --baseline baseline-files.json --output reuse-report.json
```

Se comprueba la secuencia, el método, la preservación de su código respecto del
baseline y su invocación desde un Step con import correcto, presente en el TC objetivo del Feature final. El evaluador acotado admite Steps literales sin argumentos; las variantes parametrizadas requieren evaluación específica. No basta la decisión
del plan ni un método sin uso. Sin artefactos finales/baseline/etiquetas suficientes
la métrica queda sin evaluar. `plannedDecisionAudit` mantiene el diagnóstico de
las decisiones planificadas, separado del resultado medido. La métrica estática
no verifica helpers transitivos, estado del dispositivo ni ausencia de todos los
efectos secundarios; debe acompañarse de la validación de reutilización del
pipeline y la ejecución funcional.

## Fallos controlados del validador

```bash
npm run validator:evaluate -- --golden-root /ruta/recorder/tests/golden --framework /ruta/framework --output /ruta/mutations.json
```

El runner usa el commit local fijado por cada golden en un directorio temporal,
restaura sus baselines y conserva las publicaciones sin modificaciones. La
etiqueta de control es el veredicto estático aprobado históricamente, no el
resultado actual del validador. Si ahora discrepa, cuenta como discrepancia del
control y exige revisión QA de esa etiqueta antes de interpretar precisión.
No inyecta mutaciones sobre un baseline que ya falla.

Las mutaciones disponibles duplican un TC, cambian el TypeLocator del getter de
la plataforma grabada, o eliminan una aserción de texto. No se aplica reparación
automática. El código esperado se fija antes de validar: fallar por otro código
no acredita la detección del defecto buscado. Los patrones no aplicables se
reportan como `unsupported`; un caso no reproducible queda sin evaluar.

El cambio de rango 30→90 y otras reglas nuevas requieren fixtures con el criterio
QA declarado y pruebas de regresión específicas. El runner no inventa criterios
faltantes en golden anteriores. Las pruebas unitarias del validador cubren esos
contratos; el pass rate de estas pruebas no es el éxito de los agentes.

## Piloto con generaciones nuevas

`agents:pilot` tiene dos operaciones separadas. Preparar un protocolo no invoca
Copilot. Ejecutarlo requiere otra invocación con `--execute`. Nunca modifica el
framework compartido ni publica casos golden. Las salidas quedan conservadas en
el directorio del piloto para su revisión.

Crear un archivo de configuración con rutas absolutas:

```json
{
  "framework": "/ruta/framework",
  "frameworkCommit": "HASH_COMPLETO_DE_UN_COMMIT_LOCAL",
  "goldenRoot": "/ruta/recorder/tests/golden",
  "model": "claude-sonnet-5",
  "repetitions": 3,
  "cases": [
    { "caseId": "TC-10140", "scenario": "/ruta/recording/scenario.json" }
  ]
}
```

```bash
npm run agents:pilot -- --config /ruta/pilot-config.json --directory /ruta/piloto-nuevo
npm run agents:pilot -- --directory /ruta/piloto-nuevo --execute
npm run agents:pilot -- --directory /ruta/piloto-nuevo --report
```

Antes de ejecutar, revisar el manifest: grabaciones, commit, modelo, hash del
código que construye prompts/contratos, versiones golden y número de pruebas.
Cada caso tiene dos brazos (con/sin referencias) y 3 o 5 repeticiones por brazo.
Un caso con tres repeticiones supone seis generaciones, cada una con un máximo
de dos pasadas automáticas. El orden de los brazos se alterna por repetición.

Cada prueba arranca de un `git archive` del commit y un runtime nuevo. Copia solo
`scenario.json`, nunca paquetes, planes, respuestas ni correcciones de otro
intento. Utiliza `AutomationPackageBuilder`, `CopilotCliAdapter` y
`LayeredGenerationOrchestrator` reales, con el validador oficial. El runner no
instala dependencias ni configura dispositivos: las validaciones que requieran
dependencias ausentes lo reportarán como tal. Esas observaciones no demuestran
éxito funcional. Los casos con gaps bloqueantes se conservan como fallos de
preparación, antes de invocar el modelo.

El corpus se copia y fija por hash. Se establece `RECORDER_GOLDEN_PURPOSE=evaluation`:
el recuperador excluye el propio TC, el recording propio y las publicaciones
reservadas `usage=evaluation` de **todos** los contextos entregados al agente.
Los casos de evaluación elegidos deben ser revisados por QA; el comando no
promueve grabaciones a holdout ni golden. Es conveniente ampliar el corpus y
mantener casos reservados antes de extraer conclusiones generales.

Cada invocación registra el hash del prompt, modelo solicitado, modelos realmente
reportados y versión del proveedor. Un modelo real desconocido/diferente no
acredita éxito autónomo comparable. Si cambian inputs, código o corpus, preparar
otro protocolo. `--report` detecta intentos iniciados sin resultado y verifica
que las observaciones y respuestas conservan sus hashes. No se sobrescriben
pruebas previas ni se reinicia automáticamente una ejecución interrumpida.

El informe ofrece pass rates separados de estructura y aceptación implementada,
éxito autónomo sobre pruebas programadas, todos los intentos correctos por caso,
esfuerzo QA disponible e interrupciones. La consistencia compara cumplimiento
semántico, no igualdad literal del código. La ausencia de evidencia funcional
permanece visible. Las pruebas automatizadas del runner usan un proveedor
simulado: prueban aislamiento, contratos y límite de pasadas, sin atribuir esos
resultados al LLM.

### Comprobación final y modos de ejecución

El éxito autónomo del piloto exige simultáneamente `pipelinePassed=true`, preview
preparado, compilación comprobable, validación estática y criterios implementados
aprobados. Una respuesta guardada antes de que falle una interfaz entre autores
no acredita éxito aunque sus comprobaciones locales pasen. `pipelineError`
conserva el fallo del orquestador.

Tras la generación, el runner aplica `AutomationApplier.prepare` sin escribir al
framework, vuelve a validar los bytes preparados y ejecuta
`FrameworkCompilationValidator` con el mismo overlay que la aplicación.
Conserva el JSON original, `pilot-prepared-response.json`, sus hashes y el
informe de compilación. Dependencias ausentes producen `unavailable` y no
permiten acreditar éxito. La compilación con errores exclusivamente heredados
se distingue de una compilación limpia.

`roleExecution` muestra, por rol y pasada, invocaciones, ejecución determinista,
caché y revisión de diseño. `forceRegenerate` invalida cachés; no fuerza autores
cuando todo su trabajo ya está resuelto por el framework. El piloto conserva
esa decisión: no abre gaps ni invoca un LLM para aparentar una generación nueva.
Un rol sin invocación tiene cero llamadas; sin llamadas de proveedor no se
acredita una medición del modelo.

Tanto `--execute` como `--report` verifican el digest del manifest, las entradas
fijadas y el snapshot golden. Reportar un piloto histórico no exige que la
versión actual del Recorder coincida; ejecutar sí exige el código fijado.

### Alcance del replay del resolver

`golden-replay/v2` compara decisiones del resolver. El control no bloqueante
`gap-regeneration-refinement` de tipo `refinement`, único y declarado en un plan
con reconciliación, procede del PackageBuilder después de resolver. Se conserva
completo en `recordedRegenerationControls`, en el snapshot aprobado y en el plan
usado para validar los archivos, pero no se exige que un resolver inicial lo
invente. Cualquier otro gap o cambio de ruta, operación, locator o resolución
sigue produciendo discrepancia. Un catálogo capturado durante la aprobación que
ya contenga el resultado exportado puede no reproducir el plan original: esa
deriva permanece visible y no autoriza reescribir el golden esperado.
