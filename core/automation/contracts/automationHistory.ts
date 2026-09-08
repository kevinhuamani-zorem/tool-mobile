/** Append-only provenance. Compatibility files in automation/ remain mutable views. */
export type AutomationRevisionSource = 'recording' | 'regeneration' | 'qa-edit' | 'framework-import' | 'legacy';
export type AutomationArtifactOrigin = 'recording' | 'agent' | 'recorder' | 'qa' | 'framework' | 'legacy';
export interface AutomationHistoryIdentity {
    recordingId: string;
    caseId?: string;
    revisionId: string;
    parentRevisionId?: string;
    basedOnAttemptId?: string;
    /** The existing AgentRunStore.runId, never a second independent run identifier. */
    attemptId?: string;
    planId?: string;
}
export interface AutomationHistoryArtifact {
    /** Logical name only: never used as a filesystem destination. */
    name: string;
    sha256: string;
    bytes: number;
}
export interface AutomationHistoryEvent extends AutomationHistoryIdentity {
    schemaVersion: 1;
    eventId: string;
    sequence: number;
    createdAt: string;
    kind: 'revision-created' | 'attempt-started' | 'attempt-planned' | 'artifact-captured' | 'generation-result' | 'qa-validation-result' | 'export-result' | 'qa-verification';
    origin: AutomationArtifactOrigin;
    source?: AutomationRevisionSource;
    /** Automatic pass when known. Historical imports keep this absent. */
    pass?: 1 | 2;
    stage?: string;
    result?: string;
    artifacts: AutomationHistoryArtifact[];
}
export interface AutomationLifecycle {
    generation: 'not-started' | 'running' | 'passed' | 'failed' | 'unknown';
    export: 'not-exported' | 'exported' | 'exported-with-observations' | 'failed';
    qaApproval: 'pending' | 'approved' | 'revoked';
    functionalVerification: 'not-reported' | 'passed' | 'failed';
}
