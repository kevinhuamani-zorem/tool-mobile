import { After } from "@wdio/cucumber-framework";

const getBundleId = (): string => process.env.BUNDLE_ID || "";
const getAndroidPackage = (): string => process.env.APP_YAPE_PACKAGE || "";

const closeAndResetApp = async (): Promise<void> => {
    const bundleId = getBundleId();
    const androidPackage = getAndroidPackage();

    if (driver.isIOS && bundleId) {
        await driver.execute("mobile: terminateApp", { bundleId });
        await driver.execute("mobile: clearKeychains");
        return;
    }

    if (driver.isAndroid && androidPackage) {
        await driver.terminateApp(androidPackage);
    }
};

After(async function () {
    try {
        await closeAndResetApp();
    } catch (error) {
        console.error(
            "[Hooks] Error closing/resetting app in Cucumber After hook:",
            error,
        );
    }
});
