import path from 'path';
import fs from 'fs';
import { FrameworkRecoveryService, FrameworkRecoveryRequest } from '../../../../core/automation';
import { projectPaths } from '../../../../core/workspace';
import type { AutomationHandlersContext } from '../automationHandlers';

/** No device/session or GitHub connection is needed to recover local code. */
export class FrameworkRecoveryController {
    private pending?: { service: FrameworkRecoveryService; packageDirectory: string; root: string; squad: string; environment: string };
    constructor(private readonly deps: Pick<AutomationHandlersContext, 'state' | 'recordingCoverageAnalyzer'>) {}
    prepare(input: FrameworkRecoveryRequest = {}) {
        this.pending = undefined;
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Solicitud de recuperación inválida.');
        for (const key of ['recordingId', 'squad', 'prUrl', 'notes'] as const) if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`Campo inválido: ${key}`);
        for (const key of ['paths', 'symbols'] as const) if (input[key] !== undefined && (!input[key] || typeof input[key] !== 'object' || Array.isArray(input[key]))) throw new Error(`Asociaciones inválidas: ${key}`);
        const { state, recordingCoverageAnalyzer } = this.deps;
        const squad = input.squad || state.activeSquad;
        const packageDirectory = input.recordingId ? path.join(recordingCoverageAnalyzer.findRecordingDirectory(squad, input.recordingId, state.activeEnvironment), 'generation/automation')
            : state.activeAutomationPackage;
        if (!packageDirectory) throw new Error('Selecciona un caso que ya haya sido exportado.');
        const relative = path.relative(fs.realpathSync(projectPaths.recordings), fs.realpathSync(packageDirectory));
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Paquete fuera de recordings.');
        const service = new FrameworkRecoveryService(projectPaths.frameworkRoot);
        const preview = service.prepare(packageDirectory, input);
        this.pending = { service, packageDirectory, root: projectPaths.frameworkRoot, squad: state.activeSquad, environment: state.activeEnvironment };
        return { success: true, preview };
    }
    save(token: string) {
        const pending = this.pending;
        const { state } = this.deps;
        if (!pending || pending.root !== projectPaths.frameworkRoot || pending.squad !== state.activeSquad || pending.environment !== state.activeEnvironment)
            throw new Error('El framework o contexto cambió. Recupera nuevamente.');
        const result = pending.service.save(pending.packageDirectory, token);
        this.pending = undefined;
        if (state.activeAutomationPackage === pending.packageDirectory) state.automationPreview = null;
        return { success: true, result };
    }
}
