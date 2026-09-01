export interface GapExecutionInput {
    gapId: string;
    contextBytes: number;
}

export interface GapExecutionSuccess<T> {
    gapId: string;
    ok: true;
    value: T;
}

export interface GapExecutionFailure {
    gapId: string;
    ok: false;
    errorCode: 'GAP_CONTEXT_OVERFLOW';
    message: string;
    contextBytes: number;
    maxContextBytes: number;
}

export type GapExecutionResult<T> = GapExecutionSuccess<T> | GapExecutionFailure;

export interface GapExecutionPlannerOptions {
    parallelism?: number;
}

export class GapExecutionPlanner {
    private readonly parallelism: number;

    constructor(options: GapExecutionPlannerOptions = {}) {
        this.parallelism = Math.max(1, Math.floor(options.parallelism || 3));
    }

    async execute<T>(
        gaps: GapExecutionInput[],
        maxContextBytes: number,
        worker: (gap: GapExecutionInput, index: number) => Promise<T>,
    ): Promise<Array<GapExecutionResult<T>>> {
        if (!gaps.length) return [];
        const results = new Array<GapExecutionResult<T>>(gaps.length);
        let cursor = 0;
        const limit = Math.min(this.parallelism, gaps.length);
        await Promise.all(Array.from({ length: limit }, async () => {
            while (true) {
                const index = cursor;
                cursor += 1;
                if (index >= gaps.length) return;
                const gap = gaps[index];
                if (gap.contextBytes > maxContextBytes) {
                    results[index] = {
                        gapId: gap.gapId,
                        ok: false,
                        errorCode: 'GAP_CONTEXT_OVERFLOW',
                        message: `El contexto de ${gap.gapId} excede ${maxContextBytes} bytes (${gap.contextBytes}).`,
                        contextBytes: gap.contextBytes,
                        maxContextBytes,
                    };
                    continue;
                }
                results[index] = {
                    gapId: gap.gapId,
                    ok: true,
                    value: await worker(gap, index),
                };
            }
        }));
        return results;
    }
}

export function partitionGapsById(gaps: Array<{ id: string }>): string[] {
    return [...new Set(gaps.map(gap => gap.id).filter(Boolean))];
}
