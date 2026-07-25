# MOBILE Test Automation Framework

This repository contains the automation framework for regression, smoke, and functional testing of the **Yape mobile** application on both Android and iOS platforms.

## 📋 Table of Contents

- [System Requirements](#system-requirements)
- [Installation and Setup](#installation-and-setup)
- [Conventions and Standards](#conventions-and-standards)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)
- [Technical notes](#technical-notes)
- [Squad Dispatch Workflow](#squad-dispatch-workflow)
- [Support](#support)

## System Requirements

You will need the following tools installed and configured on your machine to run the tests locally.

| Requirement              | Version          | Installation Notes                                                    |
|--------------------------|------------------|-----------------------------------------------------------------------|
| [Node.js.](https://nodejs.org/en)                | 24.x          | Required for the Appium server and running TypeScript tests (via npm) |
| [Homebrew](https://brew.sh/)| latest | `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`  |
| npm                      | 11.x  | `brew install node`       |
| [Appium Server](http://appium.io/)            | 2.x or later     | `npm install -g appium`      |
| [Appium Drivers](https://appium.io/docs/en/3.0/ecosystem/drivers/)           | uiautomator2 (Android) <br>  xcuitest (iOS) | Drivers must be installed in Appium. Run: <br> appium driver install uiautomator2 and appium driver install xcuitest |
| [Appium Inspector](https://github.com/appium/appium-inspector/releases)         | 2025.8.1 or later| Download Appium-Inspector-mac-<version>.dmg |
| [Appium Doctor](https://github.com/appium/appium-doctor)            | 1.xx or later    | `npm install -g appium-doctor`      |
| [TypeScript](https://medium.com/@morerahul620/typescript-for-mac-a-installation-guide-for-m1-m2-e7a2a531d2a6)               | 5.x or later     | `npm install -g typescript`       |
| [Android Studio](https://developer.android.com/studio)           | 2025.1 or later  | Locate the downloaded .dmg file (usually in your Downloads folder) and double-click it to open the disk image.|
| Xcode (Mac)              | 16.4 or later    | Find Xcode in the App Store (via your Dock or Spotlight) and click Get/Install |
| [Xcode command line (Mac)](https://www.freecodecamp.org/news/install-xcode-command-line-tools/#:~:text=You%20can%20also%20enter%20the,the%20download%20and%20installation%20process.) | 16.4 or later    | `xcode-select --install`       |
| Cucumber                 | latest    | `npm install @cucumber/cucumber --save-dev`       |
| Carthage (Mac)           | latest    | `brew install carthage`       |
| [Allure Report](https://allurereport.org/)    | latest    | `npm install -g allure-commandline`       |
| [Library authorize-ios](https://appium.readthedocs.io/en/stable/en/appium-setup/running-on-osx/) | latest | `npm install -g authorize-ios` <br>`sudo authorize-ios` |


## Installation and Setup

### 1. Clone the Repository

```bash
git clone git@github.com:yaperos/fwk-mobile-test.git
cd fwk-mobile-test
```
### 2. Install Dependencies
```bash
npm install
```
### 3. Configure Environment Variables
**For macOS/Linux (in ~/.zshrc or ~/.bashrc):**

Set up the following variables on your system:
```bash
export REDIS_PASSWORD="your_qa_password"
export REDIS_PASSWORD="your_stg_password"
```

### 4. Mobile Configuration - Webdriver.io

**ANDROID**
**wdio.android.conf.ts**

```bash
  capabilities: [{
       platformName: 'Android',
        'appium:deviceName': 'YOUR DEVICE NAME',
        'appium:platformVersion': 'xx',
        'appium:autoGrantPermissions' : true,
        'appium:automationName': 'UiAutomator2',
        'appium:noReset': false,
        'appium:chromedriverExecutable': path.join(
            process.cwd(),
            'node_modules',
            '.bin',
            'chromedriver'
        ),
        'appium:app': join(
            process.cwd(),
            'resources',
            'apps',
            'android',
            process.env.APP_ANDROID_NAME || 'app-qa-release.apk',
        )
    }],
```


**IOS**
**wdio.ios.conf.ts**
```bash

    capabilities: [{
         platformName: 'iOS',
        'appium:deviceName': 'YOUR DEVICE NAME',
        'appium:platformVersion': 'xx.x',
        'appium:udid': 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        'appium:autoGrantPermissions' : true,
        'appium:automationName': 'XCUITest',
        'appium:nativeWebScreenshot': true,
        'appium:autoDismissAlerts':true,
        'appium:noReset':false,
        'appium:app': join(
            process.cwd(),
            'resources',
            'apps',
            'ios',
            process.env.APP_IOS_NAME || 'app-qa-release.ipa',
        )
    }],
```

**For Android and iOS**:

In the specs section, you can configure the features to be tested.

```bash
 specs: [
        '../tests/mobile/features/**/**/*.feature'
    ],
```

### 5. Copy the artifacts to be tested to these paths:

**app-qa-release.apk** copy here:
- fwk-mobile-test/resources/apps/android/
   

**app-qa-release.ipa** copy here:
- fwk-mobile-test/resources/apps/ios/

### 6. Test Execution

| Enviroment  | **ANDROID**              | **iOS**              |
|-------------|----------------------|------------------|
| **QA**          | `npm run android-qa` | `npm run ios-qa` |
| **STAGING**     | `npm run android-stg`| `npm run ios-stg` |


### 7. Allure Report

- Go to the reports folder:  `reports/allure`
- run: `allure open allure-report`

### 8. Running Tests by Tags

We use the `--cucumberOpts.tags` flag to filter and execute specific test scenarios across different environments and platforms.

### Filtering by a Single Tag

### Android execution (QA or Staging)

```bash
npm run android-qa -- -- --cucumberOpts.tags="@name_tag"
npm run android-stg -- -- --cucumberOpts.tags="@name_tag"
```


### Logical Operators

We can combine multiple tags to create more precise filters:

- or Operator: Executes tests that contain any of the specified tags.

Runs tests with @listar_productos OR @test_tags:

```bash
npm run ios-qa -- -- --cucumberOpts.tags="@listar_productos or @test_tags"
npm run android-qa -- -- --cucumberOpts.tags="@listar_productos or @test_tags"
```

- and Operator: Executes only those tests that contain both tags.

Runs tests that have BOTH @smokeTestMarketplace AND @test_tags

```bash
npm run android-qa -- -- --cucumberOpts.tags="@smokeTestMarketplace and @test_tags"
```

- Excluding Tags (not Operator)

Runs everything tagged @smokeTestMarketplace EXCEPT those also tagged @test_tags
```bash
npm run android-qa -- -- --cucumberOpts.tags="@smokeTestMarketplace and not @test_tags"
```


## Conventions and Standards

### 📌 Test Naming & Structure Guidelines

To ensure consistency, clarity, and maintainability across the test suite.

#### 🧾 Language

Use ***English*** to name folders, files, variables, and functions, following development best practices.

#### Features

- Write feature files in Spanish to facilitate understanding for the local team.

e.g.:
```gherkin
Feature: Inicio de sesión
    Given usuario
    When iniciar sesión en la aplicación
    Then acceder a mis datos personales
```

#### Naming Constants & variables

| Element               | Guideline                              | Example                                   |
|-----------------------|----------------------------------------|-------------------------------------------|
| Environment Variables | **Format:** `UPPERCASE_WITH_UNDERSCORES` <br> Configuration variables for the execution environment. | `API_KEY`, `BASE_URL`, `DATABASE_HOST` |
| Local Variables       | **Format:** `camelCase` <br> Variables within functions or code blocks that can change. | `userEmail`, `productCount`, `currentPage`. |                   
| Boolean Variables     | **Format:** `isCamelCase`, `hasCamelCase`, `shouldCamelCase` <br> Variables that represent a true or false state.| `isLoggedIn`, `hasPermissions`, `shouldDisplayModal`. |
| Constants             | **Format:** `UPPERCASE_WITH_UNDERSCORES` <br> Values that do not change during program execution.|`MAX_TIMEOUT`, `DEFAULT_PAGE_SIZE`, `API_VERSION`. |


### Functions

| Element                     | Guideline                              | Example                                   |
|-----------------------------|----------------------------------------|-------------------------------------------|
| Function Names              | **Format:** `camelCase` (verbs that indicate the action the function performs). <br> To perform specific actions in the code | `getUserDetails()`, `validateForm()`, `calculateTotal()` |
|Asynchronous Function Names  | **Format:** `camelCase`, prefixed with `async` (in TypeScript). <br> Functions that perform asynchronous operations. | `async fetchUserData()`, `async processPayment()`.|

#### 📁 File & Folder Organization

Remember: Use ***English*** to name folders.

```
fwk-mobile-test/
├── config/                          # Configuration.
│   └── envs/                        # Environment configurations.
├── docs/                            # Guides to Migrating Features. 
├── features/                        # Test cases folder.
│   ├── yape-features/               # Test scenarios written in Cucumber.
│   │   └── marketplace/             # Test scenarios related to Marketplace.
│   ├── yape-step-definitions/       # Step Definitions code links Gherkin specifications.
│   │   └── marketplace/             # Step Definitions related to Marketplace. 
│   ├── resources/                   # Static resources and external files the application needs
│   │   ├── apps/                    # It contains the apps.
│   │   │    └── android/            # It contains the .apk file.
│   │   │    └── ios/                # It contains the .ipa file.
│   │   └── data                     # User YAML files.
│   │        └── qa-fundation/       # User YAML files relator to Marketplace Test.
│   │   └── locators/                # JSON locators to identify UI elements for testing
│   │         └── marketplace/       # JSON locators related to marketplace test.
│   └── screenobjects/               # Screen Object Classes for each mobile screen.
│   │         └── marketplace/       # Screen Object Classes related to Marketplace Test.
├── support/                         # Reusable functions accessible throughout the entire project.
│   ├── utils/                       # Simple, reusable helper functions accessible project-wide.
```

Examples:

```typeScript
// Example of English names
const loginButton = '#login-button';
let userSession = null;

function validateUserCredentials(username, password) {
        // Validation logic
}
```


## Troubleshooting

### Common Errors

#### 1. Error generating report in Allure (iOS or Android)

Ensure that you have the library installed: `allure-commandline`

To do this, run: `npm list -g allure-commandline`
/opt/homebrew/lib
└── allure-commandline@2.34.1

- If you do not have it, install it:
`npm install -g allure-commandline`

#### 2. Important: --> You need to do this every time you install a new version of Xcode.

-  Install [Carthage](https://github.com/Carthage/Carthage)

```bash
brew install carthage
```

#### 3. If you encounter issues installing dependencies, try:

```bash
npm install --update-binary --no-shrinkwrap
```

#### 4. Fix Observations from `appium-doctor`

Run:
```bash
appium-doctor --ios
```

#### 5. If you encounter issues with Appium and ADB, execute the following commands:

```bash
adb uninstall io.appium.uiautomator2.server
adb uninstall io.appium.uiautomator2.server.test
adb kill-server
adb start-server
```


## Best Practices

### Test Development

- **Clarity and Conciseness:** : Use descriptive names that reflect the purpose of the variable or function, avoiding confusing abbreviations.
- **Consistency:**:  Maintain a consistent naming style throughout the project. Use a linter (like ESLint) to ensure consistency.
- **Context:**: Adapt names to the context of the project and the technology used following the conventions established by the team or the community.
- **Avoid Ambiguity:**: Specific names are better than generic names. For example, `data` says nothing, while `userData` is more descriptive.
- **Isolated/Independent**: Each test must be able to run by itself, in any order, without relying on the state or result of other tests.
- **Self-Validating**: The test must generate a clear binary result (pass or fail) without requiring manual interpretation.
- **Timely**: Tests should be written shortly after, or at the same time as, the functionality they are testing.
- **Android**: Prioritize Resource IDs (id) and Content-Description.
- **iOS**: Prioritize Accessibility IDs and Name.
- **Timing**: Instead of pausing for a fixed duration (Thread.sleep(5000)), use commands that wait only until a condition is met (e.g., wait until an element is visible, clickable, or a text value is present).


## Technical notes

### 1. Chromedriver dependency

This project automatically installs the chromedriver dependency in package.json (e.g., version 138 for WebView/Chrome 138). The WebdriverIO configuration (wdio.android.conf.ts) points to that local binary using the capability:
```bash
'appium:chromedriverExecutable': require('path').join(
  process.cwd(),
  'node_modules',
  '.bin',
  'chromedriver'
)
```
**What does this mean?**

- You do not need to download Chromedriver manually or depend on the corporate network.
- When you run `npm install`, the correct binary will be available to Appium.
- Context switching to WebView will work automatically for all team members.

**If you need another version of Chromedriver:**

- Change the version in `package.json` and run `npm install`.

**Important:**

If your embedded WebView/Chrome changes version, be sure t#o update the chromedriver dependency to avoid compatibility errors.

### 🔍 2. WebView Inspection in iOS

#### ⚠️ Pre-Considerations
Before starting, make sure you meet the following requirements:

- Have Developer Mode enabled on your physical iOS device.
- Have a Mac with Safari installed and access to the development tools.
- Xcode installed
- Appium configured and installed

#### 🧭 Steps to Enable WebView Inspection:

 **Enable Web Inspector on the iPhone**

- Open the **Settings** app on your iPhone.
- Navigate to: `Settings > Safari > Advanced`.
- Enable the **Web Inspector** option.

This allows Safari on your Mac to detect and display the WebViews open on the device.

#### Connect the iPhone to the Mac

- Use a **USB cable** to connect the physical device to your Mac.
- If this is the first time you are connecting the device, be sure to **trust the device** when prompted.

A wired connection is more stable and recommended for inspection.

#### Open Safari on Mac

- Make sure the **Developer Menu** is enabled in Safari:
  - Go to Safari > Preferences > Advanced.
  - Check the option **"Show Develop menu in menu bar"**.
- Next, in the Safari menu bar, go to: Develop > [Your Device].
- You will see a list of web pages currently open in WebViews within your apps.
- Click the one you wish to inspect to open the developer tools.

✅ Expected Result
Once these steps are completed, you will be able to inspect the WebView content directly from Safari on your Mac, using the developer tools just as you would for a traditional webpage.

### 🔍 3. Use "throw" in the code

- **Throw Standard Errors**: Use built-in error types (like new Error(), TypeError, RangeError) or well-defined custom errors.
- **For Critical Failures**: Use throw for conditions that make it impossible for the function to fulfill its purpose (e.g., an argument is null when an object is required).
- **Attach Context**: Include a descriptive message and the stack trace in the exception to help debugging.
- **Avoid throwing**: Generic exceptions (e.g., using vague messages like throw new Error('It failed')).



## 🏗️ Architecture: BaseScreen Refactoring

This framework uses a **composition-based architecture** for Page Objects, separating technical operations into specialized helpers:

### Core Helpers

All screen objects extend `BaseScreen` which provides access to three public helpers:

- **`uiHelper`** - Element operations (waits, clicks, getText, validations)
- **`gestureHelper`** - Mobile gestures (scroll, swipe, touch)
- **`keyboardHelper`** - Keyboard operations (submitOtp)

### Usage Example

```typescript
// In screen objects (extends BaseScreen)
await this.uiHelper.waitForDisplayed(selector);
await this.gestureHelper.verticalScrollingToEnd();
await this.keyboardHelper.submitOtp(input, otp);

// In step definitions (accessing screen instance)
await homeScreen.uiHelper.waitForElementDisplayedAndExpect(element, timeout);
await menuScreen.gestureHelper.verticalScrollingToEnd();
```

### Migration Completed ✅

All deprecated wrapper methods have been removed from `BaseScreen`. The codebase now consistently uses helpers directly:
- **47 files migrated** (30 screenobjects + 15 step definitions)
- **221 method calls updated**
- **Base class reduced by 66%** (226→77 lines)

This architecture follows **SOLID principles** and promotes better maintainability through composition over inheritance.

---

## Squad Dispatch Workflow

The `workflow-dispatch-e2e.yml` GitHub Actions workflow allows any squad to trigger the E2E test pipeline from the GitHub UI by selecting their squad name from a dropdown. Internally, two automatic resolutions take place:

1. **Feature folder scoping** — the selected squad name is looked up in [`config/bs-test-management/bs-folder-map.json`](./config/bs-test-management/bs-folder-map.json) to determine which directory under `features/yape-features/` contains that squad's `.feature` files. Only those files (further filtered by the chosen Cucumber tag) are sent to BrowserStack for execution.

2. **BrowserStack project ID matching** — the same JSON entry provides the `browserstack_project_id` (e.g., `PR-52`) used to label the build in BrowserStack Automate and to route the Cucumber results to the correct project in BrowserStack Test Management (TCM).

For a detailed step-by-step explanation of the full flow, validations, and architecture, see [docs/README-Squad-Dispatch-Workflow.md](./docs/README-Squad-Dispatch-Workflow.md).

> **Do not modify `squad-folder-map.json` unless strictly necessary.** This file is the single source of truth for squad-to-folder and squad-to-project-ID routing. Any change directly affects which tests run and where results are uploaded. Modifications must be reviewed and approved by **Automatech** or the **Chapter Leads** before merging.

### Running All Tests vs. Filtered by Tag

The workflow supports two execution modes:

- **Run all tests in a squad folder**: Set `tag_name` to `ALL` (default). This executes every `.feature` file in the squad's mapped folder, maintaining the correct BrowserStack project ID association for TCM reporting.

- **Run filtered tests by tag**: Specify a Cucumber tag (e.g., `@smoke_mobile`, `@regression`). Only features containing that tag within the squad's folder will be executed.

**Examples:**
```yaml
# Execute all tests for Squad Autenticacion
squad_name: Squad Autenticacion
tag_name: ALL  # or leave empty

# Execute only smoke tests
squad_name: Squad Autenticacion
tag_name: @smoke_mobile
```

### Additional Workflow Options

The workflow includes optional settings to optimize test execution:

- **WebView mode** (`webview`): Enable this option only if your tests interact with web content inside the app (e.g., yapetienda, embedded browsers). When disabled (default), tests run ~30% faster without SSL certificate issues.

- **Debug mode** (`debug_mode`): Enable verbose BrowserStack logging including appium logs, device logs, and console output. Use this when troubleshooting test failures or connectivity issues.

---

## Support

For technical support or questions about the framework:
- 📖 Check specific documentation in each module

**Framework Version:** 1.0.0  
