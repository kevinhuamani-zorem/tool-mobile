export {};

interface EmbeddedInspectorElementUsed {
    selector: string;
    strategy: string;
    tag?: string;
    attributes: Record<string, string>;
    screenshot?: string;
    source?: string;
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
        };
    }
}
