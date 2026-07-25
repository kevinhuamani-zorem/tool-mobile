# Integración BrowserStack Test Management — WebdriverIO (Mobile)

## Índice

1. [Resumen](#resumen)
2. [Arquitectura del Flujo](#arquitectura-del-flujo)
3. [Requisitos Previos](#requisitos-previos)
4. [Configuración Inicial](#configuración-inicial)
5. [Mapeo de Test Cases](#mapeo-de-test-cases)
6. [Ejecución](#ejecución)
7. [Modo: Reutilizar un Test Run existente](#modo-reutilizar-un-test-run-existente)
8. [¿Cómo Funciona Internamente?](#cómo-funciona-internamente)
9. [Scripts Disponibles](#scripts-disponibles)
10. [Variables de Entorno](#variables-de-entorno)
11. [Solución de Problemas](#solución-de-problemas)

---

## Resumen

Esta integración permite ejecutar tests de WebdriverIO (Cucumber/Gherkin) en BrowserStack y reportar automáticamente los resultados a **BrowserStack Test Management (TCM)** en un solo flujo unificado.

El pipeline completo es:

```
Clean Reports → WebdriverIO Run (BrowserStack) → Cucumber JSON Reports → Upload a BrowserStack TCM
```

---

## Arquitectura del Flujo

```
┌─────────────────────────────────────────────────────────────────┐
│  1. LIMPIEZA DE REPORTES ANTERIORES                             │
│     rm -rf ./reports/cucumber-json                              │
│     → Garantiza que solo se suban los resultados de esta run    │
├─────────────────────────────────────────────────────────────────┤
│  2. EJECUCIÓN EN BROWSERSTACK                                   │
│     wdio run ./config/browserstack/wdio.android.bs.app.conf.ts  │
│     → Filtra features por TAG_NAME (default: @smoke_mobile)     │
│     → Genera: reports/cucumber-json/<feature>_<timestamp>.json  │
│       (1 archivo JSON por cada feature file ejecutado)          │
├─────────────────────────────────────────────────────────────────┤
│  3. SUBIDA A BROWSERSTACK TCM                                   │
│     node scripts/browserstack-tm-reporter.js                    │
│     → Lee todos los JSON de reports/cucumber-json/              │
│     → Extrae @TC-<id> de los tags de cada scenario              │
│     → Deduplica: Scenario Outlines con N ejemplos → 1 resultado │
│     → Crea un Test Run nuevo (o reutiliza uno existente)        │
│     → Sube resultado (passed/failed/skipped) por cada TC único  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Requisitos Previos

### 1. Cuenta de BrowserStack con Test Management habilitado

Acceder a: https://test-management.browserstack.com

### 2. Variables de entorno

Se necesitan 3 variables configuradas en `~/.zshrc` (macOS) o en el entorno de CI (vault):

```bash
export BROWSERSTACK_USER_NAME="tu_usuario"
export BROWSERSTACK_ACCESS_KEY="tu_access_key"
export BROWSERSTACK_TM_PROJECT_ID="PR-5"
```

> **Importante:** El `BROWSERSTACK_TM_PROJECT_ID` es el **identificador API** del proyecto (ej. `PR-5`), **NO** el número que aparece en la URL del navegador.

### 3. Verificar que las variables estén cargadas

```bash
source ~/.zshrc
echo $BROWSERSTACK_USER_NAME       # → debe mostrar tu usuario
echo $BROWSERSTACK_TM_PROJECT_ID   # → debe mostrar PR-5
```

> **Nota VS Code:** La terminal integrada puede no cargar `~/.zshrc` automáticamente. Siempre ejecutar `source ~/.zshrc` antes de correr los comandos en una terminal nueva.

---

## Configuración Inicial

### Archivos involucrados

| Archivo | Propósito |
|---------|-----------|
| `scripts/browserstack-tm-reporter.js` | Reporter principal: lee Cucumber JSON y sube resultados a TCM via API |
| `config/browserstack/wdio.android.bs.app.conf.ts` | Config WebdriverIO para Android en BrowserStack (incluye `cucumberjs-json` reporter) |
| `config/browserstack/wdio.ios.bs.app.conf.ts` | Config WebdriverIO para iOS en BrowserStack (incluye `cucumberjs-json` reporter) |
| `package.json` | Scripts npm que encadenan run + upload |

---

## Mapeo de Test Cases

### Paso 1: Crear el Test Case en BrowserStack TCM

1. Abrir el proyecto en: https://test-management.browserstack.com
2. Ir a **Test Cases** → **Create Test Case**
3. Llenar el título y guardar
4. Anotar el identificador asignado automáticamente (ej. `TC-104`)

> **Limitación de la API:** BrowserStack TCM API v2 **no permite crear test cases programáticamente**. Siempre deben crearse desde la UI primero.

### Paso 2: Agregar el tag `@TC-<id>` al escenario Gherkin

En el archivo `.feature`, agregar el tag `@TC-<id>` al escenario correspondiente:

```gherkin
# ✅ Correcto — el reporter extraerá "TC-104" automáticamente
@one_step_login @smoke_mobile @TC-104
Scenario Outline: [CDP_02][Happy Path] Login Exitoso BCP en un solo paso
  Given el usuario <username> inicia sesión en Yape
  ...
```

**Formato del tag:** `@TC-<número>` (caso insensible, con o sin prefijo `@`).

### Paso 3: Scenarios sin tag @TC-*

Los scenarios que **no tengan** un tag `@TC-*` serán ejecutados normalmente por WebdriverIO pero **omitidos silenciosamente** durante la subida a TCM. El reporter imprimirá cuántos fueron omitidos en el resumen.

### Paso 4: Verificar que el TC existe en el proyecto

El reporter hace una pre-validación contra la API antes de subir. Si un tag `@TC-xxx` no existe en el proyecto de TCM, se imprime un warning y ese resultado se omite. Esto evita subir datos a IDs incorrectos.

---

## Ejecución

### Comando unificado (recomendado)

Ejecuta la limpieza, los tests en BrowserStack y el upload a TCM en un solo comando:

```bash
# Android QA — tag por defecto @smoke_mobile
npm run android-qa.bws.app:tm

# Android STG
npm run android-stg.bws.app:tm

# iOS QA
npm run ios-qa.bws.app:tm

# iOS STG
npm run ios-stg.bws.app:tm
```

### Filtrar por tag específico

Usar la variable `TAG_NAME` para ejecutar solo los features que contengan ese tag:

```bash
# Solo el escenario de login (un solo TC)
TAG_NAME=@TC-104 npm run android-qa.bws.app:tm

# Solo los smoke tests de third-party-lending
TAG_NAME=@simulate_tplending npm run android-qa.bws.app:tm

# Todos los smoke tests (default)
npm run android-qa.bws.app:tm
```

> El filtro funciona a nivel de **archivo de feature**: si el tag aparece en cualquier lugar del archivo (en cualquier scenario), el archivo completo se incluye en la ejecución. El filtro fino por tag se aplica luego en `cucumberOpts.tags`.

### Ejecución paso a paso (por separado)

Si se prefiere ejecutar cada etapa manualmente:

```bash
# 1. Limpiar reportes anteriores
rm -rf ./reports/cucumber-json

# 2. Ejecutar tests en BrowserStack
NODE_ENV=qa TAG_NAME=@smoke_mobile wdio run ./config/browserstack/wdio.android.bs.app.conf.ts

# 3. Subir resultados a TCM
npm run bt:tm:report
```

---

## Modo: Reutilizar un Test Run existente

Por defecto, el reporter **crea un nuevo Test Run** en cada ejecución (ideal para CI/CD, donde cada pipeline run queda trackeado independientemente).

Si se necesita subir resultados a un **Test Run ya existente** (creado manualmente en la UI, o para acumular resultados de Android + iOS en el mismo TR), usar la variable `EXISTING_RUN_ID`:

```bash
# Sube resultados al Test Run TR-66 ya existente, sin crear uno nuevo
EXISTING_RUN_ID=TR-66 npm run android-qa.bws.app:tm
```

### Cuándo usar cada modo

| Escenario | Modo recomendado |
|-----------|-----------------|
| CI/CD — cada pipeline run es independiente | Default (TR nuevo automático) |
| Android + iOS en ejecuciones separadas, mismo TR | `EXISTING_RUN_ID=TR-xx` |
| Re-run parcial de tests fallidos sobre el mismo TR | `EXISTING_RUN_ID=TR-xx` |
| Subir solo los reportes ya generados a un TR existente | `EXISTING_RUN_ID=TR-xx npm run bt:tm:report` |

---

## ¿Cómo Funciona Internamente?

### El reporter `scripts/browserstack-tm-reporter.js`

Ejecuta los siguientes pasos en orden:

#### [1/4] Validación de variables de entorno

Verifica que `BROWSERSTACK_USER_NAME`, `BROWSERSTACK_ACCESS_KEY` y `BROWSERSTACK_TM_PROJECT_ID` estén configuradas. Si falta alguna, termina inmediatamente con un mensaje claro.

#### [2/4] Verificación del proyecto

Llama a `GET /api/v2/projects` y busca el proyecto por su identificador (ej. `PR-5`). Si no existe, termina con error.

#### [3/4] Pre-validación de test cases

Llama a `GET /api/v2/projects/PR-5/test-cases` para obtener la lista de TCs existentes. Cualquier tag `@TC-xxx` que no esté en esa lista será omitido con un warning (no termina el proceso).

#### [3/4] Parseo de reportes Cucumber JSON

Lee **todos los archivos `.json`** del directorio `reports/cucumber-json/` (uno por feature file). Por cada archivo:

- Itera `feature.elements[]` (cada scenario/scenario outline instance)
- Busca en `scenario.tags[]` un tag que matchee `/^@(TC-\d+)$/i`
- Determina el status: si algún step tiene `status: "failed"` → `failed`, si algún step tiene `status: "skipped"` → `skipped`, si todos pasaron → `passed`
- Extrae el `error_message` del step fallido (truncado a 500 chars)

**Deduplicación por Scenario Outline:** Un Scenario Outline con N filas de Examples genera N instancias en el JSON, todas con el mismo tag `@TC-xxx`. El reporter las colapsa en **1 único resultado** usando la regla del peor status (`failed` > `skipped` > `passed`):

```
@TC-105 — ejemplo 1: failed
@TC-105 — ejemplo 2: failed  →  TC-105: FAILED (1 resultado)
@TC-105 — ejemplo 3: failed
```

#### [4/4] Creación del Test Run y upload de resultados

**Modo automático (sin `EXISTING_RUN_ID`):**

Llama a `POST /api/v2/projects/PR-5/test-runs`:
```json
{
  "test_run": {
    "name": "Local Run | QA | Mon, 30 Mar 2026 22:57 UTC",
    "description": "Repo: local | Branch: local | Commit: N/A | Total: 2 | Passed: 0 | Failed: 2 | Skipped: 0",
    "test_cases": ["TC-104", "TC-105"]
  }
}
```

**Modo manual (con `EXISTING_RUN_ID`):**

Salta la creación del TR y usa directamente el ID provisto.

Luego, por cada TC único mapeado, llama a `POST /api/v2/projects/PR-5/test-runs/TR-xx/results`:
```json
{
  "test_case_id": "TC-104",
  "test_result": {
    "status": "failed",
    "failure_reason": "Error: El elemento con el locator ~¡Todo listo! no se encontró..."
  }
}
```

### Ejemplo de salida exitosa

```
[BrowserStack TM] Starting reporter for project PR-5 | ENV: QA

[BrowserStack TM] [1/4] Verifying project PR-5...
[BrowserStack TM] Project found: "Automatech_Test_Mobile" (PR-5)
[BrowserStack TM] [2/4] Fetching known test cases...
[BrowserStack TM] Known test cases: 2
[BrowserStack TM] [3/4] Parsing Cucumber reports...
[BrowserStack TM] Found 2 report file(s): login-yape-happy-path_xxx.json, esta-funcionalidad-xxx.json
[BrowserStack TM] Deduplicated 4 scenario(s) → 2 unique TC(s) (Scenario Outlines collapsed)
[BrowserStack TM] Scanned 4 scenario(s) | Mapped: 2 unique TC(s) | Skipped (no @TC-* tag): 0
[BrowserStack TM] [4/4] Creating test run and uploading 2 result(s)...
[BrowserStack TM] Test run created: TR-67 — "Local Run | QA | Mon, 30 Mar 2026 22:57 UTC"
[BrowserStack TM]   [FAILED] TC-104
[BrowserStack TM]   [FAILED] TC-105

[BrowserStack TM] ─────────────────────────────────────────────
[BrowserStack TM]  Run:      TR-67 — "Local Run | QA | Mon, 30 Mar 2026 22:57 UTC"
[BrowserStack TM]  Results:  2 uploaded, 0 errors
[BrowserStack TM]  Passed:   0 | Failed: 2 | Skipped: 0
[BrowserStack TM]  Link:     https://test-management.browserstack.com/projects/PR-5/test-runs/TR-67
[BrowserStack TM] ─────────────────────────────────────────────
```

---

## Scripts Disponibles

| Script | Plataforma | Ambiente | Descripción |
|--------|-----------|---------|-------------|
| `android-qa.bws.app:tm` | Android | QA | Pipeline completo: limpia → ejecuta en BS → sube a TCM |
| `android-stg.bws.app:tm` | Android | STG | Igual al anterior apuntando a STG |
| `ios-qa.bws.app:tm` | iOS | QA | Pipeline completo usando config de iOS |
| `ios-stg.bws.app:tm` | iOS | STG | Igual al anterior apuntando a STG |
| `bt:tm:report` | — | — | Solo el upload. Útil para resubir reportes ya generados sin volver a ejecutar los tests |

Todos los scripts `:tm` siguen el mismo patrón internamente:

```bash
rm -rf ./reports/cucumber-json                          # 1. limpia reportes previos
NODE_ENV=<env> wdio run ./config/browserstack/...       # 2. ejecuta en BrowserStack
WDIO_EXIT=$?                                            # 3. guarda exit code
node scripts/browserstack-tm-reporter.js                # 4. sube resultados a TCM
exit $WDIO_EXIT                                         # 5. propaga exit code al CI
```

---

## Variables de Entorno

### Requeridas (el reporter termina si faltan)

| Variable | Ejemplo | Descripción |
|----------|---------|-------------|
| `BROWSERSTACK_USER_NAME` | `tu_usuario` | Usuario de BrowserStack |
| `BROWSERSTACK_ACCESS_KEY` | `tu_access_key` | Access key de BrowserStack |
| `BROWSERSTACK_TM_PROJECT_ID` | `PR-5` | Identificador API del proyecto en TCM |

### Opcionales — control del flujo

| Variable | Default | Descripción |
|----------|---------|-------------|
| `EXISTING_RUN_ID` | *(vacío)* | Si se setea (ej. `TR-66`), sube resultados a ese TR existente sin crear uno nuevo |
| `TAG_NAME` | `@smoke_mobile` | Tag de Cucumber para filtrar qué features se ejecutan |
| `NODE_ENV` | `qa` | Ambiente de ejecución. Aparece en el nombre del Test Run (`QA` / `STG`) |
| `TEAM_NAME` | `Yape` | Nombre del squad. Usado en el `projectName` y `buildName` de BrowserStack Automate |

### Opcionales — enriquecen metadata en CI

| Variable | Descripción |
|----------|-------------|
| `GITHUB_WORKFLOW` | Nombre del workflow. Aparece en el nombre del Test Run (reemplaza "Local Run") |
| `GITHUB_REPOSITORY` | Nombre del repo. Aparece en la descripción del Test Run |
| `GITHUB_REF_NAME` | Branch actual. Aparece en la descripción del Test Run |
| `GITHUB_SHA` | SHA del commit (primeros 7 chars). Aparece en la descripción del Test Run |

---

## Solución de Problemas

### "Missing required env vars"

```
[BrowserStack TM] Missing required env vars: BROWSERSTACK_TM_PROJECT_ID
```

Las variables no están en la sesión actual. Ejecutar `source ~/.zshrc` y volver a intentar.

### "Project not found"

```
[BrowserStack TM] Project "PR-5" not found. Check BROWSERSTACK_TM_PROJECT_ID.
```

El valor de `BROWSERSTACK_TM_PROJECT_ID` no corresponde a ningún proyecto en la cuenta. Verificar en la UI de TCM que el identificador sea correcto (ej. `PR-5`, no el ID numérico de la URL).

### "WARNING: TC-xxx not found in project"

```
[BrowserStack TM]  WARNING: "TC-1" not found in project — skipping.
```

El tag `@TC-1` existe en el feature file pero no hay un test case con ese ID en el proyecto de TCM. Causas comunes:
- El tag en el `.feature` tiene un ID antiguo (verificar que coincida con el TC creado en la UI)
- El JSON de reporte fue generado con un tag diferente al actual (solución: limpiar `reports/cucumber-json/` y volver a ejecutar)

### "No Cucumber JSON files found"

```
[BrowserStack TM] No Cucumber JSON files found in: reports/cucumber-json
```

Los tests no generaron el reporte. Verificar que los configs de BrowserStack tengan el reporter configurado:

```typescript
// En wdio.android.bs.app.conf.ts y wdio.ios.bs.app.conf.ts
reporters: [
    'spec',
    ['cucumberjs-json', {
        jsonFolder: './reports/cucumber-json/',
        language: 'en',
    }],
],
```

### El reporter sube resultados duplicados (N results para 1 TC)

Ocurre si hay reportes de ejecuciones anteriores en `reports/cucumber-json/`. Usar los scripts `:tm` que limpian automáticamente antes de ejecutar, o limpiar manualmente:

```bash
rm -rf ./reports/cucumber-json && npm run bt:tm:report
```

---

## BrowserStack Local Tunnel

### Cómo funciona

El tunnel local permite que el device remoto de BrowserStack acceda a recursos internos (por ejemplo, WebViews que cargan URLs internas). Está controlado por la variable de entorno `GITHUB_ACTIONS`, que GitHub Actions setea automáticamente en cualquier workflow.

| Entorno | `GITHUB_ACTIONS` | Comportamiento |
|---------|-----------------|----------------|
| GitHub Actions | `true` (automático) | `local: true` + `localIdentifier: my-tunnel` activos en las capabilities |
| Local (desarrollo) | no existe | Las capabilities no incluyen `local` ni `localIdentifier` — no se necesita el binario |

### En GitHub Actions

El reusable workflow levanta el binario del tunnel en un step previo al de tests:

```yaml
- name: 'Start BrowserStackLocal Tunnel'
  uses: browserstack/github-actions/setup-local@...
  with:
    local-testing: start
    local-identifier: my-tunnel
```

Las capabilities usan el mismo identificador `my-tunnel`, por lo que BrowserStack empareja automáticamente el tunnel con cada sesión de test.

### Ejecutar con tunnel en local (opcional)

Si se necesita testear WebViews con recursos internos desde local, levantar primero el binario de BrowserStack Local apuntando al mismo identificador y luego ejecutar con la variable seteada:

```bash
# Paso 1: levantar el binario (en otra terminal)
./BrowserStackLocal --key $BROWSERSTACK_ACCESS_KEY --local-identifier my-tunnel

# Paso 2: ejecutar los tests activando el tunnel
GITHUB_ACTIONS=true npm run android-qa.bws.app
```

Para ejecuciones normales en local (sin WebView con recursos internos), no se necesita ningún paso adicional.

