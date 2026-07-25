import { browser } from '@wdio/globals';
import { TypeLocator } from './Enums.js';
import { Constants } from './constants.js';

export default class LocatorFactory {

    static getElement(type_selector_on_ios: TypeLocator, selector_value_on_ios: string, type_selector_on_android: TypeLocator, selector_value_on_android: string){
        let locatorValue : string = '';

        if (browser.isAndroid) {
            locatorValue = LocatorFactory.getObjectAndroid(type_selector_on_android, selector_value_on_android);
        } else if (browser.isIOS) {
            locatorValue = LocatorFactory.getObjectIos(type_selector_on_ios, selector_value_on_ios);
        } else {
            throw new Error('Platform not found');
        }

        return locatorValue;
    }

    private static getObjectAndroid(type_selector_on_android: TypeLocator, selector_value_on_android: string) {
        switch (type_selector_on_android) {
        case TypeLocator.ID: return Constants.ID + selector_value_on_android;
        case TypeLocator.XPATH: return Constants.XPATH + selector_value_on_android;
        case TypeLocator.ANDROID: return Constants.ANDROID_LOCATOR + selector_value_on_android;
        case TypeLocator.CLASSNAME: return Constants.ANDROID_CLASS_NAME + Constants.OPEN_PARENTHESIS + selector_value_on_android + Constants.CLOSED_PARENTHESIS;
        default:
            break;
        }

        throw new Error(`Type locator not found: ${type_selector_on_android}`);
    }

    private static getObjectIos(type_selector_on_ios: TypeLocator, selector_value_on_ios: string) {
        switch (type_selector_on_ios) {
        case TypeLocator.ID: return Constants.ID + selector_value_on_ios;
        case TypeLocator.XPATH: return Constants.XPATH + selector_value_on_ios;
        case TypeLocator.PREDICATESTRING: return Constants.PREDICATE_STRING + selector_value_on_ios;
        case TypeLocator.CLASSCHAIN: return Constants.CLASS_CHAIN + selector_value_on_ios;
        case TypeLocator.CLASSNAME: return Constants.IOS_CLASS_NAME + Constants.OPEN_PARENTHESIS + selector_value_on_ios + Constants.CLOSED_PARENTHESIS;
        default:
            break;
        }

        throw new Error(`Type locator not found: ${type_selector_on_ios}`);
    }

}
