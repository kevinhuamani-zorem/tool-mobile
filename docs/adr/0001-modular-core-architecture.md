# ADR-0001: Arquitectura modular del recorder

- Estado: Aceptado
- Fecha: 2026-09-01

## Contexto

`core/` contiene actualmente dominio, casos de uso, filesystem, drivers,
proveedores de agente, generación y validación en una carpeta plana. Los límites
de seguridad Electron se conservan, pero la estructura no comunica ownership ni
dirección de dependencias. `main.ts` y `recorderController.js` también concentran
demasiadas responsabilidades.

La migración no puede ser un movimiento masivo: tests y scripts consumen rutas
compiladas como `dist/core/deterministicResolver`, y generación mantiene
contratos de preview, hashes, reparación, memoria y escritura atómica.

## Decisión

El recorder adopta módulos por capacidad, con capas internas:

```text
core/
├── shared/
│   ├── domain/
│   ├── contracts/
│   └── infrastructure/
├── automation/
│   ├── domain/
│   ├── contracts/
│   ├── application/
│   ├── ports/
│   └── infrastructure/
├── generation/
│   ├── domain/
│   ├── application/
│   ├── ports/
│   └── infrastructure/
├── validation/
│   ├── domain/
│   ├── application/
│   └── infrastructure/
├── indexing/
├── workspace/
├── mobile-session/
└── coverage/
```

Cada módulo expone su API mediante `index.ts`. Se permiten APIs públicas
secundarias únicamente cuando estén declaradas por esta decisión:

- `automation/contracts/index.ts`
- `workspace/contracts/index.ts`

Quedan prohibidos los imports a archivos internos de otro módulo.

### Fronteras

- **automation:** recording, análisis, plan, agente, importación, validación del
  flujo y aplicación.
- **generation:** convierte un plan aprobado en Feature, Steps, Screen Object,
  Locators y preview.
- **validation:** ejecuta reglas contractuales, sintácticas y estructurales.
- **shared:** contiene solo primitivas realmente transversales; no recibe lógica
  de negocio por conveniencia.

`DeterministicResolver` pertenece a `automation/application`.
`DeterministicGenerator` y `FwkMobileGenerator` pertenecen a
`generation/application`. `AutomationResponseValidator` se dividirá
progresivamente bajo `validation`.

### Dependencias

```text
interfaces -> application -> domain
infrastructure -> application/ports
infrastructure -> domain
composition root -> interfaces + application + infrastructure
```

Reglas obligatorias:

1. `domain` no importa Electron, filesystem, procesos, Appium, Copilot,
   `application`, `ports` ni `infrastructure`.
2. `application` depende de su dominio, de puertos propios y de APIs públicas de
   otros módulos; no importa runtimes concretos.
3. Los puertos pertenecen al módulo consumidor y viven en `<module>/ports/`.
4. `infrastructure` implementa puertos; `main.ts` conecta implementaciones con
   casos de uso.
5. `validation` consume `automation/contracts`, nunca
   `automation/application`.
6. `generation` consume `automation/contracts`, nunca la API de aplicación de
   automation.
7. El renderer solo consume `window.api`; no importa módulos de `core/`.

## Compatibilidad durante la migración (retirada)

Mientras `core/` migraba, cada archivo movido dejaba atrás una fachada
temporal en su ruta plana original (`core/<nombre>.ts`), por ejemplo:

```ts
export * from './automation/application/deterministicResolver';
```

Esto conservó imports existentes y salidas `dist/core/*` mientras tests y
scripts migraban hacia APIs públicas. Esa capa de compatibilidad ya se
retiró (ver "Estado de implementación" y "Secuencia" más abajo): las 69
fachadas fueron eliminadas, todo consumidor pasa por `core/<módulo>/index.ts`
o `core/<módulo>/contracts/index.ts`, y `core/` solo contiene directorios de
módulo.

## Secuencia

1. Estabilizar y clasificar la línea base de pruebas.
2. Activar verificaciones arquitectónicas.
3. Crear módulos, APIs públicas y fachadas sin mover comportamiento.
4. Separar contratos transversales y eliminar ciclos heredados.
5. Migrar primero `validation`.
6. Separar `automation` de `generation`.
7. Migrar indexing, workspace, mobile-session y coverage.
8. Extraer handlers de `main.ts` por familia.
9. Organizar renderer por features.
10. Retirar fachadas: completado (ver "Estado de implementación").

Cada fase debe ser reversible, conservar los contratos de seguridad y pasar las
pruebas focalizadas, regresión determinística y puerta de calidad.

## Estado de implementación

- La compuerta arquitectónica está activa en `npm run quality` y exige cero
  ciclos y cero violaciones en todo `core/`.
- Los ocho módulos existen con al menos una capa poblada:
  `shared` (dominio + infraestructura), `workspace` (contratos +
  infraestructura), `automation` (dominio, aplicación, puertos, contratos e
  infraestructura), `generation` (dominio, aplicación e infraestructura),
  `validation` (dominio, aplicación e infraestructura), `indexing` (dominio +
  infraestructura), `mobile-session` (dominio + infraestructura) y
  `coverage` (infraestructura).
- `validation/domain` ya es propietario de los resultados y contratos de reglas.
- `validation/index.ts` es su API pública.
- La construcción pura del catálogo de reglas vive en `validation/application`;
  su lectura desde disco está aislada en `validation/infrastructure`.
- `automation/contracts` es la superficie pública compartida entre
  `automation`, `generation` y `validation`: además de `GenerationRequest` y
  `MobilePlatform`, expone el vocabulario de recording/plan
  (`models`, `AutomationScenario`), las reglas de Gherkin y Screen Object
  (`gherkinContract`, `screenObjectContract`), el manejo de selectores
  (`selectorCandidates`), el alcance de features (`featureScope`), la
  detección de repetición (`repetitionDetector`) y la declaración de
  elementos (`elementDeclaration`). `generation` y `validation` solo alcanzan
  `automation` a través de esta API; nunca de `automation/domain` ni
  `automation/application`.
- `DeterministicResolver` vive en `automation/application` (conceptualmente
  correcto según esta ADR) con un puerto propio,
  `automation/ports/baselineSnapshotPort.ts`, para el único punto donde
  necesitaba `fs` (el hash de baseline al planificar un `update`). El
  adaptador real, `FsBaselineSnapshotAdapter`, vive en
  `automation/infrastructure`; `automation/infrastructure/deterministicResolver.ts`
  inyecta ese adaptador para conservar el constructor histórico de 0/1
  argumentos (ver "Retiro de fachadas" más abajo: antes era
  `core/deterministicResolver.ts`, ahora es la implementación real).
- `DeterministicGenerator` y `FwkMobileGenerator` siguen en
  `generation/infrastructure`: son conceptualmente `application` según esta
  ADR, pero escriben archivos directamente (`fs`), igual que la mayoría de
  `automation` (orquestación de agente, paquete, memoria, patch writer,
  recording store). Dividir esa E/S de su lógica de negocio es un rediseño de
  inyección de dependencias más amplio que esta migración; se deja
  documentado como trabajo futuro y no como una capa mal clasificada: cada
  archivo con `fs`/`child_process`/`webdriverio` directo vive en
  `infrastructure`, nunca en `domain`/`application`.
- **Retiro de fachadas (completado).** Las 69 fachadas planas de
  `core/<nombre>.ts` fueron eliminadas; `core/` solo contiene los ocho
  directorios de módulo. Cada módulo expone su API pública completa desde
  `index.ts` (dominio + aplicación + infraestructura + puertos cuando
  existen), no solo su capa pura: `indexing`, `workspace`, `mobile-session` y
  `coverage` no tienen una capa `application` separada, así que su
  `infrastructure` es directamente su público (documentado en el propio
  comentario de cada `index.ts`). `automation/index.ts` reexporta todas sus
  capas para el resto de consumidores, pero `validation` y `generation`
  siguen restringidos a `automation/contracts` (regla de frontera 5/6, sin
  cambios). Todo consumidor — `recorder/src/main.ts`, `recorder/src/ipc/*`,
  pruebas y scripts — importa desde `core/<módulo>` o
  `core/<módulo>/contracts`; `recorder/src/main.ts` y `recorder/src/ipc/*`
  son composition roots y pueden construir adaptadores concretos
  explícitamente (p. ej. `new FrameworkScanner(new ReuseAnalyzer())`,
  `new FrameworkQueryService(new CodeGraph())`) en vez de depender de un
  default interno.
- **Ciclos que el retiro de fachadas expuso.** Mientras existían fachadas,
  varios archivos de `automation/contracts`, `indexing` y `workspace`
  importaban la implementación real de otro módulo a través de su fachada
  plana; como esas fachadas no resolvían a un módulo clasificado, el checker
  no veía el ciclo de archivos que había debajo. Al apuntar esos imports a la
  API pública real, aparecieron dos ciclos genuinos que se resolvieron sin
  mover archivos ni cambiar comportamiento:
  - `indexing/infrastructure/codeGraph.ts#CodeGraph.query` recibía
    `RecordedStep[]` y llamaba a `automation/contracts#recordedStepContext`.
    Ahora declara localmente `QueryableAction` (con exactamente los campos
    que usa) y una copia de una línea de `recordedStepContext`;
    `RecordedStep` sigue siendo estructuralmente compatible, así que ningún
    llamador cambia.
  - `automation/contracts` y `indexing/infrastructure/reuseAnalyzer.ts`
    compartían `normalizeFeatureScope`/`featureScopeDirectory`, definidas en
    `automation/contracts/featureScope.ts`. Se movieron a
    `shared/domain/featureScope.ts` (son puras, sin dependencia de
    automation) y `automation/contracts/featureScope.ts` quedó como un
    reexport de una línea hacia `shared`.
  - `workspace/infrastructure/frameworkQueryService.ts` y
    `frameworkScanner.ts` necesitaban `CodeGraph`/`ReuseAnalyzer` de
    `indexing`, que a su vez depende de `workspace` para `projectPaths` y
    `frameworkContract`. Como esas clases hacen E/S real y no son un
    vocabulario trivial, `workspace` define localmente los tipos que
    necesita (`CodeGraphLike`, `ReuseSummaryProvider`, más un espejo
    estructural de `CodeGraphNode`/`CodeGraphEdge`/`CodeGraphSnapshot`/
    `FrameworkQueryName`) y exige la instancia real por constructor sin
    importar `indexing`; la tipificación estructural de TypeScript acepta la
    instancia real (`CodeGraph`, `ReuseAnalyzer`) sin adaptador de por medio.
    Quien construye estos servicios (composition root, o
    `automation/infrastructure/agentOrchestrator.ts`, que sí puede depender
    de `indexing`) inyecta la instancia concreta.
  `scripts/check-architecture.js` gana una excepción puntual: el índice raíz
  de un módulo (`core/<módulo>/index.ts`) puede reexportar su propia
  `infrastructure` sin disparar `infrastructure-dependency` — es su rol de
  barril público, no una capa de negocio saltándose un puerto; la regla
  sigue aplicando sin cambios a `domain`/`application` reales.
- Paso 8 de la secuencia (extraer handlers de `main.ts` por familia) está
  implementado: `recorder/src/main.ts` es un composition root sin ningún
  `ipcMain.handle`/`ipcMain.on` propio. Los 47 canales existentes se
  registran desde `recorder/src/ipc/workspaceHandlers.ts`,
  `sessionHandlers.ts`, `inspectorHandlers.ts`, `interactionHandlers.ts`,
  `automationHandlers.ts` y `generationHandlers.ts`, cada uno con su propio
  contexto de dependencias (`export interface *HandlersContext`) y su función
  `register*Handlers`. El estado mutable que antes eran variables de módulo
  de `main.ts` vive ahora en una única instancia de
  `recorder/src/ipc/runtimeState.ts#RecorderRuntimeState`, construida una vez
  en `main.ts` e inyectada por referencia en cada contexto — así ninguna
  familia duplica sesión activa, plataforma, steps grabados o el estado del
  Inspector embebido. `main.ts` conserva la creación de `BrowserWindow`, el
  ciclo de vida de `app`, el registro del protocolo del Inspector embebido y
  la composición final de servicios; también conserva `closeOwnedSession` y
  `closeEmbeddedInspectorResources` como las únicas tareas de limpieza
  ligadas al ciclo de vida (viven en `sessionHandlers.ts` e
  `inspectorHandlers.ts` respectivamente, pero `main.ts` es quien las compone
  en `RecorderRuntimeLifecycle` para preservar el orden Inspector-embebido
  → sesión-propia). Como `scripts/check-architecture.js` solo recorre
  `core/` y `recorder/renderer/`, esta migración no está sujeta a la
  compuerta arquitectónica automática; `tests/ipcCompositionRoot.test.js`
  cubre el mismo contrato para `recorder/src/`.
- Paso 9 de la secuencia (organizar el renderer por features) está
  implementado: `recorder/renderer/src/controller/recorderController.js` pasó
  de ~4800 líneas a un composition root de ~230 que solo construye el estado
  compartido, instancia cada feature bajo
  `recorder/renderer/src/features/<nombre>/` con dependencias explícitas y
  llama a `mount()`/`unmount()`. Las seis features son `configuration`,
  `recording`, `inspector`, `platform-completion`, `generation` y `review`
  (más `features/shared/domHelpers.js` para los helpers de DOM genéricos sin
  estado propio). Cada feature es un único módulo `.js` que exporta
  `create<Nombre>Feature(deps)` y no importa nada fuera de
  `../shared/domHelpers.js` (`tests/rendererFeatureBoundaries.test.js` lo
  verifica estáticamente); ninguna declara estado mutable a nivel de módulo.
  El estado que dos o más features comparten (sesión activa, captura de
  selector, catálogo del squad, documentos de preview, estado del wizard de
  automatización) vive en un único objeto `state` construido por el
  composition root e inyectado por referencia — el mismo patrón que
  `RecorderRuntimeState` en `recorder/src/ipc/`. `App.tsx` llama a
  `disposeRecorder()` en la limpieza de su efecto de montaje para que un
  remount (React StrictMode en desarrollo) no acumule listeners duplicados;
  `tests/rendererMountCleanup.test.js` monta/desmonta el composition root
  completo contra un DOM mínimo propio (el proyecto no depende de jsdom) para
  comprobarlo. Las tres features que comparten el panel de captura de selector
  (`inspector`, `recording`, `platform-completion`) siguen leyendo/escribiendo
  los mismos campos de `state` en vez de una separación limpia por dueño
  único — es la misma UI en pantalla y separarla del todo sería un rediseño
  de producto; queda documentado como deuda conocida en
  `docs/ARCHITECTURE.md`, no como código sin clasificar.

## Ciclos legados eliminados

El ciclo inicial entre `automationContracts`, `fwkMobileGenerator` y
`generatedFileMetadata` fue eliminado al mover `GenerationRequest` y
`MobilePlatform` a la API pública de `generation`. Los ciclos que el retiro
de fachadas expuso entre `automation/contracts`, `indexing` y `workspace` se
eliminaron con las técnicas descritas en "Estado de implementación" (tipos
espejados localmente + reubicación de `featureScope` a `shared`). El
baseline (`scripts/architecture-baseline.json#allowedCycles`) sigue vacío: no
se permite ningún ciclo.

`core/` ya no tiene archivos planos: las 69 fachadas de compatibilidad se
eliminaron junto con `LEGACY_FACADE_FILES` en
`tests/architectureRules.test.js`, que ahora exige `unclassifiedFiles: []` y
que `core/` solo contenga los ocho directorios de módulo. Las reglas de
módulos se aplican a todo `core/` sin excepciones, y la detección de ciclos
cubre el árbol completo.

## Consecuencias

- La arquitectura se puede imponer antes de mover archivos.
- Los módulos nuevos nacen con límites verificables.
- Las fachadas añadieron duplicidad temporal durante la migración, pero
  redujeron el riesgo de big bang; ya se retiraron por completo.
- La migración de validación exige dividir reglas sin relajar sus contratos ni
  sus umbrales.
- La mayor parte de `automation` (y los generadores de `generation`) queda en
  `infrastructure` por su E/S directa; es una clasificación honesta, no un
  aplazamiento indefinido de la separación pura/impura que propone esta ADR.
- Un puñado de tipos de vocabulario (`QueryableAction`, `CodeGraphLike`,
  `ReuseSummaryProvider` y el espejo de `CodeGraph*` en
  `frameworkQueryService.ts`) quedan intencionalmente duplicados en
  `workspace`/`indexing` para invertir una dependencia sin mover archivos;
  cada uno documenta en su propio comentario por qué existe y con qué tipo
  real debe mantenerse en sync.
