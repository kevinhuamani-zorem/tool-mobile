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
                    error?: string;
                }) => void,
            ): () => void;
            getAutomationQaDecisions(): Promise<any>;
            resolveAutomationQaDecisions(input: any): Promise<any>;
            launchAutomationAgent(input?: { mode?: 'manual' | 'automatic'; autorun?: boolean; qaRoastMode?: boolean }): Promise<any>;
            revalidateAutomationResponse(reviewedContents: Record<string, string>): Promise<any>;
        };
    }
}
