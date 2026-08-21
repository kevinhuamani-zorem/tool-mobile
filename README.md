# Appium Visual Recorder

Herramienta de grabación visual de pruebas mobile. Registra acciones y
selectores comprobados, resuelve determinísticamente la reutilización del
framework y genera Feature, Steps, Screen Object y Locators con una IA limitada
exclusivamente a las brechas del plan.

## Documentación para mantenimiento

La guía técnica para continuar el proyecto está en
[`docs/README.md`](docs/README.md). Las reglas obligatorias para personas y
agentes de IA están en [`AGENTS.md`](AGENTS.md).

> Puede vivir integrado o ejecutarse como herramienta independiente. El
> proyecto destino se resuelve mediante el adaptador activo. Las configuraciones
> locales quedan en `config/` y las capturas temporales en `runtime/`; ambas
> están excluidas de Git.

## Modos de workspace

El recorder puede ejecutarse sin estar dentro de `fwk-mobile-test`:

```text
fwk-mobile  → usa las cuatro capas de un proyecto fwk-mobile externo
standalone  → crea un workspace WebdriverIO autocontenido
neutral     → exporta únicamente Gherkin y recording.json
```

Ejemplos:

```bash
RECORDER_MODE=fwk-mobile TARGET_PROJECT=/ruta/al/fwk-mobile-test ./run.sh
RECORDER_MODE=standalone ./run.sh
RECORDER_MODE=neutral ./run.sh
```

También puedes copiar `config/workspace.example.json` como
`config/workspace.json`. El archivo real permanece dentro del recorder y está
excluido de Git. Sin configuración explícita se detecta `fwk-mobile` cuando
existe como proyecto padre; en otra ubicación se selecciona `standalone`.

El adaptador `standalone` crea su proyecto por defecto en
`tools/visual-recorder/workspace`. El modo `neutral` escribe salidas portables
en `tools/visual-recorder/runtime/exports`. El adaptador `fwk-mobile` acepta
cualquier ruta mediante `TARGET_PROJECT`, por lo que el recorder ya no necesita
vivir dentro del repositorio objetivo.

## Descubrimiento del framework

Al iniciar, el recorder escanea la raíz de `fwk-mobile-test` y presenta:

- ambientes definidos como `config/envs/.env.*`;
- squads disponibles en las capas del framework;
- APK/IPA ubicados en `resources/apps`;
- datasets de `resources/data`;
- conteos de features, steps, Screen Objects y locators.

Del `.env` solo se envían a la interfaz los nombres de las variables y si están
configuradas. Los valores permanecen en el proceso principal y las claves
sensibles se clasifican como tales. Esto permite usar el ambiente seleccionado
en una fase posterior sin exponer secretos en Electron.

## Salida compatible con fwk-mobile-test

La generación normal solicita squad, archivo, módulo de locators, ID `TC-10239`,
tipo de camino y tag. La salida se escribe directamente en:

    features/yape-features/<squad>/<archivo>.feature
    resources/locators/<squad>/<módulo>.locator.json

Los locators usan los bloques `<módulo>Android` o `<módulo>Ios` esperados por el
framework. Si se informa un usuario de data, el feature usa `Scenario Outline`
y crea su tabla `Examples`.

La generación valida todas las rutas, escribe primero archivos temporales y no
sobrescribe archivos existentes. Los locators capturados permanecen en memoria
hasta que el usuario presiona `GENERAR`.

### Generación segura de Steps y Screen Objects

El constructor permite redactar los steps Gherkin y asociarles una o más
acciones grabadas. Al presionar Continuar desde Gherkin:

1. se indexan las expresiones regulares `Given`, `When` y `Then` existentes;
2. cada texto se contrasta con escenarios y squads existentes;
3. se muestra exactamente qué casos serían impactados;
4. el usuario debe corregir el conflicto y se generan definiciones nuevas:

       features/yape-steps-definitions/<squad>/<archivo>.steps.ts
       screenobjects/<squad>/<módulo>.screen.ts

No se reutilizan ni modifican steps ajenos automáticamente. El Steps file solo
orquesta y llama al Screen Object. El Screen Object extiende
`BaseScreen`, resuelve elementos con `LocatorFactory` y usa los helpers del
framework para clicks, escritura, espera, validaciones y gestos soportados.
También se indexan los métodos públicos para validar el impacto antes de
escribir.

### Pipeline de automatización con contexto mínimo

```text
scenario.json
  → resolver determinista
  → generation-plan.json + contexto resuelto/no resuelto
  → memoria 100% o Copilot/Claude solo para gaps
  → agent-response.json
  → validator determinista
  → preview editable
  → escritura y memoria versionada
```

Al iniciar una sesión existen tres flujos separados:

- **Crear un caso nuevo:** registra acciones y genera las cuatro capas.
- **Completar una grabación:** captura únicamente los locators faltantes de la
  plataforma activa; no regenera Steps. Al completar la cobertura actualiza el
  Feature con `@android` o `@ios` sin eliminar los tags ya disponibles.
- **Regenerar una automatización:** parte de un caso validado e importado,
  conserva sus rutas, guarda la versión anterior y permite refinar las cuatro
  capas con el agente antes de reemplazar los archivos administrados. La
  indicación de mejora es opcional; vacía solicita una revisión general.

El agente no recibe el repositorio completo. Squad/Home, selectores verificados,
rutas y orden ya están resueltos. El paquete tiene un límite de 20 KB y solo
existe una reparación dirigida. “Abrir Terminal del agente” abre una terminal
en la carpeta exacta del paquete, pero no ejecuta Copilot/Claude. La pantalla
muestra un prompt inicial copiable para que el usuario elija el agente y lo
inicie manualmente.

Los Screen Objects usan nombres derivados de su archivo. Por ejemplo,
`cuentas-tapp-ingresar-opcion.screen.ts` genera la clase
`CuentasTappIngresarOpcionScreen` y el alias importado
`cuentasTappIngresarOpcionScreen`; el validador rechaza nombres genéricos.

El preprocesador añade `reuse-context.json` con hasta cinco casos cercanos y
`collision-report.json` con coincidencias exactas. Si reconoce un caso ya
automatizado con sus cuatro capas, conserva esos archivos y evita abrir el
agente. El validador vuelve a comprobar las colisiones al importar la respuesta.

Configura el proveedor en `.env`:

```dotenv
AUTOMATION_AGENT=copilot
# AUTOMATION_AGENT=claude
```

El `.env` real está excluido de Git. Los reportes generados por pruebas,
cobertura o métricas bajo `coverage/`, `test-results/` y `runtime/quality/`
también están excluidos; las pruebas y el procedimiento QA sí se versionan.

Al finalizar, el usuario revisa acciones, describe objetivo/aceptación, prepara
el paquete, abre la Terminal si necesita resolver gaps, importa la respuesta y
edita las cuatro capas en el visor. Solo una
generación validada con score 100 se guarda como memoria reutilizable.

### CodeGraph local

El recorder indexa localmente las relaciones entre Features, Scenarios, Step
Definitions, Screen Objects, métodos y locators. El grafo se consulta
localmente para reducir el contexto necesario durante mantenimiento y análisis.
El cache incremental se guarda exclusivamente como
`tools/visual-recorder/runtime/codegraph-<modo>.json`, excluido de Git. El proyecto se
usa en modo lectura y los archivos sin cambios no se vuelven a indexar.

Para visualizar un subgrafo en VS Code:

```bash
cd tools/visual-recorder
npm run codegraph:export -- --squad payment --feature movimientos
```

Se generan dentro de `runtime/`:

```text
codegraph-payment-movimientos.dot
codegraph-payment-movimientos.mmd
```

El `.dot` puede abrirse con **Graphviz Interactive Preview** y el `.mmd` con
una extensión de preview para Mermaid. Opciones adicionales:

```bash
npm run codegraph:export -- --squad payment --search yapear --limit 60
npm run codegraph:export -- --squad payment --feature login --format dot
```

El límite permitido es de 10 a 150 nodos. Tanto el nombre de salida como la
ruta se normalizan y siempre permanecen dentro de `tools/visual-recorder/runtime`.

### CodeGraph del propio recorder

Existe un segundo grafo separado para desarrollar y mantener
`tools/visual-recorder`. Indexa:

- módulos e imports TypeScript/JavaScript;
- componentes React;
- servicios y símbolos;
- canales IPC `renderer → preload → main`;
- IDs JSX y bindings mediante `getElementById`;
- scripts npm y pruebas unitarias.

Consultas:

```bash
npm run codegraph:recorder -- --search generateFwkFiles
npm run codegraph:recorder -- --component ScenarioBuilderModal
npm run codegraph:recorder -- --ipc preview-fwk-files
```

Por defecto genera JSON, DOT y Mermaid dentro de `runtime/`. Para obtener solo
el JSON compacto que puede consumirse como contexto:

```bash
npm run codegraph:recorder -- \
  --ipc preview-fwk-files \
  --limit 40 \
  --format json
```

El índice incremental vive en `runtime/codegraph-recorder.json`. El grafo
permanece local y sirve para consultar la arquitectura y cargar únicamente los
módulos relacionados durante mantenimiento del recorder.

La puerta completa de calidad se ejecuta con `npm run quality`. Los umbrales y
el procedimiento manual están en
[`docs/GENERATION_QUALITY_ASSURANCE.md`](docs/GENERATION_QUALITY_ASSURANCE.md).

### Preview y validación

Antes de generar es obligatorio presionar `Preview`. La interfaz permite
alternar y revisar el contenido de cada archivo propuesto. El proceso principal:

- valida el formato Gherkin y `[TC-10239][Path][AUTO-FRONT]`;
- valida los bloques Android/iOS y la sintaxis JSON;
- valida sintaxis TypeScript de Steps y Screen Objects;
- informa selectores pendientes para la otra plataforma;
- detecta conflictos con archivos existentes;
- rechaza rutas fuera de las capas permitidas.

Cada Preview crea un token asociado al contenido exacto de la grabación y la
configuración elegida. Si se modifican steps, rutas o metadatos después de
revisar, `GENERAR` se rechaza y exige ejecutar Preview nuevamente.

---

## Como funciona

    MODO 1 - GRABACION
    Panel Electron → Conecta con dispositivo Android via Appium →
    XML Hierarchy Viewer permite inspeccionar elementos →
    Se captura XPath automaticamente → Se generan .feature y .locators

    MODO 2 - EJECUCION
    Lee el .feature generado → Resuelve variables del .locators →
    Ejecuta con Cucumber + WebdriverIO + Appium →
    Genera reporte HTML

---

## Pre-requisitos

    Node.js 18+
    Verificar : node --version
    Descargar : https://nodejs.org

    Java 17+ (requerido unicamente para Android local; no es necesario para BrowserStack ni iOS local)
    Verificar : java --version
    Descargar : https://adoptium.net

    Android SDK / ADB
    Verificar : adb --version
    Incluido en Android Studio : https://developer.android.com/studio

    Appium 3+
    Verificar : appium --version
    Instalar  : npm install -g appium

    Appium UiAutomator2 Driver
    Instalar  : appium driver install uiautomator2
    Verificar : appium driver list --installed

    Dispositivo Android con depuracion USB activada
    Verificar : adb devices

---

## Instalacion

    cd tools/visual-recorder
    npm install

---

## Ejecucion del grabador

    npm run recorder

También puede iniciarse directamente desde esta carpeta:

    ./run.sh

El script automaticamente:
- Limpia el puerto 4723
- Inicia Appium en background
- Compila TypeScript
- Abre el panel Electron

---

## Flujo de grabacion

    1. CONFIGURACION DEL DISPOSITIVO
       - El panel detecta automaticamente los dispositivos conectados
       - Presionar "Detectar" para obtener el package de la app en primer plano
       - Completar Activity si es necesario
       - Presionar "INICIAR SESION"

    2. XML HIERARCHY VIEWER
       - Presionar "Inspector" en el header
       - Se carga el screenshot del dispositivo y el XML de la pantalla
       - Hacer hover sobre la imagen para ver elementos resaltados en azul
       - Hacer click en un elemento para ver sus atributos y XPaths sugeridos
       - Seleccionar el XPath adecuado de las sugerencias
       - Presionar "Verificar" para confirmar que el selector encuentra el elemento
       - Presionar "Usar" para cargar el XPath en el panel principal

    3. INSPECTOR AUTOMATICO
       - Presionar "Inspeccionar elemento"
       - Tocar un elemento en el dispositivo fisico
       - El panel captura automaticamente el XPath del elemento tocado

    4. DEFINIR STEP
       - Elegir la accion del combo
       - Completar el valor si aplica
       - Presionar "EJECUTAR Y GUARDAR STEP"

    5. Repetir pasos 2-4 para cada accion del flujo

    6. Completar Feature y Scenario

    7. Presionar "GENERAR" para crear los archivos

---

## Acciones disponibles

    ABRIR_APP        Lanzar la app por packageName
    CLICK            Tap en un elemento
    ESCRIBIR         setValue en un campo de texto
    LIMPIAR          Limpiar el contenido de un campo
    SCROLL_DOWN      Scroll hacia abajo
    SCROLL_UP        Scroll hacia arriba
    SCROLL_HASTA     Scroll hasta encontrar un elemento
    SWIPE            Swipe en direccion (left/right/up/down)
    PRESION_LARGA    Long press en un elemento
    VERIFICAR_TEXTO  Verificar texto en un elemento
    VERIFICAR_EXISTE Verificar que un elemento es visible
    VERIFICAR_NO_EXISTE Verificar que un elemento no existe
    VOLVER           Presionar boton back del dispositivo
    ESPERAR          Esperar N segundos
    SCREENSHOT       Captura de pantalla del dispositivo

---

## Archivos generados

    automation/features/yape-features/<nombre>.feature  Escenario Gherkin ejecutable
    resources/locators/global.locator.json               Locators globales por plataforma

Los features pueden declarar un módulo de locators; si no lo hacen se usa `global`:

    # locator-module: autenticacion/login/login

Cada archivo `*.locator.json` contiene bloques `android` e `ios`. Los selectores
deben indicar su estrategia explícitamente, por ejemplo `~Allow`,
`id=com.app:id/btn_login`, `android=new UiSelector()...` o `iosClassChain=...`.

    Formato .locators:
    nombre_variable:@:selector

    Selectores soportados:
    XPath      : //*[@resource-id="com.app:id/btn_login"]
    Text       : //*[@text="Iniciar sesion"]
    ContentDesc: //*[@content-desc="Login button"]

    Formato .feature (declarativo, sin narrar acciones de UI):
    Feature: Autenticación en Yape
      Scenario Outline: [TC-10239][Happy Path][AUTO-FRONT] Iniciar sesión
        Given el usuario <username> inicia sesión en Yape
        When autentica su identidad
        Then accede a su cuenta

        Examples:
          | username   |
          | usuario_qa |

---

## Ejecutar casos grabados

    ./test.sh

O manualmente en dos terminales:

    Terminal 1: appium --port 4723 --relaxed-security
    Terminal 2: npm test

El reporte HTML se genera en:

    recorded/reports/report.html

---

## Estructura del proyecto

    appium-visual-recorder/
    package.json
    tsconfig.json
    cucumber.json
    run.sh                        Script arranque del grabador
    test.sh                       Script ejecucion de pruebas
    README.md
    src/
      main.ts                     Proceso principal Electron + IPC handlers
      preload.ts                  Bridge contextBridge entre UI y Node
      appiumDriverManager.ts      Maneja sesion Appium + WebdriverIO
      mobileInspector.ts          Inspector XML Hierarchy Viewer
      mobileStepExecutor.ts       Ejecuta cada step en el dispositivo
      locatorManager.ts           Lee y escribe el archivo .locators
      featureGenerator.ts         Genera el archivo .feature
      models.ts                   Tipos e interfaces TypeScript
    recorder/
      renderer/
        index.html                Entrada mínima de Vite
        src/
          App.tsx                 Ciclo de vida del renderer React
          RecorderLayout.tsx      Composición de pantallas
          components/             Pantallas, workspace y modales independientes
          controller/             Orquestación de la API expuesta por preload
          styles/                 Estilos del recorder
    vite.config.ts                Build del renderer React
    tsconfig.renderer.json        TypeScript del renderer
    features/
      step_definitions/
        steps.ts                  Step definitions para Cucumber
    recorded/
      features/                   Features generados aqui
      locators/                   Locators generados aqui
      reports/                    Reportes de ejecucion

---

## Tecnologias

    Electron         28+
    TypeScript       5+
    Appium           3.4+
    WebdriverIO      8+
    UiAutomator2     7.5+
    Cucumber         10+
    Node.js          18+
    ADB              Android SDK

---

## Scripts disponibles

    ./run.sh     Iniciar el grabador
    ./test.sh    Ejecutar casos grabados

---

## Notas

    - El dispositivo debe tener depuracion USB activada
    - Mantener la pantalla del dispositivo encendida durante la grabacion
    - El XML Hierarchy Viewer es la forma mas confiable de capturar selectores
    - Los selectores por resource-id son los mas estables para automatizacion
    - Los selectores por text pueden fallar si el texto cambia por idioma
