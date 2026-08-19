# AGENTS.md — Appium Visual Recorder

Este archivo aplica a todo `tools/visual-recorder`. Su objetivo es que una IA o
persona pueda modificar el recorder sin romper sus contratos de seguridad,
generación o compatibilidad con `fwk-mobile-test`.

## Antes de cambiar código

Lee, en este orden:

1. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
2. [`docs/GENERATION_CONTRACT.md`](docs/GENERATION_CONTRACT.md)
3. [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)
4. [`docs/OPERATIONS_AND_TROUBLESHOOTING.md`](docs/OPERATIONS_AND_TROUBLESHOOTING.md)
5. El documento específico de calidad enlazado desde `docs/README.md`.

Usa `npm run codegraph:recorder -- --search <símbolo>` o `--ipc <canal>` antes
de leer módulos grandes. El grafo es una ayuda de navegación, no reemplaza leer
el código afectado.

## Fuentes de verdad

- `core/`: dominio, workspace, generación, validación y drivers.
- `recorder/src/`: proceso principal de Electron, preload e inspector.
- `renderer/`: aplicación React y controlador de interacción.
- `tests/`: contratos ejecutables.
- `docs/`: arquitectura y procedimientos vigentes.
- `config/*.example.*`: configuraciones versionables de ejemplo.

No edites como fuente:

- `dist/` y `renderer-dist/`: artefactos de build; pueden contener archivos
  obsoletos hasta una compilación limpia.
- `runtime/`, `workspace/`, `coverage/` y `test-results/`: salidas locales.
- `node_modules/`.
- `.env`, `config/workspace.json`, credenciales o archivos de sesión.

No modifiques archivos del proyecto destino generado salvo que la tarea lo
solicite expresamente. Los cambios del recorder deben hacerse en sus
generadores, validadores o plantillas.

## Invariantes arquitectónicos

1. **Electron mantiene el límite de privilegios.** El renderer no accede a
   Node, filesystem, procesos ni credenciales. Toda capacidad privilegiada pasa
   por una función explícita de `preload.ts` y un handler IPC validado en
   `main.ts`.
2. **El renderer es React, pero conserva un controlador imperativo.** Los `id`
   del JSX usados por `renderer/controller/recorderController.js` son parte del
   contrato. No los renombres ni elimines sin actualizar bindings y pruebas. No
   registres listeners duplicados al remontar componentes.
3. **Las rutas se resuelven centralmente.** Usa `core/projectPaths.ts` y el
   `WorkspaceAdapter`; no derives la raíz con `cwd`, padres relativos o rutas
   absolutas nuevas.
4. **Los tres modos deben seguir aislados:** `fwk-mobile`, `standalone` y
   `neutral`. El modo neutral no promete las cuatro capas. Nada se escribe fuera
   del target autorizado o del `runtime/` del recorder.
5. **Preview antes de escritura.** Generar requiere el token del preview exacto.
   Si cambian acciones, Gherkin, metadatos, rutas o contenido revisado, el token
   debe invalidarse.
6. **No hay sobrescritura arbitraria.** Conserva validación de rutas, escritura
   atómica, hashes y el registro de archivos generados. Un archivo externo o
   alterado fuera del recorder no se reemplaza silenciosamente.
7. **Un locator lógico sirve a ambas plataformas.** Android e iOS comparten el
   nombre y actualizan exclusivamente su bloque de plataforma.
8. **Los Steps solo orquestan.** La interacción Appium vive en Screen Objects y
   helpers. Una definición Given/When/Then llama métodos del Screen Object.
9. **La validación de impacto ocurre al continuar desde Gherkin.** No se
   reutilizan ni modifican steps ajenos automáticamente. Un conflicto debe
   mostrar escenarios y squads impactados para que el usuario cree otro texto.
10. **Generación local y determinista.** No agregues Gemini, otro proveedor de
    IA ni envío de código/secretos a servicios externos sin una decisión
    explícita del usuario y un diseño de seguridad aprobado.
11. **Local y BrowserStack son caminos soportados.** Un cambio de gestos,
    capabilities, selectores o sesión debe considerar Android/iOS y ambos tipos
    de conexión.

## Convenciones de generación

- ID de escenario: `TC-<número>`, por ejemplo `TC-10239`; no volver a `CP_01`.
- Nombre: `[TC-10239][Happy Path|Unhappy Path][AUTO-FRONT] descripción`.
- Capas: Feature, Steps, Screen Object y Locators según
  `docs/GENERATION_CONTRACT.md`.
- Los nombres de archivos, módulos, métodos y variables deben ser estables,
  legibles y normalizados; no dependas de índices visuales como `view_93` si
  existe semántica suficiente.
- La búsqueda compartida conserva el orden squad → commons → home → global.
- Nunca registres valores de `.env`, username/access key de BrowserStack ni
  datos sensibles en logs, previews o errores.

## Flujo obligatorio para cambios

1. Inspecciona `git status` y preserva cambios ajenos.
2. Consulta el grafo y lee todos los módulos directamente afectados.
3. Cambia la mínima superficie necesaria.
4. Agrega o actualiza pruebas para cada contrato modificado.
5. Ejecuta primero pruebas focalizadas y luego `npm run quality` antes de
   entregar cambios que afectan generación, IPC, workspace o drivers.
6. Revisa que no se hayan agregado secretos ni artefactos generados.
7. Actualiza esta documentación si cambia un contrato, comando, ruta o flujo.

Para una corrección exclusivamente visual puede bastar `npm run typecheck` y
`npm run build:renderer`, pero documenta cualquier prueba omitida. No declares
completo un cambio de generación sin ejecutar la puerta de calidad completa.

## Criterio de terminado

- El comportamiento solicitado está implementado y verificable.
- No se debilitó el sandbox de Electron ni la validación de outputs.
- Las pruebas nuevas y existentes pasan.
- `npm run quality` conserva los umbrales definidos.
- Los modos no involucrados no presentan regresiones obvias.
- Documentación y ejemplos coinciden con el código actual.

## Git

Al crear commits para este proyecto, no agregues trailers `Co-authored-by`.
