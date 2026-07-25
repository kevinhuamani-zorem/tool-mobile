import { browser } from "@wdio/globals";
import { GestureHelper } from "./core/GestureHelper.js";
import { KeyboardHelper } from "./core/KeyboardHelper.js";
import { UIHelper } from "./core/UIHelper.js";

/**
 * BaseScreen - Abstract base class for all Page Objects
 *
 * This class serves as the foundation for all screen/page objects in the test suite.
 * It uses composition to provide access to core technical utilities (UIHelper, GestureHelper, KeyboardHelper)
 * without mixing Page Object responsibilities with low-level Appium operations.
 *
 * Responsibilities:
 * - Provide common platform detection (Android/iOS)
 * - Expose helper instances for Page Objects to use via composition
 * - Define base navigation methods (optional, to be implemented by subclasses)
 *
 * Design Principles:
 * - Composition over inheritance: Helpers are injected, not inherited
 * - Single Responsibility: Page Objects should only contain screen-specific logic
 * - Platform abstraction: Use LocatorFactory for cross-platform selectors
 *
 * @abstract
 * @class BaseScreen
 */
export default abstract class BaseScreen {
    /**
     * UIHelper instance - Provides element waiting and interaction methods
     * Use this for all element operations: waiting, clicking, getting text, etc.
     */
    public uiHelper: UIHelper;

    /**
     * GestureHelper instance - Provides mobile gesture operations
     * Use this for scrolling, swiping, touch operations
     */
    public gestureHelper: GestureHelper;

    /**
     * KeyboardHelper instance - Provides keyboard and input operations
     * Use this for OTP submission and keyboard management
     */
    public keyboardHelper: KeyboardHelper;

    /**
     * Constructor - Initializes helper instances via composition
     */
    constructor() {
        this.uiHelper = new UIHelper();
        this.gestureHelper = new GestureHelper();
        this.keyboardHelper = new KeyboardHelper();
    }

    /**
     * Gets the current platform name
     * @returns 'Android' or 'iOS'
     */
    protected get platform(): "Android" | "iOS" {
        return browser.isAndroid ? "Android" : "iOS";
    }

    /**
     * Checks if current platform is Android
     * @returns true if running on Android
     */
    protected get isAndroid(): boolean {
        return browser.isAndroid;
    }

    /**
     * Checks if current platform is iOS
     * @returns true if running on iOS
     */
    protected get isIOS(): boolean {
        return browser.isIOS;
    }

}
