import axios, { AxiosInstance } from 'axios';
import yaml from 'js-yaml';
import { scenarioSession } from './ScenarioSession.ts';

class ApiClient {
    private client: AxiosInstance;

    constructor(baseURL: string) {
        this.client = axios.create({ baseURL });
    }

    async get<T>(url: string, params?: object): Promise<T> {
        const response = await this.client.get<T>(url, { params });
        return response.data;
    }

    async post<T>(url: string, data?: object): Promise<T> {
        const response = await this.client.post<T>(url, data);
        return response.data;
    }

    async postWithYaml(url: string, data: object): Promise<{ status: number; body: any }> {
        try {
            const dataArray = [data];

            const yamlData = yaml.dump(dataArray);

            console.log('Request object (in YAML format):', yamlData);

            const response = await this.client.post(url, yamlData, {
                headers: {
                    'Content-Type': 'text/plain'
                }
            });

            const status = response.status;
            const body = response.data;

            console.log('State code:', status);
            console.log('Body of the response (json):', JSON.stringify(body, null, 2));

            return { status, body };
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                console.error('Error status code:', error.response.status);
                console.error('Error body:', JSON.stringify(error.response.data, null, 2));
            } else if (error instanceof Error) {
                console.error('POST request error:', error.message);
            } else {
                console.error('Unknown error:', error);
            }
            throw error;
        }
    }

    async change_user_personality(idc: string, personality_to_update: string) {

        try {
            const url = `${process.env.WALLE_UPDATE_USER_PERSONALITY}`;
            const payload = `${idc}, ${personality_to_update}`;
            const headers = { 'Content-Type': 'text/plain' };

            console.log(`The URL for the request is: ${url}`);
            console.log(`The payload for the request is: ${payload}`);

            const response = await this.client.post(url, payload, { headers });
            const status = response.status;
            const body = response.data;

            console.log('Código de estado:', status);
            console.log('Cuerpo de la respuesta (json):', JSON.stringify(body, null, 2));

            return { status, body };

        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                console.error('Error status code:', error.response.status);
                console.error('Error body:', JSON.stringify(error.response.data, null, 2));
            } else if (error instanceof Error) {
                console.error('POST request error:', error.message);
            } else {
                console.error('Unknown error:', error);
            }
            throw error;
         }

    }
}

export default new ApiClient(`${process.env.URL_MOCK}`);
