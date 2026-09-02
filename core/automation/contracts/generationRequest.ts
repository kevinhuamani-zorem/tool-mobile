import type { RecordedStep } from './models';

export type TestPathType = 'Happy Path' | 'Unhappy Path';
export type MobilePlatform = 'android' | 'ios';

export interface GenerationRequest {
    squad: string;
    /** Ruta opcional bajo features/yape-features/<squad>; no altera las demás capas. */
    featureScope?: string;
    featureName: string;
    scenarioName: string;
    fileName: string;
    locatorModule: string;
    caseId: string;
    pathType: TestPathType;
    tag: string;
    /**
     * Tier de ejecución (`smoke_mobile` / `regression_mobile`). El estándar del
     * repo lo exige en cada Scenario y su ausencia bloquea el merge. Si no
     * llega, se deriva de `pathType`.
     */
    executionTag?: string;
    dataName?: string;
    examples?: Record<string, string>;
    platform: MobilePlatform;
    createdAt?: string;
    scenarioRows?: {
        keyword: 'Given' | 'When' | 'Then' | 'And' | 'But';
        text: string;
        dataTable?: {
            headers: string[];
            rows: string[][];
        };
        repetitionExecution?: {
            loopStartIndex: number;
            loopLength: number;
            parameter: string;
        };
        actions?: RecordedStep[];
        status?: 'reused' | 'missing';
        /**
         * Origen del texto: `domain`, `qa` o `template`. Solo `template` es
         * wording generado por máquina y puede requerir reescritura.
         */
        wording?: 'domain' | 'qa' | 'template' | 'agent';
        methodName?: string;
    }[];
}
