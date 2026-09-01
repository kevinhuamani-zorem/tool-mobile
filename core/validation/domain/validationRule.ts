export interface ValidationRuleContractEntry {
    code: string;
    requirement: string;
    minimalExample: string | null;
    needsExplanation: boolean;
}

export interface ValidationRuleContract {
    schemaVersion: 1;
    source: 'automationResponseValidator';
    totalRules: number;
    expressibleWithMinimalExampleCount: number;
    explanationOnlyCount: number;
    notExpressibleCount: number;
    rules: ValidationRuleContractEntry[];
}
