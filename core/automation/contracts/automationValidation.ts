import type { AutomationAssessment } from './acceptanceCriteria';

export interface ValidationIssue {
    code: string;
    message: string;
    file?: string;
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

export interface AutomationValidation {
    valid: boolean;
    /** Verdict tied to these exact files; qualityScore is legacy technical telemetry. */
    assessment?: AutomationAssessment;
    qualityScore: number;
    errors: ValidationIssue[];
    warnings: string[];
    repairContext?: ValidationRepairContext;
}
