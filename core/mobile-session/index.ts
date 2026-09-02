/**
 * API pública de `mobile-session`. `domain/iosSimulators` es puro (parseo
 * de `simctl`); el resto (`appiumDriverManager`, `browserStackDriverManager`,
 * `mobileStepExecutor`, `locatorManager`) es `infrastructure` (WebdriverIO,
 * `child_process`, lectura de locators) sin una capa de aplicación propia,
 * así que se expone directamente aquí.
 */
export * from './domain/iosSimulators';
export * from './infrastructure/appiumDriverManager';
export * from './infrastructure/browserStackDriverManager';
export * from './infrastructure/locatorManager';
export * from './infrastructure/mobileStepExecutor';
export * from './infrastructure/embeddedAppiumServer';
export * from './infrastructure/androidTooling';
