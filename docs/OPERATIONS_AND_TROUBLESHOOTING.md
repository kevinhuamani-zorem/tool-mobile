# Operación y troubleshooting

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

- `RECORDER_AGENT_EXECUTION_MODE=manual` (default): abre Terminal para handoff.
- `RECORDER_AGENT_EXECUTION_MODE=automatic`: ejecuta dos pasadas controladas
  (query-requests/query-results y luego agent-response) con budgets y policy de
  fallback. En macOS, PASS 2 abre la interfaz de Copilot en Terminal con el
  prompt generado; el recorder observa el artefacto validado e importa la
  propuesta automáticamente. La Terminal puede permanecer abierta para revisar
  la conversación sin bloquear el wizard.

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

Comprueba que Terminal se abrió en `generation/automation`, que se usó el prompt
mostrado, que `instructions.md` prohíbe explorar el target y que los contextos
suman como máximo 20 KB. El recorder no inicia ni termina el CLI: el usuario
controla la sesión manual. No amplíes el paquete; corrige el resolver para
convertir información repetible en decisiones del plan.

### La propuesta falla validación

Importar crea `repair-context.json` con errores concretos. Usa “Abrir Terminal
del agente” y pega el prompt actualizado; solo puede corregir archivos afectados y dispone de un intento.
Después debe volver a ejecutarse la importación. Un fallo no entra a memoria.

### Falló la ejecución automática del agente

Si el modo es `automatic`, revisa `agent-run.json` y `status.json` del package.
Solo errores del provider `AGENT_NOT_INSTALLED` y `AGENT_UNAVAILABLE` habilitan
fallback automático a handoff manual; errores de contrato/presupuesto se
detienen sin fallback.

`bash` permanece denegado de forma permanente en el flujo agentic. No se
habilita como vía temporal ni de desbloqueo: el agente debe operar únicamente
con los artefactos del paquete y rutas relativas.

Si falla antes de invocar Copilot por `CONTEXT_BUDGET_EXCEEDED`, `status.json`
queda en `failed` con `errorCode` explícito y `agent-run.json` conserva el
desglose por pasada (`pass1ContextBreakdown`, `pass2ContextBreakdown`).

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
