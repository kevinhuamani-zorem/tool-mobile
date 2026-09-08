# AGENTS.md — Appium Recorder

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
3. **Las rutas se resuelven centralmente.** Usa `core/workspace` (`projectPaths`) y el
   `WorkspaceAdapter`; no derives la raíz con `cwd`, padres relativos o rutas
   absolutas nuevas.
4. **El target es siempre un fwk-mobile validado.** En desarrollo se resuelve
   el framework padre de `tools/visual-recorder`; el `.app` permite seleccionar
   y persistir otra raíz válida. Nada se genera fuera del framework seleccionado
   y el runtime del `.app` se resuelve fuera del bundle: puede reutilizar el
   origen del clon registrado durante el build o usar `userData` como fallback.
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
   En el pipeline por capas, Derek conserva el orden y delega únicamente a
   Lorem (Feature/Steps), Zorem (Screen/Locators) y Sumrak (integración). Los
   tres delegados trabajan en sesiones headless nombradas, con perfiles y
   workspaces separados; el recorder sigue siendo la autoridad que valida y
   aplica. En la misma pasada semántica, Lorem realiza una revisión acotada de
   diseño de prueba: contrasta objetivo y aceptación con las verificaciones
   grabadas. Si solo se observa la existencia del control y no su efecto de
   negocio, devuelve `testDesignReview.status: suggestion`; la observación se
   muestra al QA, pero no bloquea la materialización ni la revisión del código.
10. **IA opt-in y contexto mínimo.** Copilot solo se ejecuta por una
    decisión explícita del usuario. Reciben el paquete confinado bajo
    `runtime/recordings`, sin secretos, y no deben explorar el target ni leer
    XML/capturas salvo que un gap puntual lo exija. El pipeline predeterminado
    ejecuta los tres delegados headless y entrega el borrador a Revisión con
    sus diagnósticos. La sesión visible `copilot -i` pertenece al camino manual
    o heredado; no es un requisito del pipeline por capas. Ver un borrador no
    equivale a aprobar su aplicación al framework. F3 permite exportar el
    borrador revisado aunque tenga diagnósticos de calidad: `exportReady` es
    independiente de `validation.valid`. Conserva rutas, contenido compartido,
    comprobaciones concurrentes y rollback. No se exige score 100 ni cuatro
    capas presentes para exportar las disponibles. Ver `docs/AUTOMATION_DRAFT_EXPORT.md`.
11. **No borres datos funcionales de entrada.** Teléfonos, montos, correos y
    textos usados por el caso permanecen en el recording local para convertirlos
    en parámetros/Examples. Solo contraseña, clave, PIN, OTP, token y secretos
    se redactan antes de construir el paquete.
12. **Local y BrowserStack son caminos soportados.** Un cambio de gestos,
    capabilities, selectores o sesión debe considerar Android/iOS y ambos tipos
    de conexión.
    En local, Appium/UiAutomator2/XCUITest pertenecen al recorder y están
    fijados en su lockfile. El `.app` inicia ese runtime empaquetado y registra
    sus drivers en un `APPIUM_HOME` escribible. Nunca uses ni modifiques las
    dependencias Appium del framework padre para iniciar una sesión.
13. **Solo la aprobación QA permite aprender.** Exportar/aplicar o conseguir
    score 100 no promociona memoria. La memoria legacy está deshabilitada:
    casos, fragmentos, vocabulario y cachés anteriores se archivan bajo
    `runtime/automation-memory/legacy-v1/`, sin borrarlos ni convertirlos en
    golden. Ninguna generación recupera respuestas de otro intento. El índice
    derivado de revisiones golden aprobadas por QA existe desde F6;
    las lecturas legacy siguen vacías. F7 selecciona referencias compatibles por
    capa, excluye casos reservados y el propio caso, y registra sus versiones.
    Los fragmentos exigen relaciones recuperadas verificadas y datos exactos;
    no cierran gaps de verificación automáticamente. La reutilización exacta
    del framework permanece disponible y no acredita aprobación golden.
14. **El historial precede a las modificaciones.** `AutomationHistoryStore`
    conserva eventos y blobs por hash en `generation/automation/history/v1`.
    Antes de resetear, normalizar o aplicar una edición, captura sus originales.
    `attemptId` es el `runId` existente; las revisiones conservan `recordingId`,
    `caseId` y el vínculo al padre. Los archivos actuales son vistas mutables.
    Limpiar el paquete no borra `history/`. Exportar o validar una edición QA
    no transforma el fallo autónomo previo en éxito ni acredita aprobación o
    ejecución funcional. Ver `docs/AUTOMATION_HISTORY.md`.
    **Regenerar conserva identidad y correcciones QA.** F5 parte del checkout
    actual recuperado, crea revisión/intento nuevos y conserva las rutas vigentes.
    El baseline histórico autoriza la reconciliación por símbolos; muestra los
    solapamientos en el editor y verifica destinos/checkout nuevamente antes de
    escribir. No exige score 100 ni todas las capas exportadas. Ver
    `docs/AUTOMATION_RECONCILIATION.md`.
    **Recuperar código QA conserva la evidencia grabada.** F4 guarda correcciones
    del framework como revisión `framework-import`, leyendo las relaciones del
    caso y excluyendo cambios ajenos en módulos compartidos. Las asociaciones
    inciertas quedan pendientes y no impiden guardar. No inventes eventos Appium
    ni promociones golden; no uses la proyección de código compartido como
    reemplazo directo del archivo actual. F5 realiza esa reconciliación. Ver
    `docs/AUTOMATION_FRAMEWORK_RECOVERY.md`.
15. **Squad y ruta Feature son conceptos distintos.** `featureScope` puede
    limitar Features a una subruta como `tapp/payment`, pero Steps, Screen
    Objects y Locators mantienen como owner al squad seleccionado.
16. **El presupuesto informa; la completitud manda.** `maxContextBytes` y
    `maxDurationMs` del plan son objetivos de coste que se miden y se reportan
    por etapa (`budgetWarnings`) como telemetría interna, sin avisos en la UI;
    nunca recortan evidencia ni cortan una
    sesión. La sesión solo la cortan el hang stop
    (`RECORDER_AGENT_HANG_STOP_MS`, 1 h por defecto), el silencio total de
    eventos (`RECORDER_AGENT_IDLE_STOP_MS`, 10 min). En el pipeline por capas,
    cada solicitud QA tiene dos pasadas: inicial y una corrección, con cada rol
    como máximo una vez por pasada. Feedback, revisión de diseño fallida y
    resincronización comparten ese límite. La sesión termina con la primera
    entrega estable, incluso JSON inválido; Derek valida fuera de la sesión.
    No hay rondas `feedback-N`. Al finalizar, Revisión recibe las capas
    recuperables, su procedencia, faltantes y diagnósticos. El objetivo de coste es
    120 000 bytes por etapa: un autor recibe legítimamente 40–110 KB. La reutilización completa
    la garantiza el resolver, que indexa todo el framework antes de que exista
    un agente: lo que un agente deja de recibir es siempre lo que ya está
    decidido (gaps con decisión fijada), lo que ya tiene por otra vía (código
    de getters presente en `baselines/`) o lo que no puede ejercer (protocolo
    de queries, reglas de otra capa). Si el resolver no encuentra reutilización
    se crea; si crea algo que ya existía, `framework-*-collision` lo bloquea.
    Nunca reduzcas las entradas del resolver ni del índice para cumplir un
    presupuesto.
17. **Reutiliza por relaciones, no por basename.** Sigue Feature -> definición
    Gherkin -> import de Screen Object -> import de Locator. Si el plan marca
    `update`, conserva la ruta y el baseline, y añade únicamente APIs faltantes.
    No borres ni renombres definitions, methods o locators existentes. El
    Screen que se extiende lo fija la evidencia (`bestArtifactBundle`): la
    proporción de locators reutilizados que le pertenecen y las intenciones
    que ya cubre, nunca «tiene algún locator en común» ni la similitud de
    palabras sueltas. Un selector sin predicado identificador (`className`,
    `instance(n)`, XPath sin predicado) no identifica un elemento de otra
    pantalla: se conserva tal cual, se crea en el módulo del caso y solo se
    reutiliza dentro del módulo que se extiende.
18. **Las sesiones headless se aíslan de la configuración personal.** Lorem,
    Zorem y Sumrak trabajan solo con view/edit/create/bash sobre su paquete;
    los MCP (builtin de GitHub, plugins como `workiq`) y las skills personales
    del QA no forman parte del contrato y cuestan arranque, contexto y ruido.
    El adapter añade `--disable-builtin-mcps` y `--disable-mcp-server=<nombre>`
    únicamente cuando `copilot --help` los anuncia (`copilotIsolation.ts`) y
    aprende los servidores del evento `session.mcp_servers_loaded`. Nunca
    escribas un flag del CLI sin comprobar que la versión instalada lo soporta
    ni cambies `COPILOT_HOME`: mueve la sesión autenticada del QA.

## Convenciones de generación

- ID de escenario: `TC-<número>`, por ejemplo `TC-10239`; no volver a `CP_01`.
- Nombre: `[TC-10239][Happy Path|Unhappy Path][AUTO-FRONT] descripción`.
- Capas: Feature, Steps, Screen Object y Locators según
  `docs/GENERATION_CONTRACT.md`.
- El Gherkin es declarativo: expresa intención, capacidad y resultado de
  negocio. No replica el historial como una línea por click, botón, campo,
  scroll, swipe o espera.
- Keywords por semántica: `Given` contexto o estado inicial; `When` acción
  que ejecuta el usuario o evento que ocurre; `Then` resultado esperado;
  `And`/`But` complementan el paso anterior y heredan su tipo (la acción que
  sigue a un `Then` vuelve a ser `When`). Redacción en tercera persona («el
  usuario consulta…») o impersonal («se muestra…»); nunca primera persona,
  imperativo ni infinitivo. El validador lo exige (`gherkin-keyword`,
  `gherkin-person`) y el borrador determinista lo cumple de origen.
- Un dato parametrizado (Examples, DataTable) viaja por argumento hasta el
  Screen Object: se nombra como `<columna>` en el step, la definition lo pasa
  y el método lo usa. Nunca se escribe su literal en Steps ni en el Screen
  (`examples-unused-column`, `parameter-not-forwarded`, `parameter-unused`,
  `example-value-hardcoded`).
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
- El recorder, no el agente, agrega la metadata de procedencia, y solo en el
  Feature (generador, `Author: Kevinarnold.zorem` y fecha ISO). Steps, Screen
  Object y Locators no llevan cabecera ni comentarios por método: deben
  parecer código del framework; la trazabilidad por símbolo vive en
  `config/generated-files.json`. Los indexadores deben ignorar un `_metadata`
  heredado en Locators.
- Recording, paquete, respuesta del agente y archivos generados usan UTF-8
  estricto, normalización Unicode NFC y ningún BOM. Conserva literalmente
  tildes, eñes y diacríticos de selectores verificados; U+FFFD y mojibake como
  `BotÃ³n` invalidan la calidad automática. F3 conserva los bytes revisados al
  exportar y mantiene el diagnóstico visible, sin corregirlos silenciosamente.
- La búsqueda compartida conserva el orden squad → commons → home → global.
- `create` es el fallback. Un Feature nuevo puede vivir en `featureScope`
  mientras las otras capas se actualizan de forma aditiva en rutas existentes.
- La reutilización no depende de que ya exista la cadena completa
  Feature → Steps → Screen → Locators. Si CodeGraph demuestra la relación
  Screen → Locator y sus métodos cubren varias intenciones del recording, el
  plan crea Feature/Steps y marca Screen/Locators como `update`. `update` puede
  ser una referencia pura: conserva el baseline sin cambios cuando las APIs
  existentes cubren todas las acciones y añade únicamente símbolos faltantes.
- El golden dataset exige aprobación QA explícita sobre un preview con token.
  Publicaciones y snapshots son inmutables; el índice es descartable y solo incluye
  versiones aprobadas activas. Verifica hashes al leer y compatibilidad antes de
  reutilizar. La aprobación no escribe el framework ni borra fallos del agente;
  ejecución declarada y diagnóstico automático son campos distintos. No exige
  score 100 ni validación verde. No cambies expected para esconder discrepancias.
  El dataset compartido vive en `tests/golden` del checkout Git del recorder,
  incluso desde la app empaquetada. `core/workspace` detecta o persiste el checkout;
  la selección local no se versiona. No escribas golden nuevos en runtime ni en
  el bundle. Snapshots/publicaciones viajan por commit/PR; el índice es local.
  Los snapshots compactos mantienen `manifest.json` y las capas propias legibles;
  la evidencia completa vive en `evidence.pack.gz`, deduplicada y sin pérdida.
  Lee artefactos con `GoldenSnapshotReader`, no con rutas físicas asumidas.
  `golden:compact` preserva manifiestos, publicaciones y bytes lógicos aprobados.
  Los ejemplos no tienen topes de bytes/cantidad; cada rol recibe código propio
  completo y referencias de dependencias por ruta, símbolos y hash. Se mantienen
  pertinencia, compatibilidad, reservas de evaluación y las dos pasadas.
  Conserva `.gitattributes` para no cambiar bytes/hash entre máquinas. Sin checkout,
  la generación/exportación sigue disponible sin referencias golden.
  Los legacy solo se promueven tras revisión explícita. Ver
  `docs/AUTOMATION_GOLDEN_APPROVAL.md`.
- Un gap `blocking` es un defecto de la grabación que solo el QA corrige
  (aserción ausente, candidato ambiguo, selector que el framework no compone):
  el paquete no se arma. El estado del framework (claves vacías del módulo que
  se extiende, `gap-platform-coverage`) nunca bloquea: es un aviso informativo
  para el autor de la capa (`isAuthorInformationalGap`), Derek lo firma y solo
  ese autor lo recibe (`informationalGapOwner`). El recorder tiene que funcionar
  en cualquier máquina y rama del framework.
- Cada línea del Feature resuelve a exactamente una step definition de todo
  el framework, como lo hace Cucumber (carga todos los squads, ignora el
  keyword, expande Examples). Reutilizar (`stepDefinitions`, squad + commons)
  y colisionar (`frameworkStepDefinitions`, todos los squads) son preguntas
  distintas; `core/shared/domain/stepMatching.ts` es la única resolución. Una
  frase atrapada por un regex ajeno con capturas se reformula (verbo o
  conjunción), nunca se sufija; el validador la rechaza como `step-ambiguous`
  o `step-undefined` (ambas de Lorem).
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
