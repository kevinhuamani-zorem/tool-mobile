export {};

interface EmbeddedInspectorElementUsed {
    selector: string;
    strategy: string;
    tag?: string;
    selectorCandidates: Array<{
        candidateId: string;
        selector: string;
        inspectorStrategy: string;
        locatorType: string;
        locatorValue: string;
        priority: number;
        stability: 'stable' | 'contextual' | 'structural' | 'manual';
        sourceReason: string;
        primary: boolean;
        verification: {
            protocolVersion: 3;
            verifiedAt: string;
            matchCount: 1;
            sameElement: true;
        };
    }>;
    selectorCandidateToken: string;
    validationWarnings: string[];
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
            clearInspectorCandidates(): Promise<{ success: boolean }>;
        };
    }
}
