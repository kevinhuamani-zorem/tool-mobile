
export class ConstantsPagoDeServicio {
    static DEEPLINK_CATEGORY_PATH = "/app/services-pay/selectCategory";
    static DEEPLINK_HOME_ANDROID = "https://www.yape.com.pe/app/services-pay";
    static DEEPLINK_HOME_IOS = "yape://yape.com.pe/app/services-pay";
    static DEEPLINK_PICK_SERVICE_PATH = "/app/services-pay/pickService";
    static DEEPLINK_PICK_SERVICE_PARAMS_BACKUS =
        "logo=https://staceu2yapefrntp10.blob.core.windows.net/%24web/bill-payment/companies/backus/backus-v2.png&companyId=C68B6889-6510-47C2-BCBD-517E5CC99EB7&name=Backus&serviceId=d6c6e2a3-9fa5-452b-9e67-547a1596e888&origin=deeplink-externo&origin_detail=tercero-web&utm_source=tercero-web&utm_medium=referral&utm_campaign=ext_pago-de-servicios_alcance_backus-cervecero";

    static DEEPLINK_PICK_SERVICE_PARAMS_ENTEL =
        "logo=https://staceu2yapefrntp10.blob.core.windows.net/%24web/bill-payment/companies/entel/entel.png&companyId=4AE7D588-CFD2-4EA9-93AD-60DE0AD4E31C&name=Entel&serviceId=e94afdc7-2038-4ec7-9696-c0c093674b77&origin=deeplink-externo&origin_detail=tercero-web&utm_source=tercero-web&utm_medium=referral&utm_campaign=ext_pago-de-servicios_alcance_entel-cta-financiera";

    static AMOUNT_TO_PAY = '50';

    static BILL_PAYMENT_SETTINGS_KEY = 'idBillPayment:settings';
    static BILL_PAYMENT_COMPANIES_KEY = 'idBillPayment:companies:all';
}