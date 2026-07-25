export class Constants {

    //Constantes genericas
    static TIMEOUT_POR_DEFECTO: number = 20000;
    static TIMEOUT_LONG: number = 12000;
    static REDIS_OTP_INAPP_MAPNAME: string = 'yapeappotp_INAPP';
    static REDIS_OTP_LOGIN_MAPNAME: string = 'yapeappotp_login';
    static REDIS_OTP_ONBOARDING_MAPNAME: string = 'yapeappotp_ONBOARDING';
    static REDIS_OTP_BILL_PAYMENT_MAPNAME: string = 'yapeappotp_BILLPAYMENT';
    static MOBILE_DEEPLINK: string = 'mobile:deepLink';
    static ATTEMPTS_OTP_MAP_KEY: string = 'OtpSmsAttemptParameterMap:otpSmsAttemptParameterKey';

    //DATE AND TIME
    static DATE_TIME_YYYY_MM_DD_HH_MM: string = 'yyyy-MM-dd HH:mm';

    //aux locators
    static ID: string = '~';
    static XPATH: string = '';
    static ANDROID_LOCATOR: string = 'android=';
    static PREDICATE_STRING: string = '-ios predicate string:';
    static CLASS_CHAIN: string = '-ios class chain:';
    static ANDROID_CLASS_NAME: string = 'android=.className';
    static IOS_CLASS_NAME: string = 'ios=.className';

    //Simbolos
    static DOLLAR_SYMBOL: string = '$';
    static POINT: string = '.';
    static TWO_POINT: string = ':';
    static OPEN_PARENTHESIS: string = '(';
    static CLOSED_PARENTHESIS: string = ')';
    static ASTERISK: string = '*';
    static EMPTY: string = '';

    static CONTENT_DESC: string = 'content-desc';
    static MAX_SEARCH_KEYWORDS_RETRIES: number = 5;
    static RETRY_DELAY_MS: number = 200;
    static ANDROID_KEYCODE_ENTER: number = 66;
    static ANDROID_KEYCODE_BACK: number = 4;

}
