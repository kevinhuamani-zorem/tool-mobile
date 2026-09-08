import type { GoldenReviewRequest } from '../../src/goldenContracts';
import type { FrameworkRecoveryRequest, FrameworkRecoveryPreview, FrameworkRecoverySaved } from '../../src/frameworkRecoveryContracts';
import type { AutomationExportResult } from '../../src/automationExportContracts';
export {};

interface EmbeddedInspectorElementUsed {
    selector: string;
    strategy: string;
    tag?: string;
    validationWarnings: string[];
    selectorCandidateToken: string;
}

declare global {
    interface Window {
        api: Record<string, (...args: any[]) => any> & {
            openInspector(): Promise<{
                success: boolean;
                mode?: 'legacy' | 'embedded';
                warning?: string;
                error?: string;
            }>;
            onInspectorConnected(listener: () => void): () => void;
            onInspectorError(listener: (message: string) => void): () => void;
            onInspectorElementUsed(
                listener: (elementUsed: EmbeddedInspectorElementUsed) => void,
            ): () => void;
            onAutomationProgress(
                listener: (progress: {
                    stage: string;
                    message: string;
                    completed: number;
                    total: number;
                    detail?: string;
                    error?: string;
                    agentName?: string;
                    roleState?: 'pending' | 'running' | 'repairing' | 'completed' | 'failed';
                    execution?: 'agent' | 'cache' | 'deterministic';
                    contextBytes?: number;
                    evidenceBytes?: number;
                    budgetWarnings?: string[];
                    timedOut?: boolean;
                    assignedLayers?: string[];
                }) => void,
            ): () => void;
            getAutomationQaDecisions(): Promise<any>;
            resolveAutomationQaDecisions(input: any): Promise<any>;
            getAutomationModelUsage(): Promise<{ requestedModel: string; actualModels: string[] } | null>;
            launchAutomationAgent(input?: { mode?: 'manual' | 'automatic'; autorun?: boolean; inheritDesignReview?: boolean; model?: string }): Promise<any>;
            generateAutomationResponse(previewToken: string, reviewedContents?: Record<string, string>): Promise<AutomationExportResult>;
            revalidateAutomationResponse(reviewedContents: Record<string, string>): Promise<any>;
            previewFrameworkRecovery(input?: FrameworkRecoveryRequest): Promise<{ success: boolean; error?: string; preview?: FrameworkRecoveryPreview }>;
            saveFrameworkRecovery(token: string): Promise<{ success: boolean; error?: string; result?: FrameworkRecoverySaved }>;
            previewGoldenCase(input: GoldenReviewRequest): Promise<any>;
            listGoldenCases(): Promise<any>;
            rebuildGoldenIndex(): Promise<any>;
            revokeGoldenCase(input: { goldenId: string; versionHash: string }): Promise<any>;
            saveGoldenCase(input: GoldenReviewRequest): Promise<any>;
        };
    }
}
