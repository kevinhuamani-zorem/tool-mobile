import type { AgentGeneratedFile } from '../../automation/contracts';

export const DETERMINISTIC_DRAFT_SCHEMA_VERSION = 1;

/**
 * Referencia rápida producida por el recorder antes de invocar agentes.
 *
 * No es una respuesta oficial ni una restricción: cada autor puede corregir su
 * mitad y reutilizar APIs existentes, pero ya no necesita inventar las cuatro
 * capas desde cero para entender la forma esperada del caso.
 */
export interface DeterministicGenerationDraft {
    schemaVersion: typeof DETERMINISTIC_DRAFT_SCHEMA_VERSION;
    recordingId: string;
    planId: string;
    planFingerprint: string;
    files: AgentGeneratedFile[];
    actionTrace: Array<{
        sequence: number;
        gherkinStep: string;
        screenMethod?: string;
        locatorName?: string;
    }>;
    assumptions: string[];
}

