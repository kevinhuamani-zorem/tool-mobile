
import { expect } from 'chai';

export const Assertions = {
    assertStatusCode: (response: any, expectedStatus: number) => {
        expect(response.status).to.equal(expectedStatus);
    },
    assertResponseBody: (response: any, expectedBody: any) => {
        expect(response.body).to.deep.equal(expectedBody);
    },
    assertCompareString: (realString: string, expectedString: string) => {
        expect(realString).to.equal(expectedString);
    },
    assertStringIncludes: (realString: string, expectedString: string) => {
        expect(realString).to.includes(expectedString);
    },
    assertCompareNumbers: (
        actual: number,
        expected: number,
        operator: '>' | '<' | '>=' | '<=' | '===' | '!=='
    ) => {
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
    },
    assertCompareBoolean: (realValue: boolean, expectedValue: boolean, message?: string) => {
        expect(realValue).to.equal(expectedValue, message);
    },
};

