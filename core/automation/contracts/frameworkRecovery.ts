export type RecoveryLayer = 'feature' | 'steps' | 'screen' | 'locators' | 'dependency';
export interface FrameworkRecoveryRequest {
    recordingId?: string;
    squad?: string;
    /** Previous path -> current path, explicitly associated by QA. */
    paths?: Record<string, string>;
    /** Additional symbols explicitly associated by QA; '*' selects the file. */
    symbols?: Record<string, string[]>;
    prUrl?: string;
    notes?: string;
}
export interface RecoveryChange {
    symbol: string;
    before: string | null;
    after: string | null;
    scope: 'case' | 'unrelated' | 'pending';
}
export interface RecoveryFile {
    path: string;
    previousPath?: string;
    layer: RecoveryLayer;
    association: 'receipt' | 'relations' | 'qa';
    shared: boolean;
    baseline?: string | null;
    exported: string | null;
    current: string | null;
    /** Case projection; unrelated edits are excluded from the saved revision. */
    content: string | null;
    currentHash: string | null;
    symbols: string[];
    changes: RecoveryChange[];
}
export interface RecoveryRelation {
    from: { path: string; symbol: string };
    to: { path: string; symbol: string };
    kind: 'step' | 'call' | 'locator' | 'import';
}
export interface RecoveryPending {
    id: string;
    message: string;
    path?: string;
    candidates?: string[];
}
export interface FrameworkRecoveryPreview {
    schemaVersion: 1;
    token: string;
    recordingId: string;
    caseId?: string;
    exportId?: string;
    sourceRevisionId?: string;
    files: RecoveryFile[];
    relations: RecoveryRelation[];
    pending: RecoveryPending[];
    parameters: string[];
    recordedTrace: unknown[];
    traceAssociations: Array<{ sequence: number; status: 'preserved' | 'pending'; gherkinStep: string }>;
    associations: { paths: Record<string, string>; symbols: Record<string, string[]> };
    context: { repository?: string; branch?: string; commit?: string; dirty?: boolean; prUrl?: string; notes?: string };
}
export interface FrameworkRecoverySaved {
    revisionId: string;
    recordingId: string;
    files: number;
    pending: number;
}
