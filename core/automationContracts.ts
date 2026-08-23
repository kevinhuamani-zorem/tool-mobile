import { GenerationRequest, MobilePlatform } from './fwkMobileGenerator';
import { RecordedStep } from './models';

export const AUTOMATION_SCHEMA_VERSION = 1;
export const AUTOMATION_PIPELINE_VERSION = '1.0.0';

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

export type ResolutionKind = 'reuse' | 'create' | 'builtin' | 'unresolved';

export interface ActionResolution {
    sequence: number;
    action: RecordedStep['action'];
    intent: string;
    resolution: ResolutionKind;
    locatorName?: string;
    selector?: string;
    source?: {
        file: string;
        module: string;
        scope: 'squad' | 'home';
    };
    confidence: number;
    gapId?: string;
    reason: string;
    /** Método del módulo target que ya cubre esta intención, si lo hay. */
    existingMethod?: {
        name: string;
        signature: string;
        file: string;
        locatorKeys: string[];
        score: number;
    };
}

export interface PlannedFile {
    layer: 'feature' | 'steps' | 'screen' | 'locators';
    path: string;
    operation: 'create' | 'update';
    /** Hash del archivo conocido al preparar el plan; protege updates contra cambios externos. */
    baseHash?: string;
}

export interface RepetitionProposal {
    startSequence: number;
    length: number;
    repetitions: number;
    varyingOffset: number;
    values: string[];
    parameter: string;
    sequences: number[][];
}

export interface GenerationPlan {
    schemaVersion: number;
    pipelineVersion: string;
    planId: string;
    recordingId: string;
    fingerprint: string;
    deterministicCoverage: number;
    status: 'deterministic' | 'needs-agent' | 'memory-hit' | 'regeneration';
    resolutions: ActionResolution[];
    files: PlannedFile[];
    unresolvedGapIds: string[];
    existingCase?: ExistingAutomationCandidate;
    /** Ciclo repetido detectado; el QA decide si se convierte en Examples. */
    repetition?: RepetitionProposal;
    reuseTarget?: {
        reason: string;
        score: number;
        steps?: string;
        screen?: string;
        locators?: string;
    };
    budgets: {
        maxDurationMs: number;
        maxContextBytes: number;
        maxRepairAttempts: number;
    };
}

export interface ExistingAutomationCandidate {
    feature: string;
    scenario: string;
    caseId?: string;
    score: number;
    selectorCoverage: number;
    paths: {
        feature: string;
        steps: string;
        screen: string;
        locators: string;
    };
}

export interface FrameworkReuseCandidate {
    feature: string;
    scenario: string;
    caseId?: string;
    file: string;
    score: number;
    selectorCoverage: number;
    matchedSteps: string[];
    paths?: ExistingAutomationCandidate['paths'];
    relatedPaths?: {
        steps: string[];
        screens: string[];
        locators: string[];
    };
}

export interface ResolvedContext {
    schemaVersion: number;
    recordingId: string;
    planId: string;
    reusedLocators: ActionResolution[];
    frameworkAwareness?: {
        candidates: FrameworkReuseCandidate[];
        exactStepDefinitions: Array<{
            expression: string;
            file: string;
            scope: 'squad' | 'commons';
        }>;
        selectorCollisions: Array<{
            sequence: number;
            locatorName: string;
            file: string;
            module: string;
            scope: 'squad' | 'home';
        }>;
        decision: 'create-new' | 'reuse-existing' | 'extend-existing';
        reuseTarget?: GenerationPlan['reuseTarget'];
    };
    frameworkContract: {
        stepsOnlyOrchestrate: true;
        screenExtendsBaseScreen: true;
        sharedLocatorNameAcrossPlatforms: true;
        allowedScopes: ['squad', 'home'];
        /**
         * [visual-recorder] Anclajes resueltos del framework en esta grabacion.
         * Viajan como dato para que el agente use la ruta real y no una
         * convencion memorizada, y para que un movimiento del framework se vea
         * en el paquete en vez de descubrirse al ejecutar wdio.
         */
        baseScreenClass: string;
        baseScreenImport: string;
        locatorFactoryImport: string;
        typeLocatorImport: string;
    };
}

export interface UnresolvedGap {
    id: string;
    sequence?: number;
    type: 'missing-assertion' | 'missing-selector' | 'missing-intent' | 'test-data' | 'test-input' | 'semantic-naming' | 'verification-semantics' | 'repetition' | 'refinement';
    description: string;
    requiredOutput: string;
    /**
     * [visual-recorder] Gap bloqueante: no es algo que el agente pueda resolver
     * con mas contexto, sino un defecto de la grabacion que solo el QA puede
     * corregir. El paquete no se arma y el agente nunca arranca.
     */
    blocking?: boolean;
}

export interface UnresolvedContext {
    schemaVersion: number;
    recordingId: string;
    planId: string;
    gaps: UnresolvedGap[];
}

export interface AgentGeneratedFile {
    layer: PlannedFile['layer'];
    path: string;
    content: string;
}

export interface AutomationAgentResponse {
    schemaVersion: number;
    recordingId: string;
    planId: string;
    resolutions: Array<{ gapId: string; decision: string }>;
    actionTrace: Array<{
        sequence: number;
        gherkinStep: string;
        screenMethod?: string;
        locatorName?: string;
    }>;
    files: AgentGeneratedFile[];
    assumptions?: string[];
}

export interface AutomationValidation {
    valid: boolean;
    qualityScore: number;
    errors: Array<{ code: string; message: string; file?: string }>;
    warnings: string[];
    repairContext?: {
        attempt: number;
        errors: Array<{ code: string; message: string; file?: string }>;
        affectedFiles: string[];
    };
}

export interface AutomationPackageResult {
    packageDirectory: string;
    recordingId: string;
    planId: string;
    status: GenerationPlan['status'];
    deterministicCoverage: number;
    unresolvedGaps: number;
    memoryVersion?: number;
    agentRequired: boolean;
    responseAvailable: boolean;
    validation?: AutomationValidation;
    /** Bytes del contexto mínimo y aviso si supera el objetivo (no bloquea). */
    contextBytes?: number;
    contextWarning?: string;
    /**
     * [visual-recorder] Anclajes del framework (BaseScreen, LocatorFactory,
     * TypeLocator) que no se pudieron resolver y quedaron en su valor por
     * convención. Si aparecen, el import generado puede no existir.
     */
    frameworkWarnings?: string[];
}
