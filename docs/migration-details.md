# Feature Migration Guide Between Projects

## 📋 Summary

**Source project:** `fwk-frontend-mobile-test`
**Target project:** `fwk-mobile-test`
**Date:** September 9, 2025
**Example feature:** Balance (Balance Inquiry)

---

## 🎯 Migration Objectives

1. **Standardize** the feature structure across projects by team
2. **Consolidate** functionalities into a single framework
3. **Facilitate** test maintenance and evolution
4. **Document** the process for future teams

---

## 📁 Target Folder Structure

### Target Project: fwk-mobile-test

```
fwk-mobile-test/
├── features/yape-features/[TEAM]/[FEATURE_NAME]/
│   ├── [feature]-happy-path.feature
│   ├── [feature]-unhappy-path.feature
│   └── [feature]-edge-cases.feature (opcional)
├── features/yape-steps-definitions/[TEAM]/[FEATURE_NAME]/
│   └── [feature].steps.ts
├── screenobjects/[TEAM]/[FEATURE_NAME]/
│   ├── [feature].screen.ts
│   └── [feature]-components.screen.ts (opcional)
├── resources/locators/[TEAM]/[FEATURE_NAME]/
│   ├── [feature].locator.json
│   └── [feature]-ios.locator.json (opcional)
├── resources/data/[TEAM]/
│   └── [users and data required for migrated features]
└── docs/
    └── migration-details.md
```

---

## 🚀 Step-by-Step Migration Process

### Phase 1: Preparation and Analysis

#### 1.1 Identify Feature Components

```bash
# In the source project (fwk-frontend-mobile-test)
cd /path/to/fwk-frontend-mobile-test

# Locate features
find ./features/yape-features/[FEATURE_NAME] -type f -name "*.feature"

# Locate step definitions
find ./features/yape-steps-definitions -name "*[FEATURE_NAME]*" -type f

# Locate screen objects
find ./screenobjects/[FEATURE_NAME] -type f -name "*.ts"

# Locate locators
find ./resources/locators/[FEATURE_NAME] -type f -name "*.json"

# Locate required data and users
find ./resources/data/[DATA_FOLDER] -type f
```

#### 1.2 Create Structure in the Target Project

```bash
cd /path/to/fwk-mobile-test

TEAM="[team-name]"
FEATURE_NAME="[feature-nam]"

mkdir -p tests/mobile/features/yape-features/$TEAM/$FEATURE_NAME
mkdir -p tests/mobile/features/yape-steps-definitions/$TEAM/$FEATURE_NAME
mkdir -p tests/mobile/screenobjects/$TEAM/$FEATURE_NAME
mkdir -p resources/locators/$TEAM/$FEATURE_NAME
mkdir -p resources/data/$TEAM
mkdir -p docs
```

---

### Phase 2: File Migration and Adaptation

#### 2.1 Migrate `.feature` files

Ejemplo: `show-balance-happy-path.feature`
```gherkin
@reset
Feature: Consulta de Saldo

  @balance
  Scenario Outline: [CDP_01][Happy Path][AUTO-FRONT] Consulta de Saldo - Usuario BCP y TDD
    Given el usuario <username> inicia sesión en Yape
    And el usuario cierra el popup invasivo
    When el usuario selecciona la opcion Mostrar Saldo
    Then se muestra el saldo al usuario
    When el usuario selecciona la opcion Ocultar Saldo
    Then el usuario dejara de ver su saldo en la pantalla principal

    Examples:
      | username          |
      | Backfunds E2E BCP |
      | Backfunds e2e Td  |
```

#### 2.2 Migrate Step Definitions

Example: `show-balance.steps.ts`
```typescript
import { Given, When, Then } from '@wdio/cucumber-framework';
import BalanceScreen from '../../../../screenobjects/backfunds/balance/showbalance.screen.ts';

When(/^el usuario selecciona la opcion Mostrar Saldo$/, async () => {
    await BalanceScreen.pressButtonShowBalance();
});

When(/^se muestra el saldo al usuario$/, async () => {
    await BalanceScreen.ShowBalance();
});

When(/^el usuario selecciona la opcion Ocultar Saldo$/, async () => {
    await BalanceScreen.pressButtonHideBalance();
});

When(/^el usuario dejara de ver su saldo en la pantalla principal$/, async () => {
    await BalanceScreen.HideBalance();
});

When(/^el usuario no podra ver su saldo$/, async () => {
    await BalanceScreen.NoShowBalance();
});
```

#### 2.3 Migrate Screen Objects

Import example before and after:
```typescript
// BEFORE (source project):
import BalanceScreen from '../../../screenobjects/balance/showbalance.screen.ts';

// AFTER (target project):
import BalanceScreen from '../../../../screenobjects/backfunds/balance/showbalance.screen.ts';
```

#### 2.4 Migrate Locators

Example: `balance.locator.json`
```json
{
    "balanceAndroid": {
        "btnMostrarSaldo": "new UiSelector().text(\"Mostrar saldo\")",
        "btnOcultarSaldo": "new UiSelector().text(\"Ocultar saldo\")",
        "txtBalance": "//android.widget.TextView[starts-with(@text, 'S/')]"
    },
    "balanceIos": {
        "btnMostrarSaldo": "Mostrar saldo",
        "btnOcultarSaldo": "Ocultar saldo",
        "txtBalance": "//android.widget.TextView[contains(@text, 'S/')]"
    }
}
```

#### 2.5 Migrate Required Users and Data

It is important to migrate the users and data required by the migrated features. For example, for balance tests, user data should be moved to the folder  `resources/data/backfunds`:

```
resources/data/backfunds/
  [user and data files for balance]
```

Ensure that the features and step definitions correctly reference this data in its new location.

---

### Considerations for Updating Import Paths

When migrating a feature, it is essential to review and update the import paths in all involved files. The location of screenobjects, utilities, and other modules may vary between the source and target projects. Therefore:

- Verify the new location of each imported file (e.g., screenobjects, utils, locators, data).
- Adjust the relative path in imports to reflect the target project structure.
- If the folder depth changes, update imports in all affected files (steps, features, screenobjects, etc.).
- Perform a global search for old imports to avoid broken references.

Adjustment example:
```typescript
// BEFORE (source project):
import BalanceScreen from '../../../screenobjects/balance/showbalance.screen.ts';

// AFTER (target project, new location):
import BalanceScreen from '../../../../screenobjects/backfunds/balance/showbalance.screen.ts';
```

> Repeat this process for all imports that depend on the location of migrated files. This ensures the feature works correctly in the new structure.

---

### Phase 3: Validation and Adjustments

1. Run automated tests to validate the migration.
2. Adjust imports and paths according to the new structure.
3. Document any relevant changes in this file.

---

## 🛠️ Technical Recommendations

- Maintain modularity and separation of concerns.
- Use relative paths for imports whenever possible.
- If a feature depends on global utilities, ensure they are migrated before updating imports.
- Run automated tests after each partial migration.
- Document changes and the responsible person for each migration.

---
