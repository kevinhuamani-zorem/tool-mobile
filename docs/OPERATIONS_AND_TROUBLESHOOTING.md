# Operación y troubleshooting

## Validar texto de un contenedor (por ejemplo, «contiene Hoy»)

1. Selecciona/verifica el locator del **contenedor** que contiene la información;
   el recorder no convierte automáticamente un selector de un hijo en su padre.
2. Elige `VERIFICAR TEXTO`, introduce `Hoy` como **Valor esperado** y selecciona
   **Contiene**. Por defecto se lee el texto del elemento seleccionado. Si
   necesitas también el texto de sus hijos, abre **Opciones avanzadas** y activa
   **Incluir texto de descendientes** (desactivado para nuevas acciones).
3. Pulsa **Leer y probar sin guardar** para revisar texto leído, esperado y resultado.
   Solo **Guardar paso y continuar** registra la comparación si pasa.
4. Para una verificación anterior, selecciónala en la lista y pulsa **✎ Texto**.
   Revisa la comparación y pulsa **Comprobar y actualizar acción seleccionada**.
   Si ya incluía descendientes, la opción avanzada aparece abierta y activada;
   no se reinterpreta la grabación anterior al abrirla.
   Debes estar en la pantalla correspondiente del dispositivo. Esta edición
   conserva el selector; para cambiarlo, registra una nueva acción.
5. Regenera la automatización para que los agentes reciban la intención actualizada.

`Es igual a` compara todo el texto, incluidos espacios y saltos de línea;
`Contiene` busca el fragmento exacto. En contenedores se une texto propio y de
descendientes con saltos de línea; no se eliminan repeticiones. La lectura tiene
límites explícitos: si el contenedor es demasiado grande, selecciona uno más
específico. No se guarda el contenido leído del dispositivo.

## Inicio rápido

```bash
npm run recorder
```

Ejecuta el comando desde la raíz del clon del recorder. En el primer inicio se
selecciona una raíz local de `fwk-mobile-test`; no es necesario instalar el
recorder dentro del framework. El proceso principal inicia Appium y usa Copilot
como agente. No requiere `.env`, `TARGET_PROJECT` ni selección de proveedor. La
plataforma queda fija al crear la sesión.

## Aplicación macOS

Si el preview informa `Cannot find name 'Promise'` y faltan `lib.es2021.d.ts`
o `lib.dom.d.ts` dentro del `.app`, reconstruye con `npm run package:mac`.
Las librerías estándar de TypeScript se incluyen explícitamente y el hook
`afterPack` comprueba sus bytes y compila una prueba de `Promise` antes de
entregar la aplicación. No cambies el `tsconfig` del framework para ocultarlo.

Un `timeout` sin declarar es distinto: regenera la propuesta con esta versión.
Los métodos del borrador declaran el timeout localmente desde el helper del
framework; la fusión conserva sus imports y Zorem recibe esas dependencias.
Si la respuesta ya contiene el import pero el preview indica que falta el helper,
reimporta con la versión corregida: el patch aditivo del Screen también conserva
imports auxiliares, incluso cuando solo se está corrigiendo un import sin añadir
métodos. No hace falta volver a ejecutar al agente.

Para construir un `.app` de pruebas en una Mac Apple Silicon:

```bash
cd visual-recorder
npm ci
npm run inspector:build
npm run package:mac
```

El resultado queda en
`release/mac-arm64/Appium Recorder.app`. Al abrirlo por primera vez,
selecciona la raíz de `fwk-mobile-test`; la elección queda persistida para los
siguientes arranques. También puede definirse `FWK_MOBILE_ROOT` al ejecutar el
binario durante diagnóstico. El bundle inicia Appium 3 y sus drivers fijados;
no requiere levantar un servidor externo ni modificar dependencias del target.

Para cambiar el framework guardado, abre **Ajustes**, pulsa **Cambiar proyecto**
y selecciona otra raíz válida. La aplicación se reinicia automáticamente para
crear scanners, cachés y generadores contra el nuevo proyecto.

El build actual no está firmado ni notarizado. Para distribuirlo fuera del
equipo de desarrollo se debe añadir Developer ID, hardened runtime y
notarización en una iteración posterior.

Para usar el Inspector embebido en un checkout nuevo:

```bash
git submodule update --init --recursive vendor/appium-inspector
npm run inspector:build
RECORDER_INSPECTOR=embedded npm run recorder
```

`RECORDER_INSPECTOR=legacy` conserva el inspector visual previo. Sin variable,
se usa el modo embebido cuando sus assets están presentes y se vuelve a legacy
con una advertencia visible cuando faltan. Si se solicita `embedded`
explícitamente sin assets, la apertura falla indicando el comando de build.
BrowserStack conserva legacy porque el protocolo fijado no transporta
credenciales; estas nunca se exponen al bundle.

Ejecución del agente de automatización:

- `RECORDER_AGENT_EXECUTION_MODE=automatic` (default) y
  `RECORDER_AGENT_PIPELINE=layered` (default): Derek coordina Lorem, Zorem y
  Sumrak en headless, sin Terminal. El resultado se importa en Revisión.
- `RECORDER_AGENT_EXECUTION_MODE=manual`: handoff explícito en Terminal.
- `RECORDER_AGENT_PIPELINE=deterministic`: conserva el pipeline anterior de
  pasadas semánticas para diagnóstico; no describe el flujo normal por capas.

El botón **Inspector** del header abre o focaliza la misma ventana embebida. Una
selección ordinaria permanece dentro de Appium Inspector; el recorder solo
importa el selector cuando el QA pulsa **Usar en Recorder**, lo somete a una
segunda validación en el proceso principal, oculta la ventana solo cuando el
primary vuelve a resolver de forma única al mismo elemento y conserva la sesión
para reabrirla. El recorder guarda un único selector verificado por acción; no
persiste candidatos alternos ni fallbacks de ejecución. El botón
inferior **Inspeccionar** activa exclusivamente la inspección local sobre la
captura/XML del recorder.

Al copiar un selector, el Inspector confirma éxito solo cuando
`navigator.clipboard.writeText` termina correctamente. Si la API no está
disponible o rechaza la escritura, muestra **Copy failed** y no simula éxito. El
host concede exclusivamente `clipboard-write` al iframe.

Si el primary falla la segunda validación, el Inspector permanece visible y el
recorder muestra el error. Alternativas inválidas se omiten y se informa su
cantidad. Editar manualmente el selector invalida la verificación previa y exige
validar de nuevo antes de guardar la acción.

## Diagnóstico por síntomas

### Electron failed to install correctly

El paquete JavaScript existe, pero falta `Electron.app`; normalmente se instaló
con `--ignore-scripts`. Repara la instalación con:

```bash
npm rebuild electron
```

Para una reinstalación reproducible usa `npm ci` sin `--ignore-scripts`. El
proceso principal comprueba el runtime antes de iniciar Appium.

### El puerto 4723 está ocupado

El recorder reutiliza una instancia compatible que ya responda en el puerto.
Si pertenece a otro runtime, ciérrala antes de iniciar una sesión. No
automatices un borrado indiscriminado de procesos.

### Faltan assets del Inspector embebido

Inicializa el submódulo y recompila la caché:

```bash
git submodule update --init --recursive vendor/appium-inspector
npm run inspector:build
```

El recorder no habilita CORS global en Appium. Abre un proxy loopback efímero
que solo acepta el origen `appium-recorder://inspector` y rutas de la sesión
activa. No se relaja la navegación, el sandbox ni el bridge de Electron.

### Appium falla con `AppiumIpc is not a constructor`

Indica que el runtime aislado del recorder quedó incompleto o fue alterado. El
servidor embebido carga Appium y sus drivers desde el recorder. Restaura
exactamente el lockfile de la herramienta; no cambies sus versiones desde el
framework seleccionado.

Comprueba el árbol efectivo desde la raíz:

```bash
npm ls appium @appium/base-driver appium-uiautomator2-driver appium-xcuitest-driver
```

El árbol no debe reportar paquetes `invalid` y `@appium/base-driver` debe
exponer `AppiumIpc`. Reinstala todo el runtime del recorder con:

```bash
npm ci
```

### `unknown mobile command` o HTTP 404

El proveedor/driver no implementa el comando solicitado. Usa fallback W3C
(acciones de puntero) o un comando anunciado por el driver. Verifica Android,
iOS, local y BrowserStack por separado antes de generalizar una solución.

### Selector Android recuperado no funciona

Un valor UiAutomator debe conservar `android=` para que WebdriverIO seleccione
la estrategia correcta, por ejemplo:

```text
android=new UiSelector().text("Mostrar movimientos")
```

Un valor sin prefijo puede interpretarse como CSS o estrategia incorrecta.

### Elementos iOS no se detectan al hacer click visual

En iOS muchos controles visibles están dentro de padres `Other`, `Cell` o
contenedores no accesibles. El hit testing debe elegir el descendiente
interactivo/semántico (`TextField`, `Button`, etc.) más específico dentro de las
coordenadas, no solo el primer contenedor. Refresca XML y screenshot juntos para
evitar geometría desfasada.

### Scroll de una lista del renderer no aparece

El elemento con `overflow-y: auto` necesita una altura limitada y sus ancestros
flex/grid deben permitir encogimiento (`min-height: 0`). Evita depender del
scroll de `body` dentro de modales o columnas; la lista debe ser el contenedor
scrollable y acciones críticas deben quedar fuera de ella.

### La selección de escenario desaparece al conectar

La conexión no debe reinicializar el estado de onboarding/cobertura. Conserva
la selección por ID estable y vuelve a cargar catálogos sin reemplazar la
elección si todavía existe.

### Se reporta conflicto para un archivo eliminado

La caché o el registro no reemplazan una comprobación actual del filesystem.
Reescanea antes de generar. Un registro huérfano puede conservar auditoría, pero
no debe bloquear la creación de una ruta que ya no existe.

### Solo se genera Feature

Confirma que el adaptador soporte `supportsLayerGeneration`, que cada fila
Gherkin tenga acciones enlazadas y que Preview incluya Feature, Steps, Screen
Object y Locators. Si el caso requiere capas nuevas, omitir alguna es un error.

### Guardar un caso como referencia (golden dataset)

Al aplicar la automatización en el paso 3 aparece «Guardar como dataset».
Indica si ya ejecutaste el caso en el dispositivo (en verde, falló o todavía
no) y una nota, y guarda: el caso queda en `tests/golden/<tc>-<rec>/` con la
grabación, el plan, el catálogo del framework, los baselines y los archivos
que aceptas. Si el caso falló en un step, corrígelo en el editor de la revisión
y vuelve a guardar: la corrección se valida, se escribe en el framework y es la
versión que queda en el dataset. Si lo corregiste días después en el framework,
`npm run golden:save -- <carpeta o recordingId> --executed passed --notes "…"`
toma lo que hay en disco. `npm run test:golden` reproduce los casos guardados y
`npm run golden:seed-memory` los siembra en la memoria de otra máquina. Los
datos de prueba de la grabación (usuarios QA, correos, celulares de ambiente)
viajan con el caso: revísalos antes de commitear.

### Completar un recording que solo carece de iOS o Android

Inicia una sesión en la plataforma faltante, elige **Completar una grabación** y
selecciona el recording del ambiente/squad activo. Captura y verifica únicamente
los locators pendientes. Cada asignación conserva la otra plataforma y actualiza
atómicamente Locators, la estrategia correspondiente del Screen Object y la
propuesta persistida. Feature y Steps no se regeneran ni requieren Cowork.

### Refinar y volver a generar un caso ya importado

Elige **Regenerar una automatización**, selecciona un recording elegible y
describe el cambio. El recorder crea una iteración histórica y abre el wizard
en el paquete del agente. Tras importar y revisar la nueva propuesta, las cuatro
capas se reemplazan únicamente si siguen registradas y no fueron modificadas
fuera del recorder. Si el caso no aparece, comprueba que la generación anterior
tenga validación 100 y que sus cuatro archivos todavía existan.

Cada reproceso reconstruye automáticamente `generation/automation`: elimina la
respuesta, plan efectivo, consultas, reparación, validación, logs y baselines de
la corrida anterior. Conserva las acciones/evidencia del recording y el
directorio histórico de refinamientos. No es necesario marcar una limpieza para
evitar que Copilot reutilice una salida anterior; la limpieza explícita también
descarta ese historial.

### El agente consume demasiado contexto o excede cinco minutos

Revisa `layered-generation-run.json`: duración, `contextBytes`, `cacheHit` y
`budgetWarnings` por etapa. Los objetivos predeterminados son 120 000 bytes y
300 000 ms por etapa; excederlos informa al QA, no cancela el trabajo ni recorta
evidencia. El recorder controla las sesiones headless y aplica tres cortes que
no son presupuesto sino detectores de sesión que no avanza: el hang stop de una
hora (`RECORDER_AGENT_HANG_STOP_MS`), el silencio total de eventos durante diez
minutos (`RECORDER_AGENT_IDLE_STOP_MS`, `AGENT_IDLE`) y cinco minutos sin una
corrección nueva tras un `output-rejected` (`RECORDER_AGENT_FEEDBACK_IDLE_MS`,
`AGENT_FEEDBACK_IDLE`). En el último caso Derek relanza al autor en una sesión
nueva con el `repair-feedback.json` ya escrito (`.../feedback-N`) y, agotadas las
rondas, la etapa falla con «no corrigió su capa tras 3 rondas de feedback
dirigido; la última se cortó por inactividad» más los errores pendientes; el
`agent-execution.log` marca el momento con `[feedback-idle]` o `[idle]`. Comprueba
los paquetes `agents/<rol>` y la proyección de memoria antes de aumentar contexto.

### El agente no converge: cada corrección trae los mismos errores

Si Lorem repite `gherkin-keyword` por un cierre después de una verificación
(`Then … / And el usuario cierra …`), el recorder normaliza ese `And` a `When`
antes del feedback y durante la reimportación, siempre que la traza sea inequívoca.
Actualiza/reinicia (reconstruye el `.app`) y reimporta una respuesta completa, o
regenera si solo quedó la salida parcial del autor. No es necesario modificar
acciones de la grabación. Una fila que mezcla validación y cierre necesita una
corrección de redacción: el normalizador no la divide ni inventa pasos.

Si los errores son `trace-screen-method` en verificaciones agrupadas que
devuelven un booleano al Step (caso 85a9110f), versiones anteriores no seguían
ese retorno y rechazaban getters que sí se usaban. El validador reconoce ahora
`isDisplayed`/`isExisting`, conjunciones y `Promise.all` con `every(Boolean)`
cuando el Step correspondiente espera y afirma el resultado. Actualiza y
reinicia el recorder (reconstruye el `.app` si lo utilizas) y reimporta la
respuesta existente. No edites ni vuelvas a grabar acciones para corregir este
falso positivo. Si el retorno realmente se ignora, el error señala el Step
que debe añadir la aserción.

Ningún autor entra en bucle. Dentro de una sesión de reparación, cada versión
que el autor escribe se valida al instante y el feedback va a
`repair-feedback.json`; si dos versiones seguidas repiten exactamente los
mismos errores (mismos códigos y mensajes), Derek considera que no va a
converger: el adapter corta la sesión (`AGENT_FEEDBACK_STUCK`, traza
`[feedback-stuck]`), no se gastan las rondas restantes y la etapa falla con «no
converge: entregó versiones consecutivas con exactamente los mismos errores
(ronda N de 3)» más los errores. `repair-feedback.json` queda con
`status: stuck` y `repeatedErrors: true`, y la última versión del autor se
conserva en `agents/<rol>/<rol>-result.json` para revisarla. Topes en total por
autor: 3 sesiones de feedback en vivo por intento de reparación, 1 intento de
reparación tras la integración, 5 min sin corrección tras un rechazo, 10 min
sin eventos, 1 h por sesión. Desde ahí el QA decide: **Corregir con Copilot**
(sesión visible), corregir a mano y **Reimportar corrección**, o regenerar.

### La sesión tarda en arrancar o el log muestra MCP y skills que el recorder no usa

Cada sesión de Copilot carga la configuración personal de la máquina: el MCP
builtin de GitHub, los MCP de plugins (`workiq` aparece como `needs-auth` y
reintenta autenticarse en cada sesión) y las skills personales. Ninguno lo usan
Lorem, Zorem ni Sumrak. El adapter los desactiva con los flags oficiales del CLI
(`--disable-builtin-mcps`, `--disable-mcp-server=<nombre>`) cuando `copilot --help`
los anuncia; la línea `[start]` de `agent-execution.log` dice qué ocurrió:
`mcpIsolation=builtin-mcps+mcp[workiq]` (aislado), `unsupported` (actualiza el
CLI: la versión instalada no trae los flags), `no-help` (no se pudo ejecutar
`copilot --help`), `off-by-env` (`RECORDER_COPILOT_ISOLATE=0`). La línea `[mcp]`
lista los servidores que la sesión cargó de todos modos. Los MCP de plugins se
aprenden en la primera sesión y quedan en `config/copilot-mcp-servers.json`; si
quieres desactivarlos desde la primera sesión de una máquina nueva, define
`RECORDER_COPILOT_DISABLED_MCP_SERVERS=workiq,otro`. Las skills personales
siguen cargándose: no existe flag oficial para excluirlas y `COPILOT_HOME`
aislado también movería la sesión autenticada.

### Zorem busca `tsc`, `node_modules` o babel, o escribe scripts en `/tmp`

Es la señal de que el modelo intenta verificar su Screen Object por su cuenta.
El paquete de Zorem trae `tools/check.js` (contrato mecánico del Screen Object,
JSON de locators y sintaxis TypeScript con el `typescript` del framework) y el
prompt le indica que es su única verificación; si aun así lo hace, revisa que
`agents/zorem/tools/` exista en el paquete (requiere `screen-object-contract.js`
en la raíz del paquete) y que `node_modules/typescript` esté instalado en el
framework destino; sin él, `check.js` lo avisa como NOTA y la sintaxis se
comprueba al importar el resultado.

### «No pudimos completar el análisis» por claves sin valor del módulo que se extiende

Síntoma (TC-10240, flujo de yapeo en otra máquina): el paso 2 del asistente
termina con «El modulo payment/yapear-contact que este caso extiende tiene 1
clave(s) sin valor en android: inputContactToYapear…» y no hay generación. La
causa era `gap-platform-coverage` marcado como bloqueante: el paquete no se
armaba porque el módulo de locators que el caso extiende declaraba una clave
solo en el bloque iOS. Eso depende de la rama del framework de cada equipo, no
de la grabación, así que el QA no tenía nada que corregir. Desde 07-09 el gap es
informativo: el análisis continúa, Zorem recibe el aviso (qué claves puede
rellenar con `completions` y cuáles no debe adoptar), Derek lo firma y Sumrak no
lo juzga. Los gaps que sí bloquean siguen siendo defectos de la grabación:
aserción ausente, candidato de locator ambiguo (decisión del QA) y selectores
que el framework no puede componer. Si un análisis vuelve a fallar con un texto
dirigido «al agente», es señal de que un gap del resolver tiene `blocking: true`
sin ser un defecto de la grabación.

### El plan extiende un Screen Object que no corresponde al flujo

Mira `generation-plan.json → reuseTarget.reason` y `resolutions[]`: el Screen
que se extiende es el que consume la mayoría de los locators que el recording
reutilizó («5 de los 6 locators reutilizados»), no el primero que comparta uno.
Si el flujo cayó en otra pantalla, la causa habitual es una acción grabada con
un selector sin predicado identificador (`className("android.widget.EditText")`,
`instance(7)`, `//android.view.View`) que coincide con un locator de ese otro
módulo: el resolver ya no adopta esa coincidencia (la resolución queda `create`
con `unspecificSelector: true` y `declinedReuse`), el QA la ve en
`qa-observations.json` (`unspecific-selector`) y el validador la avisa sin
bloquear (`framework-locator-collision` como warning). Un caso ya aplicado con
el Screen equivocado se revierte en el framework con git; si además se promovió
a memoria (`runtime/automation-memory/index.json` con `qualityScore: 100`),
borra esa entrada y sus fragmentos (`fragments.json`, mismo `fingerprint`) para
que no se replique en la siguiente grabación.

### Al ejecutar, Cucumber reporta «Multiple step definitions match» o un step undefined

Síntoma: el caso generado tiene su definición en Steps, pero al correrlo
Cucumber encuentra dos definiciones para la misma línea (o ninguna) y el
Scenario falla. Causa habitual: un regex laxo de **otro squad** que atrapa la
frase por sus capturas, como `^el usuario ingresa su (.*) y (.*)$` en
`autenticacion/login/login.steps.ts`, que resuelve «el usuario ingresa su
correo <email> y selecciona enviar» con `username = "correo …"` y
`password = "selecciona enviar"`. Cucumber carga todas las definiciones del
framework y no distingue `Given` de `When`; el recorder ahora juzga las
colisiones contra `frameworkStepDefinitions` (todos los squads), el borrador
reformula la frase en vez de sufijarla (los sufijos no escapan de una captura
final) y el validador rechaza `step-ambiguous` con la redacción sugerida y
`step-undefined`. Un caso ya generado con la frase ambigua se corrige
cambiando el verbo en el Feature y en su definición («el usuario escribe su
correo <email> y …»); el step ajeno no se toca. Si el regex laxo es del propio
framework y nadie más lo usa, acotarlo (por ejemplo `^el usuario ingresa su
usuario (.*) y contraseña (.*)$`) elimina la mina para todos los squads, pero
es una decisión del squad dueño.

### El Screen Object escribe el dato de la grabación en vez del parámetro

Síntoma: el Gherkin trae `<email>` en Examples pero el Screen hace
`setValue('joseamendoza@yape.com.pe')`. Cuatro reglas lo bloquean ahora, cada
una atribuida a su autor: `examples-unused-column` (Lorem: ningún step nombra la
columna), `parameter-not-forwarded` (Lorem: la definition recibe el argumento y
no lo pasa), `parameter-unused` y `example-value-hardcoded` (Zorem: el método no
usa el parámetro o escribe el literal). Zorem las ve en `node tools/check.js`
antes de entregar. El borrador determinista ya nombra el dato en el step («el
usuario ingresa su correo <email> …»), la definition lo recibe y el Screen hace
`setValue(email)`; un ciclo con un getter por filtro recorre la DataTable con
`<columna>OptionFor(valor)`.

### El progreso indica «Borrador determinista no disponible»

El borrador de Derek no pudo materializarse y la corrida siguió sin él: Lorem y
Zorem trabajan en secuencia, sin contrato de interfaz previo, y Zorem no recibe
el helper `readRecordedText` del borrador, así que un caso con `VERIFICAR_TEXTO`
tarda más y puede encadenar rondas de reparación. El motivo exacto está en
`agents/derek/orchestration.json` (`draft.reason`, disponible aunque la corrida
se corte) y en `layered-generation-run.json` (`draft`). Un
`GENERATION_MATERIALIZATION_ERROR` sobre locator/getter apunta a un módulo de
locators cuyo JSON no declara un bloque por plataforma reconocible por sufijo
(`...Android`, `...Ios`/`...iOS`); corrige el JSON del framework o reporta el caso.

### La propuesta falla validación

El borrador permanece disponible para editarlo. Usa **Corregir con Copilot** o
corrige manualmente y **Reimportar corrección del agente**. En layered, Derek
dirige `repair-feedback.json` al autor de la capa afectada. **Revalidar** comprueba
el preview conforme al modo de revisión. Las sugerencias funcionales no bloquean;
errores técnicos nuevos de compilación o de integridad deben resolverse antes
de aplicar. Una propuesta fallida no se promociona a memoria.

### Falló la ejecución automática del agente

Revisa `layered-generation-run.json`, los resultados/feedback por rol y
`agent-run.json`. Comprueba instalación y autenticación de Copilot y el modelo
solicitado. No interpretes un aviso de presupuesto como fallo de proveedor.

En layered solo Zorem recibe permisos de scripts Node/Python para validar;
Lorem y Sumrak no reciben shell. No hay un `--deny-tool=bash` global añadido
al lanzamiento, ni permisos `--allow-all`. Los intérpretes autorizados no son
un sandbox del sistema operativo: trabaja únicamente con paquetes confiables.

## Logs y secretos

Los logs pueden incluir modo, plataforma, dispositivo, canal y mensajes de
error. No deben incluir:

- variables de ambiente del framework;
- BrowserStack username/access key;
- contraseñas, teléfonos, cuentas o tarjetas de datasets;
- contenido sensible escrito durante un step.

Sanitiza errores de APIs antes de enviarlos al renderer.

## Recuperación de generación

La escritura normal es atómica. Si una generación falla:

1. conserva el mensaje y las rutas afectadas;
2. verifica que no haya archivos temporales o parciales;
3. no borres archivos existentes para “desbloquear” el flujo;
4. corrige el generator/validator y repite Preview;
5. confirma hashes del registro antes de actualizar un archivo previo.

## Evidencia mínima para reportar un bug

- plataforma;
- local o BrowserStack, dispositivo y versiones (sin credenciales);
- acción exacta y mensaje completo;
- selector con estrategia, si aplica;
- screenshot/XML de la misma captura;
- resultado de `npm run typecheck`, prueba focalizada y `git status --short`.

## Sesión local en simulador iOS

El soporte local arranca por **simulador**, no por dispositivo físico: el
simulador no necesita firmar WebDriverAgent, que es la parte que más fricción da.

Requisitos en la Mac:

```bash
xcrun simctl list devices available     # debe listar al menos un simulador
./node_modules/.bin/appium driver install xcuitest
./node_modules/.bin/appium driver list --installed
```

`appium-xcuitest-driver` puede estar en el `node_modules` del recorder y aun así no estar
registrado: Appium lee los drivers del manifest, no del `package.json`.

En la pantalla de conexión local, el desplegable lista dispositivos Android y
simuladores iOS juntos; la plataforma la fija el que elijas. Para iOS pide el
**bundle ID** de una app ya instalada, o permite seleccionar un `.app`/`.ipa`
con el diálogo nativo. Un IPA compilado para dispositivo físico no puede
ejecutarse en Simulator: para ese caso se necesita la build `.app` destinada a
`iphonesimulator` (o un IPA que realmente empaquete esa build compatible).

El bundle ID y el archivo son opcionales. Si ambos quedan vacíos, XCUITest
inicia WebDriverAgent sin una aplicación predeterminada. El QA puede instalar y
abrir la app manualmente en Simulator; después debe volver al recorder y
refrescar screenshot/XML antes de inspeccionar o grabar acciones.

Si el simulador aparece como `apagado`, Appium lo arranca al iniciar la sesión.
