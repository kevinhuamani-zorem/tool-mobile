import type { RecordedStep } from './models';
import type { AcceptanceCriterion } from './acceptanceCriteria';

export type TestPathType = 'Happy Path' | 'Unhappy Path';
export type MobilePlatform = 'android' | 'ios';

export interface GenerationRequest {
    squad: string;
    /** Criterios confirmados por QA; su evaluación no acredita ejecución móvil. */
    acceptanceChecks?: AcceptanceCriterion[];
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
    /** Procedencia de una selección automática; nunca incluye credenciales del fixture. */
    testDataSelection?: { mode: 'automatic'; name: string; file?: string; reason: string };
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
            /**
             * Ciclo cuyas vueltas tocan locators distintos (un getter por
             * filtro): el metodo recorre los valores de la DataTable y elige
             * el getter de cada valor, en vez de repetir los clicks fijos.
             */
            variants?: Array<{ value: string; variableName: string }>;
        };
        actions?: RecordedStep[];
        status?: 'reused' | 'missing';
        /**
         * Origen del texto: `domain`, `qa`, `template`, `agent` o `memory`.
         * Solo `template` es wording generado por máquina y puede requerir
         * reescritura; `memory` es wording que ya validó otro caso a score 100
         * para exactamente esta secuencia de elementos.
         */
        wording?: 'domain' | 'qa' | 'template' | 'agent' | 'memory';
        methodName?: string;
        reuse?: {
            kind: 'step' | 'method';
            className: string;
            screenFile: string;
            stepFile?: string;
            methodName: string;
            signature: string;
            returnType: 'void' | 'boolean';
            sourceHash: string;
            dependencies: Record<string, string>;
            helpers: string[];
            catalogRevision?: string;
            sequences: number[];
            reason: string;
        };
        /** Trazabilidad de una fila `wording: memory`: de qué caso viene. */
        memory?: { caseId: string; screenMethod?: string };
    }[];
}
