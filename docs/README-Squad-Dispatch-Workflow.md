# Squad Dispatch Workflow — Feature Folder Mapping & BrowserStack Project ID

## Index

1. [Overview](#overview)
2. [Involved Files](#involved-files)
3. [The Mapping File: squad-folder-map.json](#the-mapping-file-squad-folder-mapjson)
4. [Step-by-Step Flow](#step-by-step-flow)
   - [Step 1 — Trigger via workflow_dispatch](#step-1--trigger-via-workflow_dispatch)
   - [Step 2 — resolve_folder job: reading the mapping](#step-2--resolve_folder-job-reading-the-mapping)
   - [Step 3 — Folder existence validation](#step-3--folder-existence-validation)
   - [Step 4 — Passing outputs to the test job](#step-4--passing-outputs-to-the-test-job)
   - [Step 5 — WDIO execution scoped to the squad folder](#step-5--wdio-execution-scoped-to-the-squad-folder)
   - [Step 6 — BrowserStack project ID matching](#step-6--browserstack-project-id-matching)
5. [Architecture Diagram](#architecture-diagram)
6. [Validations and Error Handling](#validations-and-error-handling)
7. [End-to-End Example](#end-to-end-example)
8. [Important Notes](#important-notes)

---

## Overview

The `workflow-dispatch-e2e.yml` GitHub Actions workflow allows any squad to trigger the E2E test pipeline directly from the GitHub UI by simply selecting their squad name from a dropdown.

Internally, the workflow performs two operations automatically, without requiring the user to know any technical details:

1. **Feature folder resolution** — maps the selected squad name to the directory in the repository that contains that squad's `.feature` files, so only those tests are executed.
2. **BrowserStack project ID matching** — resolves the `BROWSERSTACK_PROJECT_ID` (e.g., `PR-52`) for the selected squad, which is then used to tag the test run in BrowserStack Automate and upload results to the correct project in BrowserStack Test Management (TCM).

Both mappings are centralized in a single JSON file: [`config/bs-test-management/squad-folder-map.json`](../config/bs-test-management/squad-folder-map.json).

---

## Involved Files

| File | Role |
|------|------|
| `.github/workflows/workflow-dispatch-e2e.yml` | GitHub Actions workflow. Defines the dispatch inputs and the `resolve_folder` job that reads the mapping |
| `config/bs-test-management/squad-folder-map.json` | Single source of truth: maps each squad name to its feature folder and BrowserStack project ID |
| `config/browserstack/wdio.android.bs.app.conf.ts` | WebdriverIO config for Android on BrowserStack. Reads `BROWSERSTACK_PROJECT_ID` to label the build |
| `config/browserstack/wdio.ios.bs.app.conf.ts` | WebdriverIO config for iOS on BrowserStack. Same as Android config for the equivalent platform |

---

## The Mapping File: squad-folder-map.json

Located at `config/bs-test-management/squad-folder-map.json`, this file is the central registry that links every squad name to two values:

```json
{
  "Squad Third Party Lending": {
    "folder": "features/yape-features/third-party-lending",
    "browserstack_project_id": "PR-52"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `folder` | `string` | Relative path (from repository root) to the directory containing the squad's `.feature` files. If empty (`""`), the test runs over all features. |
| `browserstack_project_id` | `string` | The BrowserStack TCM project identifier (format: `PR-<number>`). Used to label builds and upload results to the correct project. |

> **Important:** This file must not be modified unless a squad changes its folder structure or a new squad is onboarded. All modifications must go through **Automatech** or the **Chapter Leads**. See [Important Notes](#important-notes).

### Current mappings (reference)

| Squad | Folder | BS Project ID |
|-------|--------|---------------|
| Squad Pagos Yape Empresa | `features/yape-features/yape-empresas-pagos` | PR-86 |
| Squad Recaudación Yape Empresa | `features/yape-features/yape-empresas-recaudacion` | PR-87 |
| Squad Gestión de Negocio | `features/yape-features/yape-empresas-gestion-de-negocio` | PR-85 |
| Squad Core & Onboarding | `features/yape-features/yape-empresas-core-onboarding` | PR-84 |
| Squad Remesas-Inbound | `features/yape-features/remesas-inbound` | PR-72 |
| Squad Remesas-Outbound | `features/yape-features/remesas-outbound` | PR-71 |
| Squad Interoperabilidad | `features/yape-features/interoperabilidad` | PR-66 |
| Squad Cross Commerce | `features/yape-features/cross-commerce` | PR-65 |
| Squad Insurance | `features/yape-features/insurance` | PR-64 |
| Squad RMN & Digital | `features/yape-features/rmn-digital` | PR-61 |
| Squad Checkout | `features/yape-features/checkout` | PR-54 |
| Squad Lending Foundations | `features/yape-features/lending-foudations` | PR-53 |
| Squad Third Party Lending | `features/yape-features/third-party-lending` | PR-52 |
| Squad Delivery Commerce | `features/yape-features/delivery-commerce` | PR-48 |
| Squad Mobile Foundation | `features/yape-features/mobile-foundation` | PR-47 |
| Squad Pago de Servicios y Recargas | `features/yape-features/pago-de-servicios-recargas` | PR-39 |
| Squad Core Solutions | `features/yape-features/core-solutions` | PR-37 |
| Squad Autenticacion | `features/yape-features/autenticacion` | PR-36 |
| Squad ML Engineering | `features/yape-features/ml-engineering` | PR-100 |
| Squad Tipo de Cambio | `features/yape-features/tipo-de-cambio` | PR-33 |
| Squad Real Estate | `features/yape-features/real-estate` | PR-32 |
| Squad Martech | `features/yape-features/martech` | PR-31 |
| Squad Autoatencion | `features/yape-features/autoatencion` | PR-24 |
| Squad Core CX | `features/yape-features/core-cx` | PR-23 |
| Squad Pagos | `features/yape-features/payment` | PR-101 |
| Squad Yapecard | `features/yape-features/yapecard` | PR-91 |
| Squad_Marketplace_Android | `features/yape-features/delivery-commerce` | PR-48 |

---

## Step-by-Step Flow

### Step 1 — Trigger via workflow_dispatch

A team member (or an automated trigger) opens the GitHub Actions UI and manually dispatches the `E2E Mobile Tests - BrowserStack` workflow. The following inputs are presented:

| Input | Required | Description |
|-------|----------|-------------|
| `environment` | Yes | `qa` or `stg` |
| `platform` | Yes | `android` or `ios` |
| `squad_name` | Yes | The squad's display name (e.g., `Squad Third Party Lending`) |
| `tag_name` | No | Cucumber tag filter (default: `@smoke_mobile`) |
| `android_device` / `android_version` | No | BrowserStack device for Android runs |
| `ios_device` / `ios_version` | No | BrowserStack device for iOS runs |
| `slack_channel_notification_failure` | No | Slack channel for failure notifications |

The `squad_name` input is the key that drives the entire folder and project-ID resolution.

---

### Step 2 — resolve_folder job: reading the mapping

Before any test is executed, a dedicated job `resolve_folder` runs on `ubuntu-latest`. It:

1. Checks out the repository (`actions/checkout@v4`).
2. Reads the value of `squad_name` from the dispatch input.
3. Uses `jq` to query `config/bs-test-management/squad-folder-map.json`:

```bash
FOLDER=$(jq -r --arg s "$SQUAD" '.[$s].folder // ""' config/bs-test-management/squad-folder-map.json)
BS_PROJECT_ID=$(jq -r --arg s "$SQUAD" '.[$s].browserstack_project_id // ""' config/bs-test-management/squad-folder-map.json)
```

- `jq -r`: outputs raw strings (no quotes).
- `--arg s "$SQUAD"`: safely injects the squad name as a `jq` variable, avoiding shell injection issues.
- `.[$s].folder // ""`: looks up the squad key; falls back to an empty string if not found.

---

### Step 3 — Folder existence validation

After resolving the folder value, two validations are performed before the job is considered successful:

```bash
# Validation 1: squad name exists in the JSON but has no folder defined
if [[ -n "$SQUAD" && -z "$FOLDER" ]]; then
  echo "::error::Squad '$SQUAD' has no folder mapping defined in squad-folder-map."
  exit 1
fi

# Validation 2: folder is defined but does not exist in the repository
if [[ -n "$FOLDER" && ! -d "$FOLDER" ]]; then
  echo "::error::Folder '$FOLDER' for squad '$SQUAD' does not exist in the repository."
  exit 1
fi
```

| Scenario | Behavior |
|----------|----------|
| Squad name not in JSON | `jq` returns `""` for both fields; the squad-not-found validation fires; workflow fails immediately with a clear error message |
| Squad name in JSON, `folder` is `""` (intentional blank) | No folder filter is applied; tests run over all feature files |
| Squad name in JSON, folder defined but directory missing in repo | Workflow fails with an explicit error indicating which folder is missing |
| Squad name in JSON, folder exists | Workflow continues normally |

This prevents silent failures where an incorrect or deleted folder would cause zero tests to be collected without any warning.

---

### Step 4 — Passing outputs to the test job

Once resolved and validated, both values are written as job outputs:

```bash
echo "cucumber_folder=$FOLDER" >> "$GITHUB_OUTPUT"
echo "browserstack_project_id=$BS_PROJECT_ID" >> "$GITHUB_OUTPUT"
```

The `wdio_test` job declares a dependency on `resolve_folder` via `needs: resolve_folder` and then references these outputs when calling the reusable workflow:

```yaml
wdio_test:
  needs: resolve_folder
  uses: yaperos/reusable-workflows/.github/workflows/tests_integration.yaml@...
  with:
    cucumber_folder: ${{ needs.resolve_folder.outputs.cucumber_folder }}
    browserstack_project_id: ${{ needs.resolve_folder.outputs.browserstack_project_id }}
    # ... rest of inputs
```

The `wdio_test` job will not start until `resolve_folder` completes successfully, ensuring tests never run with an unresolved or invalid configuration.

---

### Step 5 — WDIO execution scoped to the squad folder

The reusable workflow (`tests_integration.yaml`) receives `cucumber_folder` and sets it as the `CUCUMBER_FOLDER` environment variable before invoking WebdriverIO.

Inside `wdio.android.bs.app.conf.ts` (and the equivalent iOS config), the spec collection logic reads `CUCUMBER_FOLDER` to restrict the glob pattern:

```typescript
// When CUCUMBER_FOLDER is set, only features inside that folder are collected.
// When it is empty, the full features/yape-features/**/*.feature glob is used.
const specBase = process.env.CUCUMBER_FOLDER
    ? path.resolve(process.cwd(), process.env.CUCUMBER_FOLDER)
    : path.resolve(process.cwd(), 'features/yape-features');

const allFeatures = globSync(`${specBase}/**/*.feature`);
```

After collecting the candidate files, a secondary filter is applied based on `TAG_NAME`:

```typescript
const tagName = process.env.TAG_NAME || '@smoke_mobile';

const filteredSpecs = allFeatures.filter((file) => {
    const content = fs.readFileSync(file, 'utf8');
    return content.includes(tagName);
});
```

This two-level filter means:
- **First level (folder)**: only feature files belonging to the selected squad's folder are candidates.
- **Second level (tag)**: from those candidates, only files that actually contain the requested tag are sent to the WebdriverIO runner.

The final list is assigned to `specs` in the WDIO config, so only the relevant tests are executed in BrowserStack.

---

### Step 6 — BrowserStack project ID matching

The `browserstack_project_id` output (e.g., `PR-52`) is passed to the reusable workflow as an input. The reusable workflow sets it as the `BROWSERSTACK_PROJECT_ID` environment variable.

Inside the WDIO BrowserStack configs it is read and used in two places:

```typescript
const bsProjectId = process.env.BROWSERSTACK_PROJECT_ID || '';
const environment = process.env.NODE_ENV || 'qa';
const actor = process.env.GITHUB_ACTOR || 'unknown';
const buildDate = new Date().toISOString().split('T')[0];

// bstack:options capability (session-level metadata)
// Build name is homologated with the api/web frameworks format:
// "<squad> | <env> | @<actor> | <date> | mobile-<platform>"
'bstack:options': {
    projectName: projectName,
    buildName: `${teamName} | ${environment} | @${actor} | ${buildDate} | mobile-android`
}
```

Note: `bsProjectId` is no longer part of the build name — it is still used
exclusively to route Test Management (TCM) uploads to the correct
BrowserStack project.

Additionally, the `browserstack-tm-reporter.js` script uses `BROWSERSTACK_PROJECT_ID` to determine which TCM project to upload the Cucumber JSON results to, creating or updating a Test Run inside the correct project scope.

This guarantees that:
- Every build in BrowserStack Automate is labeled with the squad's project ID.
- Test results are uploaded to the squad's dedicated project in BrowserStack Test Management, keeping results isolated per squad.

---

## Architecture Diagram

```
GitHub Actions UI
       │
       │  workflow_dispatch (squad_name, platform, environment, tag_name, ...)
       ▼
┌────────────────────────────────────────────────────────┐
│  JOB: resolve_folder                                   │
│                                                        │
│  1. Checkout repository                                │
│  2. Read squad-folder-map.json with jq                 │
│     ├── FOLDER        = features/yape-features/<squad> │
│     └── BS_PROJECT_ID = PR-<number>                    │
│  3. Validate: squad exists in JSON                     │
│  4. Validate: folder exists in the repository          │
│  5. Write outputs → GITHUB_OUTPUT                      │
└────────────────────────────┬───────────────────────────┘
                             │ needs: resolve_folder
                             ▼
┌────────────────────────────────────────────────────────┐
│  JOB: wdio_test (reusable workflow)                    │
│                                                        │
│  Inputs:                                               │
│  ├── cucumber_folder      → CUCUMBER_FOLDER env var    │
│  └── browserstack_project_id → BROWSERSTACK_PROJECT_ID │
│                                                        │
│  WDIO Config (Android / iOS):                          │
│  ├── glob features in CUCUMBER_FOLDER                  │
│  ├── filter by TAG_NAME (e.g., @smoke_mobile)          │
│  ├── execute on BrowserStack device                    │
│  └── label build with BROWSERSTACK_PROJECT_ID          │
│                                                        │
│  Post-execution:                                       │
│  └── browserstack-tm-reporter.js                       │
│      └── upload results to TCM project BROWSERSTACK_   │
│          PROJECT_ID                                    │
└────────────────────────────────────────────────────────┘
```

---

## Validations and Error Handling

| Condition | Where detected | Workflow behavior |
|-----------|---------------|-------------------|
| `squad_name` not found in JSON | `resolve_folder` job | Fails immediately with `::error::` annotation |
| Squad found but `folder` is `""` | `resolve_folder` job | Passes; no folder restriction applied to specs |
| `folder` defined but directory missing in repo | `resolve_folder` job | Fails immediately with `::error::` annotation |
| `BROWSERSTACK_PROJECT_ID` not set | WDIO config runtime | Defaults to `""` gracefully; build name uses no project suffix |
| `TAG_NAME` not set | WDIO config runtime | Defaults to `@smoke_mobile` |
| Zero features found after filtering | WDIO runtime | WebdriverIO exits with error; no BrowserStack session is created |

---

## End-to-End Example

**Scenario:** Squad Third Party Lending triggers the workflow on `android`, `qa`, with tag `@smoke_tplending`.

1. `squad_name` = `"Squad Third Party Lending"` is selected in the GitHub UI.
2. `resolve_folder` job reads the JSON:
   - `FOLDER` = `features/yape-features/third-party-lending`
   - `BS_PROJECT_ID` = `PR-52`
3. The directory `features/yape-features/third-party-lending` is confirmed to exist in the repo.
4. Outputs are emitted: `cucumber_folder=features/yape-features/third-party-lending`, `browserstack_project_id=PR-52`.
5. The reusable workflow sets `CUCUMBER_FOLDER=features/yape-features/third-party-lending` and `BROWSERSTACK_PROJECT_ID=PR-52`.
6. WDIO Android config:
   - Collects all `.feature` files under `features/yape-features/third-party-lending/`.
   - Keeps only files containing `@smoke_tplending`.
   - Sends those specs to BrowserStack.
   - Labels the build: `Squad Third Party Lending | qa | @janedoe | 2026-05-04 | mobile-android`.
7. After execution, `browserstack-tm-reporter.js` uploads Cucumber results to TCM project `PR-52`.

---

## Important Notes

### squad-folder-map.json must not be modified arbitrarily

This file is the single source of truth for the entire dispatch routing. Incorrect values directly affect test execution scope and TCM reporting accuracy. Modifications are only permitted in the following cases:

- A squad **changes the folder structure** of its feature files in the repository.
- A **new squad** is onboarded and needs its own entry.
- A squad's BrowserStack TCM project is **created, renamed, or reassigned**.

**All changes to `squad-folder-map.json` must be reviewed and approved by Automatech or the Chapter Leads** before merging to the main branch.

### Squad names in the JSON must match the workflow dropdown exactly

The `squad_name` input in the workflow dispatch is a fixed list of `options`. Each option string must match a key in `squad-folder-map.json` character-for-character (including spaces, accents, and special characters). If a new squad is added to the JSON, it must also be added to the `options` list in `workflow-dispatch-e2e.yml`.

### The `folder` field can be left empty intentionally

If a squad should execute tests across all feature directories (not scoped to one folder), set `"folder": ""` in the JSON. The `resolve_folder` job will not apply a folder filter, and the WDIO config will scan the entire `features/yape-features/` tree.

### browserstack_project_id must use the API identifier format

The value must be the BrowserStack API identifier (e.g., `PR-52`), **not** the numeric ID visible in the browser URL. This is the same format required by `browserstack-tm-reporter.js` to locate the correct project in TCM. To find the correct identifier, open the BrowserStack Test Management UI and look for the project key displayed next to the project name.
