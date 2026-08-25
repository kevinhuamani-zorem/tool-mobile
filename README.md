# Appium Visual Recorder

Appium Visual Recorder es una herramienta visual acoplada a
`fwk-mobile-test`. Permite que un QA navegue una aplicación Android o iOS,
registre acciones, verifique selectores y entregue evidencia estructurada para
generar o actualizar las cuatro capas de automatización del framework:

1. Feature Gherkin.
2. Step Definitions.
3. Screen Object.
4. Locators Android/iOS.

El recorder no es un framework de ejecución independiente. Funciona
exclusivamente instalado en `fwk-mobile-test/tools/visual-recorder` y usa el
framework padre como fuente de ambientes, squads, datos, aplicaciones,
artefactos reutilizables y destino de generación.

## Flujo actual

```text
QA graba y verifica acciones
        ↓
scenario.json + selectores + evidencia
        ↓
preprocesador determinista
        ↓
generation-plan.json + contexto mínimo
        ↓
agente resuelve únicamente los gaps
        ↓
agent-response.json
        ↓
validador determinista
        ↓
preview editable
        ↓
Feature + Steps + Screen Object + Locators
```

El preprocesador busca primero reutilización en el squad seleccionado y en
Home. El agente no recibe todo `fwk-mobile-test`: recibe selectores ya
verificados, decisiones de reutilización, APIs relevantes y únicamente el
contexto necesario para completar los gaps.

## Requisitos

Requisitos generales:

- checkout local de `fwk-mobile-test`;
- Node.js 24+ y npm 11+, alineados con `engines` de `fwk-mobile-test`;
- Git con acceso SSH al repositorio privado del recorder;
- Appium 3, UiAutomator2 y XCUITest se instalan dentro del recorder con
  versiones fijadas; el framework padre no necesita declararlos para usar la
  herramienta.

Requisitos según plataforma:

- **Android local:** Java 17+, Android SDK/ADB, UiAutomator2 y depuración USB.
- **iOS local:** macOS, Xcode, WebDriverAgent y el driver XCUITest.
- **BrowserStack:** credenciales válidas, dispositivo y app disponibles en la
  cuenta. Java no es necesario por usar BrowserStack.

Comprobaciones frecuentes:

```bash
node --version
npm --version
./tools/visual-recorder/node_modules/.bin/appium --version
adb devices
```

## Instalación dentro de fwk-mobile-test

El repositorio es privado. Desde la raíz de `fwk-mobile-test`, ejecuta:

```bash
git clone --depth 1 --branch visual-recorder --single-branch \
  git@github.com:kevinhuamani-zorem/tool-mobile.git tools/visual-recorder \
  && ./tools/visual-recorder/install.sh
```

El instalador:

- valida que la carpeta actual sea la raíz de `fwk-mobile-test`;
- instala el checkout en `tools/visual-recorder`;
- ejecuta `npm ci` con el lockfile del recorder para Appium, drivers, Electron,
  renderer y WebdriverIO;
- no modifica `package.json`, `package-lock.json` ni `.gitignore` del framework;
- agrega la exclusión solo local `/tools/visual-recorder/` en
  `.git/info/exclude` cuando el framework es un checkout Git;
- rechaza actualizaciones si encuentra cambios locales sin guardar dentro del
  recorder.

Para instalar e iniciar en el mismo comando:

```bash
git clone --depth 1 --branch visual-recorder --single-branch \
  git@github.com:kevinhuamani-zorem/tool-mobile.git tools/visual-recorder \
  && ./tools/visual-recorder/install.sh --start
```

Si GitHub CLI está instalado y autenticado, también puede descargarse el
instalador privado directamente:

```bash
gh auth login
gh api -H 'Accept: application/vnd.github.raw+json' \
  'repos/kevinhuamani-zorem/tool-mobile/contents/install.sh?ref=visual-recorder' \
  | bash
```

`raw.githubusercontent.com` sin autenticación devuelve `404` para el
repositorio privado.

### Actualizar una instalación existente

Desde la raíz de `fwk-mobile-test`:

```bash
./tools/visual-recorder/install.sh
```

La actualización usa `fast-forward`; no sobrescribe cambios locales del
recorder.

## Ejecución

Desde la raíz del framework:

```bash
npm --prefix tools/visual-recorder run recorder
```

El comando inicia Appium, compila el proceso principal y el renderer React, y
abre Electron. Si el puerto `4723` ya está ocupado, el recorder se detiene para
no cerrar una sesión ajena. Appium y sus drivers se cargan siempre desde
`tools/visual-recorder/node_modules`, aislados de los `overrides` del framework.
No instales con `--ignore-scripts`, porque Electron necesita descargar su
binario nativo durante `npm ci`.

## Configuración inicial

Al iniciar, el recorder escanea `fwk-mobile-test` y permite elegir:

- ambiente definido bajo `config/envs`;
- squad propietario de la automatización;
- ruta anidada opcional de Features dentro del squad;
- conexión local o BrowserStack;
- plataforma Android o iOS;
- dispositivo y aplicación.

Squad y ruta de Feature son conceptos diferentes. Por ejemplo, puede elegirse
el squad `interoperabilidad` y el alcance `tapp/payment`. El Feature se genera
en esa subruta, mientras Steps, Screen Objects y Locators siguen perteneciendo
al squad.

Los valores secretos de los ambientes del framework (`config/envs/.env.*`)
permanecen en el proceso principal. El renderer solo recibe el nombre de las
variables y su estado de configuración. El recorder no utiliza un `.env` propio.

## Flujos de trabajo del QA

### Crear un caso nuevo

1. Configura y conecta el dispositivo.
2. Navega o inspecciona la aplicación.
3. Selecciona un elemento y verifica el selector propuesto.
4. Describe brevemente qué función cumple el elemento.
5. Elige la acción y registra el valor funcional cuando aplique.
6. Guarda el paso y continúa hasta completar el flujo.
7. Define objetivo, criterio de aceptación e ID `TC-<número>`.
8. Prepara el paquete mínimo para el agente.
9. Importa y valida `agent-response.json`.
10. Revisa el preview y genera las cuatro capas.

El campo **¿Qué función cumple este elemento?** es una pista de contexto. No se
copia como Step ni obliga al agente a redactar el Gherkin con ese texto.

La grabación debe incluir al menos una verificación. Un caso sin resultado
esperado no es un caso de prueba, así que el paso 8 se detiene antes de escribir
nada y pide grabar el `Then`. Fallar temprano evita que el agente gaste tokens
en un caso que el verificador rechazaría igual al final.

### Completar una grabación existente

Este flujo cubre dos situaciones distintas y el recorder pide elegir cuál
aplica. El selector muestra únicamente recordings del ambiente y squad activos.

**Seguir grabando pasos.** Recupera las acciones ya capturadas y devuelve el
recorder a modo grabación sobre la misma carpeta, de modo que los pasos nuevos
se suman a los anteriores en vez de crear una segunda grabación a medias. Es la
salida cuando falta el `Then`: sin él la grabación nunca llega a tener plan de
generación. La metadata del caso se rellena desde el recording para que no
cambie el fingerprint. Solo está disponible desde la plataforma con la que se
grabó, porque los pasos nuevos se agregan a esas acciones.

**Completar locators pendientes.** Se usa cuando los archivos solo tienen
cobertura para una plataforma. Requiere un plan de generación ya existente.

- Si falta iOS o Android, el QA captura y verifica los selectores pendientes.
- El recorder actualiza únicamente el bloque de locators de la plataforma
  activa.
- Feature, Steps y Screen Object existentes se conservan.
- Al completar cobertura, el Feature obtiene el tag `@android` o `@ios`
  correspondiente sin eliminar tags válidos previos.

### Regenerar una automatización

Permite volver a procesar un recording sin repetir la grabación. Puede elegirse
un caso aún no resuelto por el agente o uno ya generado.

- La instrucción de mejora es opcional.
- Se conserva `recordingId`, evidencia, orden de acciones y rutas administradas.
- Una automatización existente se versiona antes del refinamiento.
- El nuevo preview puede actualizar Feature, Steps, Screen Object y Locators.
- Solo se reemplazan archivos reconocidos por el registro del recorder y que no
  fueron modificados externamente.

La opción de limpieza elimina paquetes y propuestas generadas, pero conserva
la evidencia original para volver a probar el agente.

## Inspector y evidencia

El inspector combina screenshot y jerarquía XML para seleccionar el elemento
correcto. El QA debe verificar el selector antes de guardar la acción. El
recording conserva:

- orden y tipo de cada acción;
- selector verificado y estrategia Appium;
- contexto funcional aportado por el QA;
- valores funcionales como teléfono, correo o monto;
- screenshot y XML asociados cuando son necesarios;
- plataforma, ambiente, squad y alcance de Feature.

Contraseñas, PIN, OTP, tokens y credenciales se redactan antes de preparar el
paquete para el agente.

La lectura del XML completo es circunstancial. Si el selector verificado es
suficiente, el agente debe usarlo y no explorar XML ni el framework completo.

## Acciones soportadas

El recorder puede registrar, ejecutar y trazar acciones como:

- click y presión prolongada;
- escritura y limpieza de campos;
- validación de texto, contenido o existencia;
- scroll y swipe por arrastre;
- espera controlada;
- navegación hacia atrás;
- captura de pantalla.

Varias acciones técnicas consecutivas pueden mapearse a un único comportamiento
funcional. El Gherkin debe ser declarativo y no una transcripción imperativa de
clicks, scrolls o esperas.

## Generación y reutilización

Las rutas soportadas en `fwk-mobile-test` son:

```text
features/yape-features/<squad>/<scope>/<archivo>.feature
features/yape-steps-definitions/<squad>/<archivo>.steps.ts
screenobjects/<squad>/<archivo>.screen.ts
resources/locators/<squad>/<archivo>.locator.json
```

Antes de crear archivos, el resolver sigue relaciones entre Feature, Step
Definition, Screen Object y Locators. Cuando encuentra un artefacto compatible:

- reutiliza Steps existentes;
- amplía Screen Objects sin borrar métodos previos;
- añade locators sin reemplazar claves existentes;
- mantiene rutas y nombres ya adoptados por el framework.

Los Steps solo orquestan. La lógica Appium vive en Screen Objects y helpers del
framework. Los imports generados usan los aliases configurados por
`fwk-mobile-test`, como `@screenobjects`, `@utils` y `@locators`.

Los locators conservan un nombre lógico común y valores independientes por
plataforma. Los bloques siguen la convención `<módulo>Android` y `<módulo>Ios`.

## Reglas del caso generado

Estas reglas las impone el recorder, no dependen del criterio del agente. Cada
una se comprueba en el validador que corre al importar la propuesta y en el
`verify-package.js` que el agente ejecuta dentro de su propia carpeta, para que
se corrija antes de devolver nada.

**Aserción obligatoria.** Sin una acción de verificación no se arma el paquete.

**Steps reutilizados, literales.** Las filas que el plan marca como reutilizadas
ya existen como Step Definition en el framework, con esa expresión exacta.
Reescribirlas —cambiar el parámetro por un valor literal, perder una tilde— deja
el Feature apuntando a un step inexistente, y Cucumber lo reporta como
*undefined* recién al ejecutar. El caso típico es el login:
`Given el usuario <username> inicia sesión en Yape` se copia tal cual.

**Parámetros con Examples.** Todo `<parámetro>` obliga a `Scenario Outline:` y a
una columna en la tabla `Examples:`. Sin la columna, el parámetro llega literal
al step y no enlaza.

**Idioma.** El código va en inglés —métodos, getters, claves de locator,
variables y nombres de archivo—, igual que el resto del framework. El español se
reserva para lo que lee el QA: la línea `Feature:`, el nombre del `Scenario` y el
texto de los steps. El recorder traduce el vocabulario del dominio por su cuenta
para no gastar tokens del agente en eso, y solo delega lo que no reconoce.

**Acciones repetitivas.** Cuando detecta un ciclo que se repite variando un solo
valor, el recorder lo propone al QA con las lecturas posibles —tabla de datos en
un mismo escenario, `Scenario Outline` con varias filas, o encadenar las vueltas—
y explica el costo de cada una. La decisión es del QA, el recorder no la toma.

**Escritura aditiva.** Los artefactos existentes se editan agregando, nunca
reemplazando: los métodos, locators y definitions previos se conservan y lo nuevo
queda marcado con un comentario de procedencia que indica la grabación de origen.

**Anclajes del framework.** `BaseScreen`, `LocatorFactory` y el enum
`TypeLocator` se resuelven leyendo el framework en cada grabación —los alias
salen de su `tsconfig.json` y cada anclaje se busca por su declaración, no por su
ruta—. Si el framework los mueve o renombra, el import generado los sigue.

## Agente y contexto mínimo

El agente se usa únicamente cuando el preprocesador deja gaps semánticos o de
estructura. El paquete se guarda dentro de:

```text
tools/visual-recorder/runtime/recordings/<recording>/generation/automation/
```

La pantalla **Abrir Terminal del agente** abre una terminal en esa ruta y
muestra el prompt inicial. No ejecuta automáticamente el agente.

El paquete contiene como máximo el contexto mínimo necesario:

- `scenario.json` normalizado;
- `generation-plan.json`;
- contexto resuelto y gaps pendientes;
- firmas y fragmentos reutilizables del squad/Home;
- reglas compactas y verificador autocontenido.

El agente escribe `agent-response.json`. El recorder lo importa y aplica un
validador determinista. Solo una respuesta con score 100 puede llegar al
preview y promocionarse a memoria reutilizable.

## Preview, validación y escritura

Antes de escribir en `fwk-mobile-test`, el usuario revisa los cuatro archivos
en un visor editable. El validador comprueba, entre otros contratos:

- escenario con formato `[TC-10239][Path][AUTO-FRONT]`;
- Gherkin declarativo con aserción `Then`;
- tags de plataforma acordes a la cobertura real;
- trazabilidad completa entre acciones y Steps funcionales;
- nombres descriptivos para archivos, clases, aliases y métodos;
- sintaxis TypeScript y JSON;
- imports mediante aliases del framework y ausencia de imports sin uso;
- bloques Android/iOS soportados;
- steps reutilizados copiados literalmente y parámetros con su `Examples`;
- identificadores en inglés en las capas de código;
- ausencia de duplicados semánticos y rutas fuera del squad autorizado;
- actualización aditiva de artefactos reutilizados.

El preview genera un token ligado al contenido exacto. Si se modifica una ruta,
acción, metadata o archivo revisado, el token se invalida y debe generarse un
nuevo preview.

Todos los archivos nuevos incluyen metadata del recorder, autor
`Kevinarnold.zorem` y fecha de creación. En JSON la metadata vive en
`_metadata`.

## Ejecutar el caso generado

El recorder genera archivos para `fwk-mobile-test`; la ejecución se realiza con
los comandos y configuraciones del propio framework. Usa el tag o ID del caso
creado según la convención vigente del proyecto, por ejemplo:

```bash
npm test -- --cucumberOpts.tagExpression='@miflujo'
```

Confirma el comando exacto en el README y los scripts de la versión local de
`fwk-mobile-test`, ya que el recorder no mantiene un runner alternativo.

## Datos locales y seguridad

No se versionan:

- `runtime/`, recordings, screenshots y XML;
- memoria del agente y paquetes de generación;
- `coverage/`, `test-results/` y builds;
- credenciales BrowserStack o secretos del framework.

La escritura está confinada al recorder y a las cuatro capas autorizadas del
framework. No se sobrescriben silenciosamente archivos ajenos o modificados
fuera del recorder.

## CodeGraph

El CodeGraph del framework indexa relaciones entre Features, Steps, Screen
Objects, métodos y locators para reducir contexto y detectar reutilización.

```bash
cd tools/visual-recorder
npm run codegraph:export -- --squad payment --feature movimientos
npm run codegraph:export -- --squad payment --search yapear --limit 60
```

Los archivos `.json`, `.dot` y `.mmd` generados viven en `runtime/`. El `.dot`
puede visualizarse en VS Code con Graphviz Interactive Preview y el `.mmd` con
una extensión Mermaid.

El grafo interno del recorder sirve para mantenimiento:

```bash
npm run codegraph:recorder -- --search generateFwkFiles
npm run codegraph:recorder -- --component ScenarioBuilderModal
npm run codegraph:recorder -- --ipc preview-fwk-files
```

## Desarrollo y calidad

Comandos dentro de `tools/visual-recorder`:

```bash
npm ci
npm run typecheck
npm test
npm run quality:metrics
npm run quality
npm run build
```

`npm run quality` es la puerta obligatoria para cambios que afecten generación,
IPC, workspace, drivers o validación.

Documentación técnica:

- [`AGENTS.md`](AGENTS.md): reglas obligatorias para personas y agentes.
- [`docs/README.md`](docs/README.md): índice técnico.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): arquitectura y límites.
- [`docs/GENERATION_CONTRACT.md`](docs/GENERATION_CONTRACT.md): contrato de las
  cuatro capas.
- [`docs/GENERATION_QUALITY_ASSURANCE.md`](docs/GENERATION_QUALITY_ASSURANCE.md):
  métricas y procedimiento QA.
- [`docs/OPERATIONS_AND_TROUBLESHOOTING.md`](docs/OPERATIONS_AND_TROUBLESHOOTING.md):
  operación y diagnóstico.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md): desarrollo del propio recorder.

## Estructura del recorder

```text
visual-recorder/
├── core/                  Dominio, escaneo, generación y validación
├── recorder/src/          Electron main, preload e inspector
├── recorder/renderer/     Aplicación React
├── config/                Ejemplos de configuración local
├── docs/                  Arquitectura, contratos y operación
├── scripts/               Calidad y CodeGraph
├── tests/                 Contratos ejecutables
├── runtime/               Evidencia y caché local no versionada
├── install.sh             Instalación acoplada al framework
├── run.sh                 Arranque de Appium y Electron
└── package.json
```

## Tecnologías

- Electron y React.
- TypeScript y Vite.
- Appium y WebdriverIO.
- Cucumber/Gherkin compatible con `fwk-mobile-test`.
- Node.js 20.19+ o 22.12+.
