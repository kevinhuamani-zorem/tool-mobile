/**
 * API pública de `automation`: el vocabulario puro de `contracts` (el único
 * subpath que `validation` y `generation` pueden importar, ver
 * `scripts/check-architecture.js`) más el resto del módulo — dominio,
 * aplicación, infraestructura y puertos — para el resto de consumidores
 * (composition roots, otros módulos no restringidos, pruebas).
 */
export * from './contracts';

export * from './domain/agentQueryContracts';
export * from './domain/agentResponseEnglishNormalizer';
export * from './domain/agentResponsePlatformTagEnforcer';
export * from './domain/automationContextProjections';
export * from './domain/automationPackageProvenance';
export * from './domain/automationScenarioPackage';
export * from './domain/deterministicQueryPlanner';
export * from './domain/elementIdentity';
export * from './domain/gapResolutionContracts';
export * from './domain/qaRoastContracts';
export * from './domain/layeredGenerationContracts';
export * from './domain/uiTextQualityObservations';
export * from './domain/verifiedSelectorCandidates';

export * from './application/automationMemory';
export * from './application/gapExecutionPlanner';

export * from './infrastructure/agentContextEnvelope';
export * from './infrastructure/agentOrchestrator';
export * from './infrastructure/agentRunStore';
export * from './infrastructure/agentRuntimeGuards';
export * from './infrastructure/automationAgentLauncher';
export * from './infrastructure/automationApplicationReceipt';
export * from './infrastructure/automationCorrectionBaseline';
export * from './infrastructure/automationPackageBuilder';
export * from './infrastructure/automationPatchWriter';
export * from './infrastructure/automationRecordingStore';
export * from './infrastructure/copilotCliAdapter';
export * from './infrastructure/copilotQaRoastGenerator';
export * from './infrastructure/deterministicResolver';
export * from './infrastructure/gapQueryPolicy';
export * from './infrastructure/layeredGenerationOrchestrator';
export * from './infrastructure/generatedFileRegistry';
export * from './infrastructure/visibleCopilotProvider';

export * from './ports/agentProvider';
export * from './ports/qaRoastGenerationService';
export * from './domain/agentModel';
export { CopilotModelEvents } from './infrastructure/copilotModelEvents';
