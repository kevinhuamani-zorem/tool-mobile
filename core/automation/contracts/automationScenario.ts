import type { RecordedStep } from './models';
import type { GenerationRequest, MobilePlatform } from './generationRequest';

/**
 * Extraído de `index.ts` para que otros archivos de `automation/contracts`
 * (p. ej. `gherkinContract`, `selectorCandidates`) puedan consumir el tipo
 * sin crear un ciclo `index.ts` <-> archivo hoja.
 */
export interface AutomationScenario {
    schemaVersion: number;
    pipelineVersion: string;
    recordingId: string;
    revision: number;
    fingerprint: string;
    createdAt: string;
    squad: string;
    platform: MobilePlatform;
    environment: string;
    objective: string;
    acceptanceCriteria: string;
    request: GenerationRequest;
    actions: Array<RecordedStep & { sequence: number }>;
}
