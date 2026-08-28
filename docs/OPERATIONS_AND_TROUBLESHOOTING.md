# Operación y troubleshooting

## Inicio rápido

```bash
npm --prefix tools/visual-recorder run recorder
```

Ejecuta el comando desde la raíz de `fwk-mobile-test`. El recorder resuelve el
framework padre automáticamente y usa Copilot como agente. No requiere `.env`,
`TARGET_PROJECT` ni selección de proveedor. La plataforma queda fija al crear
la sesión.

Para usar el Inspector embebido en un checkout nuevo:

```bash
git submodule update --init --recursive tools/visual-recorder/vendor/appium-inspector
npm --prefix tools/visual-recorder run inspector:build
RECORDER_INSPECTOR=embedded npm --prefix tools/visual-recorder run recorder
```

`RECORDER_INSPECTOR=legacy` conserva el inspector visual previo. Sin variable,
se usa el modo embebido cuando sus assets están presentes y se vuelve a legacy
con una advertencia visible cuando faltan. Si se solicita `embedded`
explícitamente sin assets, la apertura falla indicando el comando de build.
BrowserStack conserva legacy porque el protocolo fijado no transporta
credenciales; estas nunca se exponen al bundle.

## Diagnóstico por síntomas

### Electron failed to install correctly

El paquete JavaScript existe, pero falta `Electron.app`; normalmente se instaló
con `--ignore-scripts`. Repara la instalación con:

```bash
npm --prefix tools/visual-recorder rebuild electron
```

Para una reinstalación reproducible usa `npm --prefix tools/visual-recorder ci`
sin `--ignore-scripts`. `run.sh` comprueba tanto el wrapper como el binario antes
de compilar o iniciar Appium.

### El puerto 4723 está ocupado

`run.sh` se detiene para no matar una sesión desconocida. Localiza y cierra la
instancia Appium que posee el puerto, o reutiliza conscientemente un servidor
compatible. No automatices un borrado indiscriminado de procesos.

### Faltan assets del Inspector embebido

Inicializa el submódulo y recompila la caché:

```bash
git submodule update --init --recursive tools/visual-recorder/vendor/appium-inspector
npm --prefix tools/visual-recorder run inspector:build
```

El recorder no habilita CORS global en Appium. Abre un proxy loopback efímero
que solo acepta el origen `appium-recorder://inspector` y rutas de la sesión
activa. No se relaja la navegación, el sandbox ni el bridge de Electron.

### Appium falla con `AppiumIpc is not a constructor`

Indica que el runtime aislado del recorder quedó incompleto o fue alterado.
`run.sh` valida `AppiumIpc` antes de abrir la sesión y muestra las versiones
detectadas. Restaura exactamente el lockfile de la herramienta; no cambies
overrides ni dependencias del framework padre.

Comprueba el árbol efectivo desde la raíz:

```bash
npm --prefix tools/visual-recorder ls appium @appium/base-driver appium-uiautomator2-driver appium-xcuitest-driver
```

El árbol no debe reportar paquetes `invalid` y `@appium/base-driver` debe
exponer `AppiumIpc`. Reinstala todo el runtime del recorder con:

```bash
npm --prefix tools/visual-recorder ci
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
./tools/visual-recorder/node_modules/.bin/appium driver install xcuitest
./tools/visual-recorder/node_modules/.bin/appium driver list --installed
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
