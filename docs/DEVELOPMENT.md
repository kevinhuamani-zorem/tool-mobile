# Desarrollo

## Requisitos

- Node.js 24+ y npm 11+, siguiendo `engines` de `fwk-mobile-test`.
- El runtime Appium 3 y los drivers UiAutomator2/XCUITest pertenecen a
  `fwk-mobile-test` y se reutilizan desde su `node_modules`. El recorder valida
  que los tres paquetes y una versión compatible de `@appium/base-driver`
  estén instalados antes de iniciar.
- Android local: Java 17+, Android SDK/ADB y UiAutomator2.
- BrowserStack o iOS local no requieren Java por sí mismos.

Instalación:

```bash
cd tools/visual-recorder
npm install
```

En una instalación reproducible o después de actualizar usa `npm ci` tanto en
la raíz del framework como dentro del recorder. El primer comando instala
Appium y sus drivers; el segundo instala Electron, renderer y WebdriverIO.

## Comandos

| Comando | Uso |
|---|---|
| `./run.sh` | Inicia Appium en 4723, compila y abre Electron |
| `npm start` | Compila y abre Electron |
| `npm run build` | Compila main y renderer |
| `npm run typecheck` | Valida TypeScript de ambos procesos |
| `npm test` | Compila main y ejecuta pruebas Node |
| `npm run quality:metrics` | Calcula métricas y umbrales |
| `npm run quality` | Puerta completa: tipos, tests, métricas y build |
| `npm run codegraph:recorder -- --search X` | Consulta dependencias internas |
| `npm run codegraph:export -- --squad X` | Exporta subgrafo del target |

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
2. Revisa los bindings del controlador.
3. Mantén scroll en el contenedor que posee la altura, con ancestros flex/grid
   usando `min-height: 0` cuando corresponda.
4. Ejecuta typecheck y build del renderer; añade prueba de controlador si
   cambia comportamiento.

### Cambio IPC

Actualiza como una sola unidad:

1. handler y validación en `main.ts`;
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

## Git e higiene

Antes de entregar:

```bash
git status --short
npm run quality
```

No incluyas `.env`, credenciales, sesiones, screenshots, workspaces, grafos,
coverage, `dist`, `renderer-dist` ni dependencias. Conserva cambios ajenos en un
worktree sucio y evita comandos destructivos.
