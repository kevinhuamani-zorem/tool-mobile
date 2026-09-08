export interface GoldenReviewRequest {
    recordingId?: string; squad?: string; source?: 'recovery' | 'review'; legacyId?: string;
    executed?: 'passed' | 'failed' | 'not-run'; notes?: string; reviewedContents?: Record<string, string>;
    token?: string; approved?: boolean; usage?: 'reference' | 'evaluation';
}
