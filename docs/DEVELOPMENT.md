# Desarrollo

## Requisitos

- Node.js 24+ y npm 11+, siguiendo `engines` de `fwk-mobile-test`.
- El runtime Appium 3, `@appium/base-driver` y los drivers
  UiAutomator2/XCUITest pertenecen a `tools/visual-recorder`, están fijados por
  su lockfile y no dependen del árbol npm del framework padre.
- Android local: Java 17+, Android SDK/ADB y UiAutomator2.
- BrowserStack o iOS local no requieren Java por sí mismos.

Instalación:

```bash
cd tools/visual-recorder
npm install
git submodule update --init --recursive vendor/appium-inspector
npm run inspector:build
```

En una instalación reproducible o después de actualizar usa únicamente
`npm --prefix tools/visual-recorder ci` desde la raíz del framework. Este
comando instala el runtime móvil y la interfaz sin modificar el proyecto padre.
El instalador solo puede añadir una regla local a `.git/info/exclude`; nunca
edita archivos versionados del framework.

No uses `--ignore-scripts`: Electron necesita su script de instalación para
descargar el binario nativo de macOS. Si una instalación anterior lo omitió,
puede repararse con `npm --prefix tools/visual-recorder rebuild electron`.

El fork controlado está fijado en
`63f544c5afca2d89244914c165cd14434d1cfdee` de la rama
`kevinhuamani-zorem-embedded-inspector-mode`. No se usa
`appium-inspector-plugin`, una instalación global ni un bundle opaco
versionado. `inspector:build` ejecuta `npm ci` y `npm run build:browser` dentro
del submódulo, compila `VITE_EMBEDDED_HOST_ORIGIN=appium-recorder://host` y
copia el resultado a `node_modules/.cache`.

## Comandos

| Comando | Uso |
|---|---|
| `npm --prefix tools/visual-recorder run recorder` | Inicia Appium en 4723, compila y abre Electron desde la raíz del framework |
| `./run.sh` | Equivalente cuando el directorio actual es `tools/visual-recorder` |
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
- `RECORDER_COPILOT_CLI_COMMAND` y `RECORDER_COPILOT_CLI_ARGS` para adaptar
  el comando del provider sin tocar código.
- `RECORDER_COPILOT_MODEL` para definir el modelo del provider cuando
  `RECORDER_COPILOT_CLI_ARGS` no incluye `--model` (default `auto`).
  Por defecto el adapter usa:
  `copilot -p "<prompt>" --output-format json --allow-tool=write --model auto`.

## Wizard de finalización (UX producto)

En el modo predeterminado `deterministic`, el flujo visible de finalización es:

1. Evidencia
2. Análisis
3. Generación
4. Revisión

La ejecución es automática (sin paso "Agente" en el happy path): análisis,
resolución semántica si aplica, generación determinística, validación y revisión.
En macOS, Copilot se muestra en Terminal durante la pasada de generación con
`copilot -i`; al escribir una salida nueva que cumple el schema, el recorder la
importa y avanza a Revisión sin que el QA pulse un botón adicional.

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

No existe configuración `.env` propia del recorder. La instalación fija la
ubicación `fwk-mobile-test/tools/visual-recorder`; desde ella se resuelve
automáticamente el framework padre. Copilot es el único proveedor presentado
por el flujo de automatización.

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

El procedimiento completo, umbrales y controles manuales están en
[`GENERATION_QUALITY_ASSURANCE.md`](GENERATION_QUALITY_ASSURANCE.md).

Para Fase 4.3, usa primero `test:phase43:deterministic` para validar
invariantes contractuales con fixtures estables y luego `test:phase43:baseline`
para capturar el estado real de la suite y clasificar fallos en
`PREEXISTING_CONFIRMED` o `PHASE_4_2_REGRESSION`.

## Git e higiene

Antes de entregar:

```bash
git status --short
npm run quality
```

No incluyas `.env`, credenciales, sesiones, screenshots, workspaces, grafos,
coverage, `dist`, `renderer-dist` ni dependencias. Conserva cambios ajenos en un
worktree sucio y evita comandos destructivos.
