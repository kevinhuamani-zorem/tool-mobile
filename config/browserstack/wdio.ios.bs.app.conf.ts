import dotenvFlow from 'dotenv-flow';
import path from 'path';
import fs from 'fs';
import { globSync } from 'glob';


dotenvFlow.config({
    path: path.resolve(process.cwd(), 'config/envs'),
    node_env: process.env.NODE_ENV || 'qa',
});

// Validate required environment variables
function validateRequiredEnvVars(): void {
    const required = [
        'BROWSERSTACK_USER_NAME',
        'BROWSERSTACK_ACCESS_KEY',
        'URL_BS_IPA',
        'BUNDLE_ID',
    ];

    const missing: string[] = [];
    required.forEach((name) => {
        const value = process.env[name];
        if (!value || value.trim() === '') {
            missing.push(name);
        }
    });

    if (missing.length > 0) {
        console.error('━'.repeat(80));
        console.error('❌ MISSING REQUIRED ENVIRONMENT VARIABLES');
        console.error('━'.repeat(80));
        missing.forEach(m => console.error(`   ✗ ${m}`));
        console.error('━'.repeat(80));
        process.exit(1);
    }

    console.log('[CONFIG] ✓ All required environment variables are set');
}

validateRequiredEnvVars();

// Configuration
const cucumberFolder = process.env.CUCUMBER_FOLDER;
const tagName = process.env.TAG_NAME || 'ALL';
const specBase = cucumberFolder
    ? path.resolve(process.cwd(), cucumberFolder)
    : path.resolve(process.cwd(), 'features/yape-features');
const allFeatures = globSync(`${specBase}/**/*.feature`);

// Filter specs by tag (or all if tag is "ALL")
const filteredSpecs = tagName === 'ALL'
    ? allFeatures
    : allFeatures.filter((file) => {
        try {
            const content = fs.readFileSync(file, 'utf8');
            return content.includes(tagName);
        } catch {
            return false;
        }
    });

console.log(`[BrowserStack] Cucumber Folder: ${cucumberFolder || 'all features'}`);
console.log(`[BrowserStack] Tag: ${tagName}`);
console.log(`[BrowserStack] Specs to execute: ${filteredSpecs.length}`);

// Validate specs and show available tags if none found
if (filteredSpecs.length === 0) {
    console.error('━'.repeat(80));
    console.error('❌ ERROR: No feature files found');
    console.error('━'.repeat(80));
    console.error(`📁 Folder: ${specBase}`);
    console.error(`🏷️  Tag: ${tagName}`);
    console.error(`📊 Total .feature files scanned: ${allFeatures.length}`);

    // Only show available tags if tag is not "ALL"
    if (tagName !== 'ALL') {
        const availableTags = new Set<string>();
        allFeatures.forEach(file => {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const tagMatches = content.match(/@[\w_-]+/g);
                if (tagMatches) {
                    tagMatches.forEach(tag => availableTags.add(tag));
                }
            } catch {}
        });

        if (availableTags.size > 0) {
            console.error(`\n📌 Available tags in this folder:`);
            Array.from(availableTags).sort().forEach(tag => console.error(`   ${tag}`));
        }
    }

    console.error('━'.repeat(80));
    process.exit(1);
}

// BrowserStack configuration
const teamName = process.env.TEAM_NAME || 'Yape';
const projectName = `${teamName}`;
const bsProjectId = process.env.BROWSERSTACK_PROJECT_ID || '';
const environment = process.env.NODE_ENV || 'qa';
const actor = process.env.GITHUB_ACTOR || 'unknown';
const buildDate = new Date().toISOString().split('T')[0];
const isCI = process.env.GITHUB_ACTIONS === 'true';

if (!isCI) {
    console.error('━'.repeat(80));
    console.error('EXECUTION BLOCKED: BrowserStack can only run from GitHub Actions.');
    console.error('However, you can run tests locally using Appium or local simulators/emulators.');
    console.error('━'.repeat(80));
    process.exit(1);
}

const webviewMode = process.env.WEBVIEW_TESTS === 'true';
const debugMode = process.env.BS_DEBUG === 'true';
const localIdentifier = process.env.BROWSERSTACK_LOCAL_IDENTIFIER || 'my-tunnel';
const useTunnelForDevice = webviewMode;

console.log(`[BrowserStack] Project ID: ${bsProjectId || 'not set'}`);
console.log(`[BrowserStack] WebView mode: ${webviewMode ? 'ENABLED' : 'DISABLED'}`);
console.log(`[BrowserStack] Tunnel for device: ${useTunnelForDevice ? 'YES' : 'NO'}`);
console.log(`[BrowserStack] Local identifier: ${localIdentifier}`);
console.log(`[BrowserStack] Debug mode: ${debugMode ? 'ENABLED' : 'DISABLED'}`);

export const config: WebdriverIO.Config = {
    specs: filteredSpecs,
    maxInstances: 1,
    user: process.env.BROWSERSTACK_USER_NAME,
    key: process.env.BROWSERSTACK_ACCESS_KEY,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 1,
    waitforTimeout: 15000,
    
    services: [
        ['browserstack', {
            testObservability: false, // Disabled to prevent auto-creation of Test Cases in TM
            percy: false,
            browserstackLocal: false, // Tunnel managed externally by GitHub Actions
            networkLogs: false,
        }]
    ],
    
    reporters: [
        'spec',
        ['cucumberjs-json', {
            jsonFolder: './reports/cucumber-json/',
            language: 'en',
        }],
    ],
    
    framework: 'cucumber',
    cucumberOpts: {
        require: [
            path.resolve(process.cwd(), 'features/yape-steps-definitions/**/*.ts'),
            path.resolve(process.cwd(), 'support/hooks/app-lifecycle.hooks.ts'),
        ],
        backtrace: false,
        requireModule: [],
        dryRun: false,
        failFast: false,
        snippets: true,
        source: true,
        strict: false,
        tags: tagName === 'ALL' ? '' : tagName,
        timeout: 120000,
        ignoreUndefinedDefinitions: true
    },

    onPrepare: async function () {
        if (webviewMode) {
            console.log('[TUNNEL] Waiting for tunnel to stabilize...');
            await new Promise(resolve => setTimeout(resolve, 20000));
        } else {
            console.log('[TUNNEL] Tunnel disabled (WebView mode not enabled)');
        }
    },

    beforeScenario: async function (scenario) {
        const bundleId = process.env.BUNDLE_ID;
        if (!bundleId) {
            throw new Error('Missing BUNDLE_ID environment variable');
        }

        const reset = scenario.pickle.tags.some(tag => tag.name === '@reset');
        const scenarioName = scenario.pickle.name;

        console.log(`[SCENARIO START] ${scenarioName}`);
        console.log(`[TAGS] ${scenario.pickle.tags.map(t => t.name).join(', ')}`);

        if (reset) {
            console.log('[RESET] Reloading session...');
            await driver.reloadSession();
        }

        try {
            await driver.execute('mobile: activateApp', { bundleId });
            await driver.pause(2000);
        } catch (error) {
            console.error(`[ERROR] Failed to activate app: ${error}`);
            throw error;
        }
    },

    afterScenario: async function (world, result) {
        try {
            const bundleId = process.env.BUNDLE_ID || '';
            const scenarioName = world.pickle.name;
            const passed = result.passed;
            const tags = world.pickle.tags.map(t => t.name).join(', ');

            const status = passed ? 'passed' : 'failed';
            const errorMessage = result.error ?? '';
            const reason = passed
                ? `✓ ${scenarioName}`
                : `✗ ${scenarioName} | Tags: ${tags} | Error: ${errorMessage.substring(0, 200)}`;

            console.log(`[BrowserStack] Scenario: ${scenarioName} - ${status.toUpperCase()}`);
            console.log(`[BrowserStack] Tags: ${tags}`);
            console.log(`[BrowserStack] Duration: ${result.duration}ms`);

            // Report status to BrowserStack
            await driver.execute(
                `browserstack_executor: {"action":"setSessionStatus","arguments":{"status":"${status}","reason":"${reason}"}}`
            );

            // Capture screenshot on failure
            if (!passed) {
                try {
                    await driver.takeScreenshot();
                    console.log('[BrowserStack] Screenshot captured');
                } catch (e) {
                    console.warn('[BrowserStack] Could not capture screenshot:', e);
                }
            }

            // App termination is handled centrally by support/hooks/app-lifecycle.hooks.ts

        } catch (error) {
            console.error('[BrowserStack] Error in afterScenario:', error);
        }
    },

    onComplete: function () {
        console.log('[BrowserStack] All tests completed.');
    },

    capabilities: [
        {
            platformName: 'iOS',
            'appium:app': process.env.URL_BS_IPA,
            'appium:deviceName': process.env.DEVICE_NAME || 'iPhone 14',
            'appium:platformVersion': process.env.PLATFORM_VERSION || '16.0',
            'appium:autoAcceptAlerts': true,
            'acceptInsecureCerts': true,
            'appium:newCommandTimeout': 300,
            'appium:wdaLaunchTimeout': 120000,
            'appium:wdaConnectionTimeout': 120000,

            'bstack:options': {
                projectName: projectName,
                buildName: `${teamName} | ${environment} | @${actor} | ${buildDate} | mobile-ios`,
                
                // Only activate tunnel if WebView mode enabled
                ...(useTunnelForDevice && { local: true, localIdentifier }),
                
                // Enhanced logging
                networkLogs: false,
                
                // Debug mode
                ...(debugMode && {
                    debug: true,
                    consoleLogs: 'verbose',
                }),
                
                // Session metadata
                sessionName: `${tagName} - ${new Date().toISOString()}`,
            },
        },
    ] as WebdriverIO.Capabilities[],
};

