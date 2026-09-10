import type { GeneratedPreview } from '../../core/generation';
import type { ReviewDiagnostic } from './ipc/automation/reviewDiagnostics';
import type { AutomationValidation } from '../../core/validation';

/** Export permission is independent of validation.valid and generation success. */
export interface AutomationExportReadiness {
    previewToken: string;
    exportReady: boolean;
    exportBlockers: string[];
    missingLayers: string[];
}

export interface AutomationExportResult {
    success: boolean;
    error?: string;
    exportStatus?: 'exported' | 'exported-with-observations';
    generated?: GeneratedPreview;
    validation?: AutomationValidation;
    missingLayers?: string[];
    generationDiagnostics?: string[];
    reviewDiagnostics?: ReviewDiagnostic[];
}
