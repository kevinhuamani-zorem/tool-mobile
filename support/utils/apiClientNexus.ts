import axios, { AxiosInstance } from 'axios';
import { scenarioSession } from './ScenarioSession.ts';
import { getCurrentDate } from './Utils.ts';

class ApiClientNexus {
    private clientb2c: AxiosInstance;
    private clientAzure: AxiosInstance;
    private currentDate: string;

    constructor() {
        this.clientb2c = axios.create({ baseURL: process.env.URL_SERVER_B2C });
        this.clientAzure = axios.create({ baseURL: process.env.URL_SERVER_AZURE });
        this.currentDate = getCurrentDate();
    }

    getUserInfo() {
        scenarioSession.loadInteroperableUsers();
        const user = scenarioSession.getUser();
        if (!user) throw new Error('Do not have user info in session');
        console.log('User found:', user.email);
        return user;
    }

    async getBaseAuthTokenB2C() {
        const user = this.getUserInfo();

        const url = `${process.env.GET_BASE_AUTH_TOKEN_B2C}`;
        const paramsAuthToken = {
            username: user.email,
            password: process.env.B2C_REQUEST_USER_PASSWORD,
            grant_type: process.env.B2C_REQUEST_GRANT_TYPE,
            client_id: process.env.B2C_REQUEST_CLIENT_ID,
            scope: `openid ${process.env.B2C_REQUEST_CLIENT_ID}`,
            response_type: process.env.B2C_REQUEST_RESPONSE_TYPE,
            authResult: process.env.B2C_REQUEST_AUTH_RESULT,
            idYapeAccount: process.env.B2C_REQUEST_ID_YAPE_ACCOUNT_BASE
        };

        try {
            const response = await this.clientb2c.post(url, {}, { params: paramsAuthToken });
            console.log('Response from B2C base token request:', response.data.access_token);
            return response.data.access_token;
        } catch (error) {
            console.error('An error occurred while attempting to create the base token for B2C.', error);
            throw new Error('Error creating base token for B2C');
        }
    }

    async getBsAcctSetUUID() {
        const user = this.getUserInfo();
        const authToken = await this.getBaseAuthTokenB2C();
        const url = `${process.env.GET_BS_ACC_UUID}`;
        const paramsBsAccSet = {
            states: process.env.B2C_REQUEST_STATES,
            email: user.email
        };

        try {

            const response = await this.clientAzure.get(url, {
                params: paramsBsAccSet,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    'Request-ID': process.env.B2C_REQUEST_ID,
                    'request-date': this.currentDate,
                    'app-code': process.env.B2C_REQUEST_CODE,
                    'caller-name': process.env.B2C_REQUEST_CALLER_NAME
                }
            });
            console.log('Response uuid from bus-acc-v4:', response.data.accountDetail.relatedDevice.uuid);
            return response.data.accountDetail.relatedDevice.uuid;
        } catch (error) {
            console.error('An error occurred while requesting the API bus-acc-v4. There was an issue retrieving the UUID from the accountDetail.relatedDevice attribute.', error);
            throw new Error('Error retrieving UUID from bus-acc-v4');
        }
    }

    async getAuthTokenB2C() {
        const user = this.getUserInfo();
        const uuid = await this.getBsAcctSetUUID();
        const url = `${process.env.GET_AUTH_TOKEN_B2C}`;

        const paramsAuthToken = {
            extension_uuid: uuid,
            extension_request_id: process.env.B2C_REQUEST_ID,
            extension_request_date: this.currentDate,
            extension_xchannel: process.env.B2C_REQUEST_EXTENSION_XCHANNEL,
            extension_callerName: process.env.B2C_REQUEST_CALLER_NAME,
            extension_appCode: process.env.B2C_REQUEST_CODE,
            extension_subscription_key: process.env.B2C_REQUEST_OCP_APIM_SUBSCRIPTION_KEY
        };

        const headersAuthToken = {
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        const bodyToken = {
            client_id: process.env.B2C_REQUEST_CLIENT_ID,
            scope: `openid ${process.env.B2C_REQUEST_CLIENT_ID}`,
            username: user.email,
            password: process.env.B2C_REQUEST_USER_PASSWORD,
            grant_type: process.env.B2C_REQUEST_GRANT_TYPE,
            response_type: process.env.B2C_REQUEST_RESPONSE_TYPE,
            code_challenge_method: process.env.B2C_REQUEST_CODE_CHALLENGE_METHOD
        };

        try {
            const response = await this.clientb2c.post(url, bodyToken, { params: paramsAuthToken, headers: headersAuthToken });
            console.log('Response from B2C token request:', response);
            return response.data.access_token;
        } catch (error) {
            console.error('Error retrieving the B2C token for Policy: b2c_1a_yape_personas_unlock_mobile.', error);
            return null;
        }
    }

    async getMenuItemsFromHomeByType(datakey: string) {
        const user = this.getUserInfo();

        const authToken = await this.getAuthTokenB2C();
        const url = `${process.env.GET_MENU_ITEMS_FROM_HOME}`;
        const params = { platform: user.platform, version: process.env.B2C_REQUEST_APP_VERSION };

        const headers = {
            Authorization: `Bearer ${authToken}`,
            'Request-ID': process.env.B2C_REQUEST_ID,
            'request-date': this.currentDate,
            'app-code': process.env.B2C_REQUEST_CODE,
            'caller-name': process.env.B2C_REQUEST_CALLER_NAME,
            'Ocp-Apim-Subscription-Key': process.env.B2C_REQUEST_OCP_APIM_SUBSCRIPTION_KEY
        };

        try {
            const response = await this.clientAzure.get(url, { params, headers });
            const menuItems = response.data?.[datakey];
            if (!menuItems) throw new Error(`Do not found menu items for datakey: ${datakey}`);
            console.log(`Response from getMenuItemsFromHomeByType for datakey "${datakey}":`, menuItems);
            return menuItems;
        } catch (error) {
            console.error(`An error occurred while requesting the API getMenuItemsFromHomeByType for datakey "${datakey}".`, error);
            throw error;
        }

    }
}

export default new ApiClientNexus();
