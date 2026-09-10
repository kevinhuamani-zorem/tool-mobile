import type { AutomationAssessment } from './acceptanceCriteria';

/** Recorder-owned attribution from the exact snapshots used for coverage validation. */
export interface CoverageRepairTargets {
    files: Array<{ path: string; layer: 'feature' | 'steps' | 'screen' | 'locators' | 'shared' }>;
    complete: boolean;
}

export interface ValidationIssue {
    code: string;
    message: string;
    file?: string;
    coverageRepairTargets?: CoverageRepairTargets;
}

export interface ValidationRepairGroup {
    code: string;
    file?: string;
    count: number;
    messages: string[];
}

export interface ValidationRepairContext {
    attempt: number;
    errors: ValidationIssue[];
    affectedFiles: string[];
    groups?: ValidationRepairGroup[];
}

/** Static preservation against these snapshots, never device execution or QA approval. */
export interface CaseCoverageAssessment {
    schemaVersion: 1;
    caseId: string;
    platform: 'android' | 'ios';
    status: 'preserved' | 'lost' | 'unverified';
    baselineHash: string;
    candidateHash: string;
    checkedExamples: number;
    differences: Array<{
        code: string;
        message: string;
        beforeStepIndices: number[];
        afterStepIndices: number[];
        exampleIndex?: number;
    }>;
    mappings: Array<{ beforeStepIndices: number[]; afterStepIndices: number[]; exampleIndex: number }>;
}

export interface AutomationValidation {
    valid: boolean;
    /** Verdict tied to these exact files; qualityScore is legacy technical telemetry. */
    assessment?: AutomationAssessment;
    caseCoverage?: CaseCoverageAssessment;
    qualityScore: number;
    errors: ValidationIssue[];
    warnings: string[];
    repairContext?: ValidationRepairContext;
}
