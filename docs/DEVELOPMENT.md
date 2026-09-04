# Desarrollo

## Requisitos

- Node.js 24+ y npm 11+, siguiendo `engines` de `fwk-mobile-test`.
- El runtime Appium 3, `@appium/base-driver` y los drivers
  UiAutomator2/XCUITest pertenecen al recorder, están fijados por
  su lockfile y no dependen del árbol npm del framework padre.
- Android local: Java 17+, Android SDK/ADB y UiAutomator2.
- BrowserStack o iOS local no requieren Java por sí mismos.

Instalación:

```bash
cd visual-recorder
npm ci
git submodule update --init --recursive vendor/appium-inspector
npm run inspector:build
```

Después de actualizar usa `npm ci` desde la raíz del recorder. Este comando
instala el runtime móvil y la interfaz sin modificar el framework elegido.

No uses `--ignore-scripts`: Electron necesita su script de instalación para
descargar el binario nativo de macOS. Si una instalación anterior lo omitió,
puede repararse con `npm rebuild electron`.

El fork controlado está fijado en
`eda9016ca23fb8b6f021063f560ba6724eae3716` de la rama
`feature/manual-locator-adoption`. No se usa
`appium-inspector-plugin`, una instalación global ni un bundle opaco
versionado. `inspector:build` ejecuta `npm ci` y `npm run build:browser` dentro
del submódulo, compila `VITE_EMBEDDED_HOST_ORIGIN=appium-recorder://host` y
copia el resultado a `node_modules/.cache`.

## Comandos

| Comando | Uso |
|---|---|
| `npm run recorder` | Compila, abre Electron e inicia el Appium embebido |
| `npm start` | Compila y abre Electron |
| `npm run build` | Compila main y renderer |
| `npm run package:mac` | Genera el `.app` sin firma y lo selecciona en Finder |
| `npm run dmg:mac` | Genera el instalador DMG sin firma para pruebas internas |
| `npm run inspector:build` | Instala y compila el fork fijado en la caché local |
| `npm run inspector:check` | Comprueba el commit y los assets embebidos |
| `npm run typecheck` | Valida TypeScript de ambos procesos |
| `npm test` | Compila main y ejecuta pruebas Node |
| `npm run quality:metrics` | Calcula métricas y umbrales |
| `npm run architecture:check` | Bloquea ciclos nuevos e imports que violan los módulos |
| `npm run quality` | Puerta completa: tipos, tests, métricas y build |
| `npm run codegraph:recorder -- --search X` | Consulta dependencias internas |
| `npm run codegraph:export -- --squad X` | Exporta subgrafo del target |
| `npm run phase43:refresh-canonical` | Regenera los golden canónicos de `tests/fixtures/phase43/*` |
| `npm run test:phase43:deterministic` | Ejecuta regresión determinística L1 sin agente real |
| `npm run test:phase43:baseline` | Corre baseline completo y escribe clasificación en `runtime/phase43/` |

Flags útiles del pipeline agentic:

- `RECORDER_AGENT_EXECUTION_MODE=manual|automatic` (default `automatic`).
- `RECORDER_AGENT_PIPELINE=layered|deterministic` (default `layered`). El modo
  `layered` ejecuta Derek → Lorem → Zorem → Sumrak;
  `deterministic` conserva temporalmente el orquestador anterior.
- `RECORDER_GENERATION_MODE=deterministic|legacy` (default `deterministic`).
  `legacy` se conserva solo para diagnóstico; solicita al agente las cuatro
  capas completas y no debe usarse en el flujo normal del QA.
- `RECORDER_AGENT_MULTI_GAP_STRATEGY=compact-case|per-gap-parallel` (default
  `compact-case`). `per-gap-parallel` se usa solo para diagnóstico o pruebas
  dirigidas.
- `RECORDER_AGENT_RELAXED_CONTRACT=1` activa modo experimental: omite los
  rechazos `create-locator-contract` y `trace-screen-method` durante la
  validación para priorizar velocidad/iteración. Default desactivado.
- `RECORDER_AGENT_QUERY_RESULT_MAX_ITEMS` y
  `RECORDER_AGENT_QUERY_RESULT_MAX_STRING` compactan el payload de
  `query-results` que viaja en el prompt de PASS 2 (defaults `12` y `320`),
  reduciendo latencia sin alterar los artifacts del paquete.
- El pipeline `layered` genera un `agents/<rol>/agent-memory.json` independiente
  para Lorem, Zorem y Sumrak. Usa `layered-generation-run.json` para comparar
  `contextBytes`, `contextFiles`, `assignedLayers` y `cacheHit` por etapa antes
  de ampliar contexto; un caso idéntico validado debe resolverse desde el caché
  completo sin iniciar nuevas sesiones de Copilot.
- `RECORDER_COPILOT_CLI_COMMAND` y `RECORDER_COPILOT_CLI_ARGS` para adaptar
  el comando del provider sin tocar código.
- `RECORDER_COPILOT_MODEL` para definir el modelo del provider cuando
  `RECORDER_COPILOT_CLI_ARGS` no incluye `--model` (default `auto`).
  La selección explícita del wizard prevalece sobre ambos para esa ejecución,
  sin modificar variables de entorno. El modo troll mantiene su configuración
  independiente. La UI permite Auto u otro ID de `/model`, sin catálogo estático.
  Por defecto el adapter usa:
  `copilot -p "<prompt>" --output-format json --model auto` más `--agent`
  y `--name Derek/<recordingId>/<agente>` para cada sesión, y los permisos
  compartidos de `copilotPermissions.ts`: `--add-dir <paquete>`,
  `--allow-tool=read`, `--allow-tool=write`, `--allow-tool=shell(node)`,
  `--allow-tool=shell(python)`, `--allow-tool=shell(python3)` y
  `--no-custom-instructions`. La terminal visible usa la misma política;
  no se añade `--deny-tool=bash`, que interfería con los comandos auxiliares.
  `allowValidationScripts: false` conserva lectura/escritura y deniega shell
  para la sesión de presentación del roast. Los overrides explícitos del
  usuario en CLI_ARGS se conservan; una denegación tiene precedencia.

Estos flags no suprimen autenticación ni confianza inicial de carpeta, ni
constituyen aislamiento de los intérpretes. No se modifica la configuración
global de Copilot ni se aprueban URLs o rutas globalmente.

## Wizard de finalización (UX producto)

El helper privado `review/copilotModelControls.js` gestiona preferencia,
selección y presentación del modelo. La feature conserva una única fábrica
pública y los helpers privados no pueden importar otras features ni core.
`get-automation-model-usage` expone solo los metadatos del paquete activo.

La terminal recibe un UUID nuevo con `--session-id`. `CopilotModelEvents` lee
incrementalmente únicamente `events.jsonl` de ese UUID bajo `COPILOT_HOME`
(por defecto `~/.copilot`). Conserva solo los IDs en eventos
`session.auto_mode_resolved`, `assistant.message` y `tool.execution_start`;
descarta contenido, instrucciones y modelos auxiliares de routing. Es una
integración tolerante a cambios del CLI: datos ausentes no bloquean el caso.

En el modo predeterminado `layered`, el flujo visible de finalización es:

1. Evidencia
2. Análisis
3. Generación
4. Revisión

La ejecución es automática (sin paso "Agente" en el happy path): análisis,
coordinación de Derek, autoría de Feature/Steps por Lorem, autoría de
Screen/Locators por Zorem, integración de Sumrak, validación y revisión. Los
tres delegados usan Copilot CLI headless con perfiles propios y permisos
limitados al workspace de su etapa; no se abre Terminal ni se espera
interacción del QA. Sumrak no es propietario del código: el recorder
reconstruye sus cuatro archivos desde los resultados protegidos de Lorem y
Zorem. Cada
versión JSON completa se entrega también al validador oficial aunque incumpla el schema:
este publica `validation-feedback.json` y mantiene la sesión abierta hasta que
Copilot escriba una corrección o se alcance el límite de reparación.
En el pipeline por capas, `repair-feedback.json` cumple ese mismo papel para
Lorem y Zorem. Derek vuelve a comprobar la última escritura incluso si Copilot
ya cerró y, si continúa inválida, relanza solo ese autor como
`.../repair-1/feedback-N`. La traza provisional siempre sale del resultado
vigente de Lorem, nunca de un borrador anterior de Sumrak.

El pipeline usa fingerprints de contenido para reutilizar resultados válidos de
Lorem y Zorem cuando no cambiaron recording, plan, baselines, prompt o modelo.
El caché vive en `generation/.agent-cache`, por lo que sobrevive a la
reconstrucción de `generation/automation`; cualquier cambio de contenido genera
otra clave y evita reutilizaciones obsoletas.
Los inputs se proyectan por responsabilidad: Lorem no recibe contratos ni
baselines exclusivos de Screen/Locators, y Zorem no recibe baselines de
Feature/Steps. En reparación, Zorem solo se relanza por feedback de interacción
o cuando cambió la interfaz de `actionTrace`. Derek integra sin invocar Sumrak si
todos los gaps abiertos son extensiones de artefactos ya decididas por el plan.
Antes de invocar Copilot, el recorder crea `deterministic-draft.json` con una
propuesta rápida de las cuatro capas. A Lorem se copia únicamente Feature/Steps
y a Zorem únicamente Screen/Locators. Es una referencia editable: plan,
candidatos autorizados y validadores siguen siendo la autoridad. Los paquetes
de agentes ya no reciben `unresolved-context.json`; su contenido histórico está
cubierto por `gaps.json`, `query-results.json` y los contextos proyectados.

QA Roast Mode no altera esa pasada. Cuando `testDesignReview` termina en
`qa-required` y la preferencia está activa, el renderer envía `qaRoastMode` por
IPC y el proceso principal ejecuta una segunda llamada headless mediante el
adapter controlado. Esta llamada solo puede crear `qa-roast-response.json`; si
falla, el wizard presenta el diagnóstico técnico sin roast.

El progreso de ese pipeline lo emite `main.ts` por IPC (`automation-progress`) y
el renderer solo refleja los estados backend (`ANALYZING`, `RESOLVING_CONTEXT`,
`RESOLVING_DECISIONS`, `WAITING_FOR_QA`, `GENERATING`, `VALIDATING`,
`READY_FOR_REVIEW`, `APPLYING`, `COMPLETED`, `FAILED`).

Cuando aparece `WAITING_FOR_QA`, la decisión humana se confirma en el mismo
wizard (`get-automation-qa-decisions` + `resolve-automation-qa-decisions`) y el
pipeline continúa sin salir del flujo principal.

Las herramientas técnicas (carpeta runtime, prompt, import manual, terminal) se
mantienen en **Opciones avanzadas / diagnóstico** y no forman parte del flujo
principal de QA.

Para una propuesta ya válida, **Revalidar** y **Reimportar corrección del
agente** vuelven a leer `agent-response.json` y reemplazan el preview actual.
Los cambios locales no aplicados del editor se descartan para que la corrección
externa de Copilot sea visible y se valide exactamente como quedó en el paquete.
La reimportación usa `package-provenance.json`; no recalcula el escenario contra
los archivos que la primera aplicación acaba de crear. Si ya se aplicó una
versión, `application-receipt.json` comprueba que las rutas destino no hayan sido
editadas fuera del recorder antes de aceptar o volver a aplicar la corrección.

Si Copilot no modifica una propuesta inválida, **Usar generación anterior**
permite abrir sus cuatro capas en Revisión y editarlas. En ese modo
**Revalidar** valida el contenido del editor sin consumir otra reparación y
**Aplicar automatización** permanece bloqueado hasta que la validación sea
correcta.

Notas de validación:

- `non-english-identifier` queda como warning (visible en `validation.json`) y
  deja de bloquear `readyForPr`.
- Si el Feature llega sin `@android`/`@ios` requeridos por cobertura real, el
  recorder los agrega de forma determinista antes de validar.

Los grafos y métricas se guardan en `runtime/` y no se versionan.

## Workspace y agente

No existe configuración `.env` propia del recorder. En desarrollo se reutiliza
el framework padre si el clon está dentro de `tools/visual-recorder`; en caso
contrario se usa el workspace persistido o se solicita una raíz válida. Copilot
es el único proveedor presentado por el flujo de automatización.

Las credenciales BrowserStack se administran desde la pantalla de conexión y
nunca deben añadirse a archivos versionados.

## Estrategia para modificar

### Cambio de UI

1. Localiza componente e IDs relacionados con CodeGraph.
2. Identifica qué feature bajo `recorder/renderer/src/features/<nombre>/`
   posee ese ID (ver el mapa en `docs/ARCHITECTURE.md`) y revisa sus
   bindings; `recorderController.js` es solo el composition root que las
   monta.
3. Mantén scroll en el contenedor que posee la altura, con ancestros flex/grid
   usando `min-height: 0` cuando corresponda.
4. Ejecuta typecheck y build del renderer; añade o actualiza la prueba de la
   feature afectada si cambia comportamiento.

### Cambio IPC

Actualiza como una sola unidad:

1. handler y validación en el archivo de su familia bajo `recorder/src/ipc/`
   (`workspaceHandlers.ts`, `sessionHandlers.ts`, `inspectorHandlers.ts`,
   `interactionHandlers.ts`, `automationHandlers.ts` o
   `generationHandlers.ts`; `main.ts` solo construye servicios/estado y
   registra la familia, nunca declara el handler);
2. exposición en `preload.ts`;
3. tipo en `renderer/global.d.ts`;
4. consumidor;
5. pruebas de payload, error y resultado.

Nunca expongas `ipcRenderer` completo ni una función de filesystem genérica.

### Cambio de generación

1. Añade un caso unitario que describa la salida esperada.
2. Actualiza generator y validator, no los outputs manuales.
3. Prueba nombres, parámetros, ambas plataformas y conflictos.
4. Comprueba preview token, reviewed contents y rollback.
5. Ejecuta `npm run quality`.

### Cambio del pipeline de agente

1. Mantén los contratos JSON versionados en `automationContracts.ts`.
2. Resuelve localmente selector, reuse, rutas y trazabilidad antes del agente.
3. No aumentes los presupuestos de 20 KB, 5 minutos y una reparación sin una
   decisión explícita y métricas comparables.
4. Añade pruebas de resolver, paquete, validator y memoria.
5. Un resultado solo entra a memoria después de escritura revisada y score 100.

### Cambio de driver o gestos

WebDriver/Appium y BrowserStack no soportan siempre los mismos `mobile:`
commands. Prefiere comandos W3C portables y conserva fallback explícito por
plataforma/proveedor. Un 404 `unknown command` es incompatibilidad del endpoint,
no necesariamente desconexión.

## Pruebas y calidad

Las pruebas viven en `tests/*.test.js` y consumen el JavaScript compilado. Por
eso `npm test` ejecuta `build:main` primero. Cubre al menos:

- normalización de selectores Android/iOS;
- resolución y aislamiento del workspace;
- análisis de impacto y cobertura;
- contenido y nombres de las cuatro capas;
- rutas rechazadas y archivos protegidos;
- token de preview, edición revisada y escritura atómica;
- API IPC cuando se cambie el bridge.
- límites de contexto/SLA, trazabilidad y promoción exclusiva de calidad 100.
- casos encadenados sin commitear (`chainedGenerationWithoutCommit.test.js`):
  el caso B reutiliza y amplía de forma aditiva lo que el caso A dejó en el
  working tree del framework.

Los tests que leen o escriben el destino (`automationPipeline`, `phase43`,
casos encadenados) usan `tests/helpers/isolatedFramework.js`:
copia el estado commiteado del framework padre (`git archive HEAD`) a una
carpeta temporal y reconfigura el workspace hacia ella, con su propio runtime
y registro de archivos generados. Así no dependen de lo que el QA tenga sin
commitear ni tocan el framework real. `tests/helpers/applyAutomationResponse.js`
reproduce fuera de Electron el flujo de `generate-automation-response`.

El procedimiento completo, umbrales y controles manuales están en
[`GENERATION_QUALITY_ASSURANCE.md`](GENERATION_QUALITY_ASSURANCE.md).

Para Fase 4.3, usa primero `test:phase43:deterministic` para validar
invariantes contractuales con fixtures estables y luego `test:phase43:baseline`
para capturar el estado real de la suite y clasificar fallos en
`PREEXISTING_CONFIRMED` o `PHASE_4_2_REGRESSION`.

## Integración continua

`.github/workflows/quality.yml` ejecuta la misma puerta que `npm run quality`
en cada PR y en `main`. Como las suites que leen el destino necesitan el
framework padre, el job clona `yaperos/fwk-mobile-test` (repositorio privado:
requiere el secreto `FWK_MOBILE_TOKEN` con permiso de lectura) y anida el
checkout del recorder en `tools/visual-recorder`. `engines` en `package.json`
fija Node 22+ / npm 10+, el mínimo con el que corre la suite completa.

## Git e higiene

Antes de entregar:

```bash
git status --short
npm run quality
```

No incluyas `.env`, credenciales, sesiones, screenshots, workspaces, grafos,
coverage, `dist`, `renderer-dist` ni dependencias. Conserva cambios ajenos en un
worktree sucio y evita comandos destructivos.
