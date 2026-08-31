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

No edites como fuente:

- `dist/` y `renderer-dist/`: artefactos de build; pueden contener archivos
  obsoletos hasta una compilación limpia.
- `runtime/`, `coverage/` y `test-results/`: salidas locales.
- `node_modules/`.
- credenciales o archivos de sesión.

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
4. **El target es únicamente el framework padre.** El recorder debe vivir en
   `fwk-mobile-test/tools/visual-recorder`; no admite modo standalone, neutral
   ni una raíz configurable. Nada se escribe fuera del framework validado o del
   `runtime/` del recorder.
5. **Preview antes de escritura.** Generar requiere el token del preview exacto.
   Si cambian acciones, Gherkin, metadatos, rutas o contenido revisado, el token
   debe invalidarse.
6. **No hay sobrescritura arbitraria.** Conserva validación de rutas, escritura
   atómica, hashes y el registro de archivos generados. Un archivo externo o
   alterado fuera del recorder no se reemplaza silenciosamente.
7. **El QA aporta contexto, no texto contractual.** Durante una grabación el
   formulario captura `contextHint` (`elementIntent` solo existe por
   compatibilidad). Es una pista libre para comprender el elemento y resolver
   reutilización/nombres; nunca se copia literalmente como Step. El Gherkin se
   sintetiza con el objetivo, criterio de aceptación y secuencia completa. Un
   locator lógico sirve a ambas plataformas y cada ejecución actualiza
   exclusivamente su bloque de plataforma.
8. **Los Steps solo orquestan.** La interacción Appium vive en Screen Objects y
   helpers. Una definición Given/When/Then llama métodos del Screen Object.
9. **El preprocesador decide antes que el agente.** Selectores verificados,
   rutas, orden de acciones y reutilización exacta en squad/Home son decisiones
   deterministas. El agente solo resuelve los gaps declarados en el plan.
   Las consultas obedecen **NO SEARCH WITHOUT GAP**: pasan por
   `GapQueryPolicy`, deben estar autorizadas por el gap abierto y respetar su
   presupuesto; un gap bloqueante del QA nunca habilita búsquedas del agente.
10. **IA opt-in y contexto mínimo.** Copilot solo se ejecuta por una
    decisión explícita del usuario. Reciben el paquete confinado bajo
    `runtime/recordings`, sin secretos, y no deben explorar el target ni leer
    XML/capturas salvo que un gap puntual lo exija. En macOS la pasada que
    genera la salida se muestra con `copilot -i` y el prompt exacto del
    recorder; el backend espera un artefacto nuevo válido por schema antes de
    importarlo y avanzar a Revisión. No uses el monitor de logs como sustituto
    de esa sesión visible.
11. **No borres datos funcionales de entrada.** Teléfonos, montos, correos y
    textos usados por el caso permanecen en el recording local para convertirlos
    en parámetros/Examples. Solo contraseña, clave, PIN, OTP, token y secretos
    se redactan antes de construir el paquete.
12. **Local y BrowserStack son caminos soportados.** Un cambio de gestos,
    capabilities, selectores o sesión debe considerar Android/iOS y ambos tipos
    de conexión.
    En local, Appium/UiAutomator2/XCUITest pertenecen al recorder y están
    fijados en su lockfile. Nunca uses ni modifiques las dependencias Appium del
    framework padre para iniciar una sesión.
13. **La memoria no aprende de fallos.** Solo una propuesta generada, revisada
    y validada con score 100 puede promocionarse a `runtime/automation-memory`.
14. **Regenerar conserva identidad y rutas.** Un refinamiento parte del último
    `agent-response.json` validado, crea una versión histórica, mantiene
    `recordingId` y las cuatro rutas, y solo reemplaza archivos que el registry
    sigue reconociendo como administrados y no modificados externamente.
15. **Squad y ruta Feature son conceptos distintos.** `featureScope` puede
    limitar Features a una subruta como `tapp/payment`, pero Steps, Screen
    Objects y Locators mantienen como owner al squad seleccionado.
16. **Reutiliza por relaciones, no por basename.** Sigue Feature -> definición
    Gherkin -> import de Screen Object -> import de Locator. Si el plan marca
    `update`, conserva la ruta y el baseline, y añade únicamente APIs faltantes.
    No borres ni renombres definitions, methods o locators existentes.

## Convenciones de generación

- ID de escenario: `TC-<número>`, por ejemplo `TC-10239`; no volver a `CP_01`.
- Nombre: `[TC-10239][Happy Path|Unhappy Path][AUTO-FRONT] descripción`.
- Capas: Feature, Steps, Screen Object y Locators según
  `docs/GENERATION_CONTRACT.md`.
- El Gherkin es declarativo: expresa intención, capacidad y resultado de
  negocio. No replica el historial como una línea por click, botón, campo,
  scroll, swipe o espera.
- Las acciones técnicas consecutivas se engloban en un único step funcional.
  `actionTrace` conserva el orden completo permitiendo que varias secuencias
  apunten al mismo `gherkinStep`.
- Los nombres de archivos, módulos, métodos y variables deben ser estables,
  legibles y normalizados; no dependas de índices visuales como `view_93` si
  existe semántica suficiente.
- La clase y el alias de un Screen Object se derivan de su archivo: por ejemplo,
  `cuentas-tapp.screen.ts` usa `CuentasTappScreen` y `cuentasTappScreen`. Están
  prohibidos aliases genéricos como `generatedScreen`, `screen`, `page`,
  `screenObject` y `obj`.
- Steps y Screen Objects usan los aliases del target: `@screenobjects`,
  `@utils` y `@locators`; no generan rutas relativas hacia módulos del
  framework. `browser` se importa desde `@wdio/globals` solo cuando el archivo
  contiene una llamada `browser.`.
- El recorder, no el agente, agrega metadata uniforme a las cuatro capas:
  generador, `Author: Kevinarnold.zorem` y fecha ISO de creación. Locators usa
  `_metadata` porque JSON no admite comentarios; los indexadores deben ignorar
  ese bloque.
- La búsqueda compartida conserva el orden squad → commons → home → global.
- `create` es el fallback. Un Feature nuevo puede vivir en `featureScope`
  mientras las otras capas se actualizan de forma aditiva en rutas existentes.
- Los tags de plataforma reflejan cobertura completa: `@android` para Android
  y `@ios` solo cuando todos los locators requeridos de iOS estén disponibles.
- Una propuesta solo debe cubrir la plataforma del recording. El bloque de la
  plataforma contraria puede faltar o quedar vacío; es cobertura pendiente y
  se completa después mediante **Completar una grabación**, nunca se inventa.
- Nunca registres valores de los ambientes del framework, username/access key de BrowserStack ni
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
