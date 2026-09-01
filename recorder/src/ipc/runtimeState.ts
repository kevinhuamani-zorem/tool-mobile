import { BrowserWindow } from 'electron';
import { AppiumDriverManager, MobileStepExecutor, LocatorManager } from '../../../core/mobile-session';
import {
    RecordedStep,
    SelectorCandidate,
    GenerationRequest,
    MobilePlatform,
    AutomationAgentResponse,
    AutomationScenario,
    GenerationPlan,
} from '../../../core/automation';
import { MobileInspector } from '../mobileInspector';
import { EmbeddedInspectorHandshake } from '../embeddedInspectorProtocol';

/**
 * Vista consistente de la propuesta de automatización lista para revisión: el
 * mismo token que autoriza `generate-automation-response` a escribir sobre el
 * framework.
 */
export interface AutomationPreviewState {
    token: string;
    scenario: AutomationScenario;
    plan: GenerationPlan;
    response: AutomationAgentResponse;
}

/** Candidatos de selector ya verificados contra la sesión activa por el Inspector embebido. */
export interface PendingInspectorCandidatesState {
    token: string;
    selector: string;
    candidates: SelectorCandidate[];
}

/**
 * Estado mutable compartido del proceso principal.
 *
 * Antes de esta fase, estos campos eran variables de módulo dentro de
 * `main.ts`; cada familia de handlers IPC leía y escribía directamente sobre
 * ellas. Al extraer los handlers a `recorder/src/ipc/*Handlers.ts`, esas
 * variables necesitan un dueño que no sea ningún módulo de handlers en
 * particular — de lo contrario, dos familias tendrían cada una su propia
 * copia y se desincronizarían.
 *
 * `main.ts` construye una única instancia y la inyecta por referencia en el
 * contexto de cada `register*Handlers`. Ninguna familia crea ni duplica este
 * estado: todas comparten el mismo objeto, igual que compartían las mismas
 * variables de módulo antes de la extracción.
 */
export class RecorderRuntimeState {
    mainWindow: BrowserWindow | null = null;
    embeddedInspectorWindow: BrowserWindow | null = null;
    embeddedInspectorHandshake: EmbeddedInspectorHandshake | null = null;

    /** Apunta al manager activo (local o BrowserStack). */
    activeDm: AppiumDriverManager;
    inspector: MobileInspector | null = null;
    executor: MobileStepExecutor | null = null;
    locatorManager: LocatorManager;

    recordedSteps: RecordedStep[] = [];
    sessionActive = false;
    recordingPlatform: MobilePlatform = 'android';
    activeSquad = 'payment';
    activeEnvironment = '';

    activeAutomationPackage = '';
    automationPreview: AutomationPreviewState | null = null;

    pendingInspectorCandidates: PendingInspectorCandidatesState | null = null;
    inspectorValidationGeneration = 0;

    readonly approvedPreviews = new Map<string, string>();

    constructor(defaultDriverManager: AppiumDriverManager, defaultLocatorManager: LocatorManager) {
        this.activeDm = defaultDriverManager;
        this.locatorManager = defaultLocatorManager;
    }

    /**
     * Adjunta la plataforma de la sesión activa a una solicitud de
     * generación. El análisis de impacto se confirma explícitamente en el
     * paso Gherkin del renderer; preview y generar respetan esa decisión y no
     * vuelven a cambiar silenciosamente un step nuevo por uno reutilizado.
     */
    withPlatform(request: Omit<GenerationRequest, 'platform'>): GenerationRequest {
        return { ...request, platform: this.recordingPlatform };
    }
}
