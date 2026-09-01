export type {
    AutomationValidation,
    ValidationIssue,
    ValidationRepairContext,
    ValidationRepairGroup,
} from '../../automation/contracts';

export interface OutputValidation {
    valid: boolean;
    errors: string[];
    warnings: string[];
    conflicts: string[];
}
