import { expect } from 'chai';
import { ApiResponse } from '@common/types/generic-entities.ts';

export class Assertions {

    static statusCode(response: ApiResponse, expectedStatus: number, message?: string) {
        const msg = message || `Expected HTTP status ${expectedStatus} and it was obtained ${response?.status}`;
        expect(response.status, msg).to.equal(expectedStatus);
    }

    static responseBody<T>(response: ApiResponse<T>, expectedBody: T, message?: string): void {
        const msg = message || 'The response body does not match the expected value';
        expect(response.body, msg).to.deep.equal(expectedBody);
    }

    static compareString(actualString: string, expectedString: string, message?: string): void {
        const msg = message || `Expected "${actualString}" to equal "${expectedString}"`;
        expect(actualString, msg).to.equal(expectedString);
    }

    static stringIncludes(actualString: string, expectedSubString: string, message?: string): void {
        const msg = message || `Expected "${actualString}" to include "${expectedSubString}"`;
        expect(actualString, msg).to.include(expectedSubString);
    }

    static isBoolean(realValue: boolean, expectedValue: boolean, message?: string) {
        const msg = message || `Expected boolean value ${expectedValue} but got ${realValue}`;
        expect(realValue, msg).to.equal(expectedValue);
    }

    static compareNumbers(
        actual: number,
        expected: number,
        operator: '>' | '<' | '>=' | '<=' | '===' | '!=='
    ) {
        switch (operator) {
            case '>':
                expect(actual).to.be.greaterThan(expected);
                break;
            case '<':
                expect(actual).to.be.lessThan(expected);
                break;
            case '>=':
                expect(actual).to.be.at.least(expected);
                break;
            case '<=':
                expect(actual).to.be.at.most(expected);
                break;
            case '===':
                expect(actual).to.equal(expected);
                break;
            case '!==':
                expect(actual).to.not.equal(expected);
                break;
            default:
                throw new Error(`Operador no soportado: ${operator}`);
        }
    }
}
