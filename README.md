# Appium Visual Recorder

Appium Visual Recorder es una herramienta visual acoplada a
`fwk-mobile-test`. Permite que un QA navegue una aplicación Android o iOS,
registre acciones, verifique selectores y entregue evidencia estructurada para
generar o actualizar las cuatro capas de automatización del framework:

1. Feature Gherkin.
2. Step Definitions.
3. Screen Object.
4. Locators Android/iOS.

El recorder no es un framework de ejecución independiente. Se ejecuta desde su
propio clon durante desarrollo o como aplicación macOS, pero siempre se enlaza
a una raíz válida de `fwk-mobile-test` como fuente de
ambientes, squads, datos, aplicaciones, artefactos reutilizables y destino de
generación.

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

El paquete incluye `hints.json` y `gaps.json` como vistas compactas derivadas.
Las consultas siguen **NO SEARCH WITHOUT GAP**: solo un gap abierto puede
autorizar búsquedas acotadas al índice incremental del framework.

## Requisitos

Requisitos generales:

- checkout local de `fwk-mobile-test`;
- Node.js 24+ y npm 11+, alineados con `engines` de `fwk-mobile-test`;
- Git con acceso SSH al repositorio privado del recorder;
- GitHub Copilot CLI instalado y autenticado para la generación automática;
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
./node_modules/.bin/appium --version
adb devices
```

## Inicio rápido: generar la aplicación macOS

Esta es la forma recomendada de probar la rama
`feature/recorder-macos-app`. El recorder puede clonarse en cualquier carpeta;
no tiene que vivir dentro de `fwk-mobile-test` porque la aplicación permite
elegir el framework desde su interfaz.

```bash
git clone --depth 1 \
  --branch feature/recorder-macos-app \
  --single-branch --recurse-submodules \
  git@github.com:kevinhuamani-zorem/tool-mobile.git visual-recorder

cd visual-recorder
npm ci
npm run inspector:build
npm run package:mac
```

`npm run package:mac` compila el recorder, valida el Inspector embebido, genera
`Appium Visual Recorder.app` dentro de `release/mac-*` y abre Finder con la
aplicación seleccionada.

En el primer arranque:

1. Abre `Appium Visual Recorder.app`.
2. Selecciona la raíz local de `fwk-mobile-test`.
3. Elige ambiente, squad y alcance de Features.
4. Conecta el dispositivo o simulador y comienza la grabación.

La aplicación conserva la ruta seleccionada. Puede cambiarse posteriormente
desde **Ajustes → Cambiar proyecto**. Los archivos finales se aplican al
`fwk-mobile-test` elegido; grabaciones, paquetes del agente y cachés permanecen
en el runtime escribible del recorder.

El `.app` generado es local, sin firma ni notarización. En otra Mac puede ser
necesario abrirlo la primera vez mediante clic derecho → **Abrir**. El build es
específico de la arquitectura de la Mac que lo genera.

Para generar además un DMG de pruebas internas:

```bash
npm run dmg:mac
```

El DMG queda en `release/`. Para publicar la aplicación fuera del equipo se
requieren firma Developer ID, hardened runtime y notarización; todavía no son
parte de esta rama.

### Actualizar el clon y volver a generar el `.app`

```bash
git pull --ff-only origin feature/recorder-macos-app
git submodule update --init --recursive
npm ci
npm run inspector:build
npm run package:mac
```

`npm ci` es necesario cuando cambia el lockfile o se desea garantizar una
instalación reproducible. No uses `--ignore-scripts`: Electron necesita su
binario nativo para construir y abrir la aplicación.

## Ejecución local para desarrollo

Desde la raíz del clon del recorder:

```bash
npm run recorder
```

Este alias compila y abre Electron. El proceso principal inicia y detiene su
propio Appium con UiAutomator2/XCUITest, igual que el `.app`; no requiere un
script de shell ni un servidor Appium externo. En el primer inicio también
solicita la raíz de `fwk-mobile-test`.

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
runtime/recordings/<recording>/generation/automation/
```

En el flujo normal, el recorder abre Copilot en una Terminal con el prompt
acotado, espera el artefacto de respuesta, lo valida y lleva automáticamente el
resultado válido a Revisión. La apertura manual, el prompt y la reimportación
se conservan en **Opciones avanzadas / diagnóstico** para corregir una
propuesta que no superó el contrato.

El paquete contiene como máximo el contexto mínimo necesario:

- `scenario.json` normalizado;
- `generation-plan.json`;
- contexto resuelto y gaps pendientes;
- firmas y fragmentos reutilizables del squad/Home;
- reglas compactas y verificador autocontenido.
- `agent-run.json` con métricas locales de duración, cache, lecturas y tamaños;
  nunca contiene prompts, XML, capturas ni secretos.

El agente escribe `agent-response.json`. El recorder lo importa y aplica un
validador determinista. Solo una respuesta con score 100 puede llegar al
preview y promocionarse a memoria reutilizable.

El acceso al framework usa un único CodeGraph incremental. La capa
`FrameworkQueryService` permite consultar escenarios, Screen Objects, Steps,
Examples, locators, contrato, helpers e imports con respuestas JSON limitadas
por cantidad y bytes; una consulta caliente no vuelve a leer archivos que no
cambiaron.

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

Comandos desde la raíz del recorder:

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
└── package.json
```

## Tecnologías

- Electron y React.
- TypeScript y Vite.
- Appium y WebdriverIO.
- Cucumber/Gherkin compatible con `fwk-mobile-test`.
- Node.js 24+ y npm 11+ para desarrollo y empaquetado reproducible.
