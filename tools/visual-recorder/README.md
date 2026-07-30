# Appium Visual Recorder

Herramienta de grabacion visual de pruebas automatizadas mobile. Permite grabar flujos de usuario directamente desde un dispositivo Android sin escribir codigo, generando casos de prueba en formato Gherkin y archivos de locators listos para ejecutarse con Cucumber + WebdriverIO.

> Esta copia vive integrada en `fwk-mobile-test/tools/visual-recorder`. La raíz
> del framework se resuelve automáticamente y se expone al proceso mediante
> `FWK_MOBILE_ROOT`. Las configuraciones locales quedan en `config/` y las
> capturas temporales en `runtime/`; ambas están excluidas de Git.

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

### Asistencia opcional con Gemini

Existe una plantilla versionada en `tools/visual-recorder/.env.example`.
Cópiala como `tools/visual-recorder/.env` y agrega tu clave:

```dotenv
GEMINI_API_KEY=tu_clave
GEMINI_MODEL=gemini-2.5-flash
```

El `.env` real está excluido de Git. Los reportes generados por pruebas,
cobertura o métricas bajo `coverage/`, `test-results/` y `runtime/quality/`
también están excluidos; las pruebas y el procedimiento QA sí se versionan.

Gemini propone el Feature, Scenario y los enlaces del Gherkin usando las
acciones grabadas y las convenciones indexadas. La propuesta siempre es
editable y no escribe archivos: el generador local conserva el control de
rutas, plantillas, validación y conflictos. Antes de enviar contexto se
redactan credenciales, tokens, correos y números sensibles.

La propuesta incluye nombres semánticos para el archivo Feature, módulo de
pantalla, métodos y locators. Los nombres se validan antes del Preview y la
salida de un caso nuevo debe contener las cuatro capas: Feature, Steps,
Locators y Screen Object.

La configuración del caso no se solicita al iniciar la grabación. En el paso
final de Revisión se muestran los nombres propuestos para depurarlos y se
completan el ID `TC-<número>`, tipo, tag y data antes de construir el Preview.

### CodeGraph local

El recorder indexa localmente las relaciones entre Features, Scenarios, Step
Definitions, Screen Objects, métodos y locators. Gemini recibe como máximo el
subgrafo relevante para el squad y las acciones grabadas, no el índice completo.
El cache incremental se guarda exclusivamente en
`tools/visual-recorder/runtime/codegraph.json`, excluido de Git. El framework se
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

La puerta completa de calidad se ejecuta con `npm run quality`. Los umbrales y
el procedimiento manual están en
[`docs/AI_QUALITY_ASSURANCE.md`](docs/AI_QUALITY_ASSURANCE.md).

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

    Formato .feature:
    Feature: Login Yape
      Scenario: Login exitoso con usuario registrado
        Given el usuario hace click en "{btn_ingresar}"
        When el usuario escribe "999999999" en "{input_celular}"
        When el usuario hace click en "{btn_continuar}"
        Then el elemento "{lbl_bienvenido}" es visible

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
