// @ts-ignore
import allure from 'allure-commandline';
import AllureReporter from '@wdio/allure-reporter';
import { createRequire } from 'node:module';
const allureDir = './reports/allure';
import * as fs from 'fs';
import dotenvFlow from 'dotenv-flow';
import path from 'path';
import { getPlatformName, generateTimestamp, ensureDirectoryExists, getTimeoutFromEnv, sanitizeFileName } from 'support/utils/Utils.ts';

const require = createRequire(import.meta.url);

// Cargar las variables de entorno desde el archivo .env adecuado
dotenvFlow.config({
    path: './config/envs',
    node_env: process.env.NODE_ENV || 'qa',
    default_node_env: 'qa'
});

const timeout: number = getTimeoutFromEnv();
const reporters: NonNullable<WebdriverIO.Config['reporters']> = [
    'spec',
    ['allure', {
        outputDir: allureDir + '/allure-results',
        disableWebdriverStepsReporting: false,
        disableWebdriverScreenshotsReporting: false,
        useCucumberStepReporter: true,
        addConsoleLogs: true
    }],
];

try {
    require.resolve('wdio-cucumberjs-json-reporter');
    reporters.push(['cucumberjs-json', {
        jsonFolder: './reports/cucumber-json/',
        language: 'en',
    }]);
} catch {
    console.warn('[WDIO] Optional reporter wdio-cucumberjs-json-reporter is not available. Skipping cucumber JSON output.');
}

export const config: WebdriverIO.Config = {
    //
    // ====================
    // Runner Configuration
    // ====================
    // WebdriverIO supports running e2e tests as well as unit and component tests.
    runner: 'local',

    port: 4723,
    // ==================
    // Specify Test Files
    // ==================

    specs: ['../features/yape-features/**/*.feature' //,
        //'../features/yape-features/**/address.feature' // ,
        //'../features/yape-features/**/cart.feature' // ,
        // '../features/yape-features/**/e2e-purchase-flow-yape.feature' 
        //'../features/yape-features/**/home-tienda.feature' //,
        //'../features/yape-features/**/list-products.feature' //,
        //'../features/yape-features/**/multi-seller-payment.feature' //,
        //'../features/yape-features/**/order.feature' //,
        //'../features/yape-features/**/purchase-summary.feature' //,
        //'../features/yape-features/**/search.feature' //,
        //'../features/yape-features/**/select-payment-type.feature' //,
        //'../features/yape-features/**/spike-webview-context-switch.feature',  //no se puede ejecutar
        //'../features/yape-features/**/variant-no-log.feature' //,
        //'../features/yape-features/**/verify-categories.feature',
        //'../features/yape-features/**/between-accounts.feature',
        //'../features/yape-features/**/exchange-rate-home.feature' //,
        //'../features/yape-features/**/yapeo-dollars.feature',
        //'../features/yape-features/martech/rmn/**/*.feature',
        //'../features/yape-features/**/yapeo-dollars.feature'
        // '../features/yape-features/nexus/quick-items/my-qr.feature',
        // '../features/yape-features/nexus/quick-items/delete-account.feature',
        // '../features/yape-features/nexus/quick-items/my-data.feature',
        // '../features/yape-features/nexus/menu.feature',
        // '../features/yape-features/nexus/quick-items/digital-biometrics.feature',
        // '../features/yape-features/nexus/quick-items/yapeo-high-confirmation.feature',
        // '../features/yape-features/nexus/quick-items/yapeo-notifications.feature',
        //'../features/yape-features/nexus/quick-items/order-functionality.feature',
        //'../features/yape-features/yape-empresas-platform-solutions/payment-empresas.feature',
        //'../features/yape-features/yape-empresas-platform-solutions/sales-report-empresas.feature'
    ],


    //exclude: [
    // 'path/to/excluded/files'
    //],
    // ============
    // Capabilities are defined in wdio.android.conf.ts/wdio.ios.conf.ts
    // ============
    capabilities: [
    ],
    //
    maxInstances: 1,
    // ===================
    // Test Configurations
    // ===================
    // Level of logging verbosity: trace | debug | info | warn | error | silent
    logLevel: 'info',

    // Set specific log levels per logger
    /*logLevels: {
        webdriver: 'info',
        '@wdio/applitools-service': 'info'
    },*/

    // If you only want to run your tests until a specific amount of tests have failed use
    // bail (default is 0 - don't bail, run all tests).
    bail: 0,

    waitforTimeout: 60000,
    // Default timeout in milliseconds for request
    // if browser driver or grid doesn't send response
    connectionRetryTimeout: 120000,
    // Default request retries count
    connectionRetryCount: 3,
    // Test runner services
    services: [
        [
            'appium',
            {
                args: {
                    address: 'localhost',
                    port: 4723
                },
                logPath: './'
            }
        ],
    ],
    // Make sure you have the wdio adapter package for the specific framework installed
    // before running any tests.
    framework: 'cucumber',

    reporters,

    // If you are using Cucumber you need to specify the location of your step definitions.
    cucumberOpts: {
        // <string[]> (file/dir) require files before executing features
        require: ['./features/yape-steps-definitions/**/*.steps.ts',
            './support/utils/global.ts'
        ],
        // <boolean> show full backtrace for errors
        backtrace: true,
        // <string[]> ("extension:module") require files with the given EXTENSION after requiring MODULE (repeatable)
        requireModule: [],
        // <boolean> invoke formatters without executing steps
        dryRun: false,
        // <boolean> abort the run on first failure
        failFast: false,
        // <boolean> hide step definition snippets for pending steps
        snippets: true,
        // <boolean> hide source uris
        source: true,
        // <boolean> fail if there are any undefined or pending steps
        strict: false,
        // <string> (expression) only execute scenarios matching this expression (defaults to @one_step_login)
        tags: process.env.CUCUMBER_TAGS || '@one_step_login',
        // <number> timeout for step definitions
        timeout: 120000,
        // <boolean> Enable this config to treat undefined definitions as warnings.
        ignoreUndefinedDefinitions: true
    },

    // =====
    // Hooks
    // =====
    // WebdriverIO provides several hooks you can use to interfere with the test process in order to enhance
    // it and to build services around it. You can either apply a single function or an array of
    // methods to it. If one of them returns with a promise, WebdriverIO will wait until that promise got
    // resolved to continue.
    /**
     * Gets executed once before all workers get launched.
     * @param {object} config wdio configuration object
     * @param {Array.<Object>} capabilities list of capabilities details
     */
    onPrepare: function (config, capabilities) {
        const dir = allureDir + '/allure-results';

        try {
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true });
                console.log(`${dir} is deleted!`);
            }
        } catch (error) {
            console.error('Error while deleting the directory:', error);
        }

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log('Directory created:', dir);
        }

    },
    /**
     * Gets executed before a worker process is spawned and can be used to initialize specific service
     * for that worker as well as modify runtime environments in an async fashion.
     * @param  {string} cid      capability id (e.g 0-0)
     * @param  {object} caps     object containing capabilities for session that will be spawn in the worker
     * @param  {object} specs    specs to be run in the worker process
     * @param  {object} args     object that will be merged with the main configuration once worker is initialized
     * @param  {object} execArgv list of string arguments passed to the worker process
     */
    // onWorkerStart: function (cid, caps, specs, args, execArgv) {
    // },
    /**
     * Gets executed just after a worker process has exited.
     * @param  {string} cid      capability id (e.g 0-0)
     * @param  {number} exitCode 0 - success, 1 - fail
     * @param  {object} specs    specs to be run in the worker process
     * @param  {number} retries  number of retries used
     */
    // onWorkerEnd: function (cid, exitCode, specs, retries) {
    // },
    /**
     * Gets executed just before initialising the webdriver session and test framework. It allows you
     * to manipulate configurations depending on the capability or spec.
     * @param {object} config wdio configuration object
     * @param {Array.<Object>} capabilities list of capabilities details
     * @param {Array.<String>} specs List of spec file paths that are to be run
     * @param {string} cid worker id (e.g. 0-0)
     */
    // beforeSession: function (config, capabilities, specs, cid) {
    // },
    /**
     * Gets executed before test execution begins. At this point you can access to all global
     * variables like `browser`. It is the perfect place to define custom commands.
     * @param {Array.<Object>} capabilities list of capabilities details
     * @param {Array.<String>} specs        List of spec file paths that are to be run
     * @param {object}         browser      instance of created browser/device session
     */
    // before: function (capabilities, specs) {
    // },
    /**
     * Runs before a WebdriverIO command gets executed.
     * @param {string} commandName hook command name
     * @param {Array} args arguments that command would receive
     */
    // beforeCommand: function (commandName, args) {
    // },
    /**
     * Cucumber Hooks
     *
     * Runs before a Cucumber Feature.
     * @param {string}                   uri      path to feature file
     * @param {GherkinDocument.IFeature} feature  Cucumber feature object
     */

    /* beforeFeature: async function (uri, feature) {
    },*/
    /**
     *
     * Runs before a Cucumber Scenario.
     * @param {ITestCaseHookParameter} world    world object containing information on pickle and test step
     * @param {object}                 context  Cucumber World object
     */
    beforeScenario: async function (scenario) {
        try {
            await driver.reloadSession();
            console.log("Starting recording screen for scenario: " + scenario.pickle.name);
            await driver.startRecordingScreen();
            await driver.pause(timeout);
        } catch (error) {
            console.error("Error in beforeScenario:", error);
        }
    },
    /**
     *
     * Runs before a Cucumber Step.
     * @param {Pickle.IPickleStep} step     step data
     * @param {IPickle}            scenario scenario pickle
     * @param {object}             context  Cucumber World object
     */
    // beforeStep: function (step, scenario, context) {
    // },
    /**
     *
     * Runs after a Cucumber Step.
     * @param {Pickle.IPickleStep} step             step data
     * @param {IPickle}            scenario         scenario pickle
     * @param {object}             result           results object containing scenario results
     * @param {boolean}            result.passed    true if scenario has passed
     * @param {string}             result.error     error stack if scenario failed
     * @param {number}             result.duration  duration of scenario in milliseconds
     * @param {object}             context          Cucumber World object
     */

    afterStep: async function (step, scenario, { error, duration, passed }, context) {
        if (!passed && error) {
            console.log(`Step failed: ${step.text} - ${error}`);
            try {
                if (!driver.sessionId) {
                    console.warn('Skipping screenshot in afterStep because the driver session is no longer active.');
                    return;
                }

                const screenshot = await driver.takeScreenshot();
                const scenarioName = scenario.name;
                const stepText = step.text;
                const timestamp = generateTimestamp();
                const platform = getPlatformName();
                const screenshotDir = path.join('./reports/screenshots', platform, timestamp);
                ensureDirectoryExists(screenshotDir);

                const safeScenarioName = sanitizeFileName(scenarioName);
                const safeStepText = sanitizeFileName(stepText);
                const screenshotPath = path.join(screenshotDir, `FAILED_${safeScenarioName}_${safeStepText}.png`);
                fs.writeFileSync(screenshotPath, screenshot, 'base64');

                console.log(`Screenshot saved: ${screenshotPath}`);

                AllureReporter.addAttachment('Screenshot on failure', Buffer.from(screenshot, 'base64'), 'image/png');
            } catch (screenshotError) {
                console.error('Error capturing screenshot in afterStep:', screenshotError);
            }
        }
    },
    /** 
     *
     * Runs after a Cucumber Scenario.
     * @param {ITestCaseHookParameter} world            world object containing information on pickle and test step
     * @param {object}                 result           results object containing scenario results
     * @param {boolean}                result.passed    true if scenario has passed
     * @param {string}                 result.error     error stack if scenario failed
     * @param {number}                 result.duration  duration of scenario in milliseconds
     * @param {object}                 context          Cucumber World object
     */

    afterScenario: async function (world, result, context) {
        try {
            await driver.pause(timeout);
            console.log("Result Duration:" + result.duration);

            const video = await driver.stopRecordingScreen();
            console.log("Stopped Recording screen for scenario");

            const scenarioName = world.pickle.name;
            const scenarioFullPath = world.pickle.uri;

            console.log('Scenario Name is: ' + scenarioName);
            console.log('Full Path Feature is: ' + scenarioFullPath);

            const videoFileName = await getPathAndNameFile(scenarioName, scenarioFullPath);

            if (!video || video.length === 0) {
                console.warn(`Video is empty, not saving file for scenario: ${scenarioName}`);
            } else {
                fs.writeFileSync(videoFileName, video, 'base64');
                console.log(`Video saved in: ${videoFileName}`);
            }

            await driver.pause(timeout);
            const app_yape_package = process.env.APP_YAPE_PACKAGE;

            if (!app_yape_package) {
                console.warn(`APP_YAPE_PACKAGE not defined in environment variables. Skipping app termination.`);
            } else {
                console.log(`Terminating app: ${app_yape_package}`);
                if (driver.isAndroid) {
                    await driver.terminateApp(app_yape_package);
                } else if (driver.isIOS) {
                    console.log("Closed iOS app after scenario");
                    await driver.execute('mobile: terminateApp', { bundleId: app_yape_package });
                }
            }
        } catch (error) {
            console.error('Error in afterScenario:', error);
        }
    },

    /*
     * Runs after a Cucumber Feature.
     * @param {string}                   uri      path to feature file
     * @param {GherkinDocument.IFeature} feature  Cucumber feature object
     */
    // afterFeature: function (uri, feature) {
    // },

    /**
     * Runs after a WebdriverIO command gets executed
     * @param {string} commandName hook command name
     * @param {Array} args arguments that command would receive
     * @param {number} result 0 - command success, 1 - command error
     * @param {object} error error object if any
     */
    // afterCommand: function (commandName, args, result, error) {
    // },
    /**
     * Gets executed after all tests are done. You still have access to all global variables from
     * the test.
     * @param {number} result 0 - test pass, 1 - test fail
     * @param {Array.<Object>} capabilities list of capabilities details
     * @param {Array.<String>} specs List of spec file paths that ran
     */
    // after: function (result, capabilities, specs) {
    // },
    /**
     * Gets executed right after terminating the webdriver session.
     * @param {object} config wdio configuration object
     * @param {Array.<Object>} capabilities list of capabilities details
     * @param {Array.<String>} specs List of spec file paths that ran
     */
    // afterSession: function (config, capabilities, specs) {
    // },
    /**
     * Gets executed after all workers got shut down and the process is about to exit. An error
     * thrown in the onComplete hook will result in the test run failing.
     * @param {object} exitCode 0 - success, 1 - fail
     * @param {object} config wdio configuration object
     * @param {Array.<Object>} capabilities list of capabilities details
     * @param {<Object>} results object containing test results
     */
    onComplete: function () {

        console.log('Reviewing pending test durations...');

        const allureResultsDir = './reports/allure/allure-results';

        const resultFiles = fs.readdirSync(allureResultsDir)
            .filter(file => file.endsWith('-result.json'));

        resultFiles.forEach(filename => {
            const filePath = path.join(allureResultsDir, filename);
            const content = fs.readFileSync(filePath, 'utf8');
            const testResult = JSON.parse(content);

            if (!testResult.stop && testResult.start) {
                console.log(`Setting duration for pending test: ${testResult.name}`);

                testResult.stop = testResult.start;

                if (testResult.stage === 'pending') {
                    testResult.stage = 'finished';
                    testResult.status = 'skipped';
                }

                fs.writeFileSync(filePath, JSON.stringify(testResult), 'utf8');
            }
        });

        const reportError = new Error('Could not generate Allure report');
        const generation = allure(['generate', allureDir + '/allure-results', '--clean', '-o', allureDir + '/allure-report']);
        return new Promise<void>((resolve, reject) => {
            const generationTimeout = setTimeout(
                () => reject(reportError),
                20000);

            generation.on('exit', function (exitCode: number) {
                clearTimeout(generationTimeout);

                if (exitCode !== 0) {
                    return reject(reportError);
                }

                console.log('Allure report successfully generated');
                resolve();
            });
        });
    },
    /**
    * Gets executed when a refresh happens.
    * @param {string} oldSessionId session ID of the old session
    * @param {string} newSessionId session ID of the new session
    */
    // onReload: function(oldSessionId, newSessionId) {
    // }
    /**
    * Hook that gets executed before a WebdriverIO assertion happens.
    * @param {object} params information about the assertion to be executed
    */
    // beforeAssertion: function(params) {
    // }
    /**
    * Hook that gets executed after a WebdriverIO assertion happened.
    * @param {object} params information about the assertion that was executed, including its results
    */
    // afterAssertion: function(params) {
    // }
};

function getPathAndNameFile(scenarioName: string, scenarioFullPath: string): string {

    let featureFolder = path.dirname(scenarioFullPath).replace('features/yape-features/', '');

    const timestamp = generateTimestamp();

    const platform = getPlatformName();
    featureFolder = path.join(platform, featureFolder);

    const videoDir = path.join('./reports/videos', featureFolder, timestamp);
    ensureDirectoryExists(videoDir);

    const safeScenarioName = sanitizeFileName(scenarioName);
    const videoFileName = path.join(videoDir, `${safeScenarioName}.mp4`);
    return videoFileName;
}