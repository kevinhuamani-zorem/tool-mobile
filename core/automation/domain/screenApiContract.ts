/** Caller-owned interface: derived from Lorem's code, never from model assertions. */
export interface ScreenApiContract {
    schemaVersion: 1;
    methods: Array<{
        importSource: string;
        method: string;
        arguments: Array<{ position: number; type: string; unresolved: boolean }>;
        returnUsage: 'awaited' | 'ignored' | 'value';
        expectedReturnType: string | null;
        sequences: number[];
    }>;
}
