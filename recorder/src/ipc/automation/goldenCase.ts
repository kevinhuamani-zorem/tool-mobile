import fs from 'fs';
import os from 'os';
import path from 'path';
import { projectPaths } from '../../../../core/workspace';
import {
    AutomationScenario,
    AutomationHistoryStore,
    AutomationValidation,
    GeneratedFileRegistry,
    GenerationPlan,
    acceptedGoldenFiles,
    createAutomationApplicationReceipt,
    goldenDatasetRoot,
    saveGoldenCase,
    GoldenCaseManifest,
    GoldenExecutionStatus,
} from '../../../../core/automation';
import { ReuseAnalyzer } from '../../../../core/indexing';
import { AutomationResponseValidator } from '../../../../core/validation';
import { normalizeFeatureScope, readJsonUtf8, writeJsonUtf8, writeUtf8FileAtomic } from '../../../../core/shared';

export interface SaveGoldenCaseRequest {
    /** Grabación ya aplicada en otra sesión; sin él se usa el paquete activo. */
    recordingId?: string;
    squad?: string;
    executed?: GoldenExecutionStatus;
    notes?: string;
    /** Contenido del editor de la revisión, indexado por ruta absoluta o relativa al framework. */
    reviewedContents?: Record<string, string>;
}

export interface SaveGoldenCaseDependencies {
    packageDirectory: string;
    frameworkRoot: string;
    reuseAnalyzer: ReuseAnalyzer;
    automationResponseValidator: AutomationResponseValidator;
    generatedFileRegistry: GeneratedFileRegistry;
}

export interface SaveGoldenCaseResult {
    directory: string;
    manifest: GoldenCaseManifest;
    /** Capas que el QA corrigió y que se escribieron también en el framework. */
    appliedEdits: string[];
}

class GoldenValidationError extends Error {
    constructor(readonly validation: AutomationValidation) {
        super(
            'La corrección no pasa la validación: ' +
            validation.errors.map(error => error.message).join(' | '),
        );
        this.name = 'GoldenValidationError';
    }
}

/**
 * Guarda el caso aplicado como referencia. Si el QA corrigió archivos (en el
 * editor de la revisión o en el framework tras ejecutar el caso), lo aceptado
 * es esa versión: se revalida, se escribe en el framework cuando viene del
 * editor, y el recibo y el registro de archivos generados se actualizan para
 * que una corrección posterior no la tome por una edición ajena.
 */
export function saveGoldenCaseFromPackage(
    deps: SaveGoldenCaseDependencies,
    request: SaveGoldenCaseRequest,
): SaveGoldenCaseResult {
    const { packageDirectory, frameworkRoot, reuseAnalyzer, automationResponseValidator, generatedFileRegistry } = deps;
    const scenario = readJsonUtf8<AutomationScenario>(path.join(packageDirectory, 'scenario.json'));
    const effectiveFile = path.join(packageDirectory, 'effective-generation-plan.json');
    const plan = readJsonUtf8<GenerationPlan>(
        fs.existsSync(effectiveFile) ? effectiveFile : path.join(packageDirectory, 'generation-plan.json'),
    );
    const accepted = acceptedGoldenFiles(packageDirectory, frameworkRoot, request.reviewedContents || {});

    let validation: AutomationValidation;
    let validationSource: 'apply' | 'golden' = 'apply';
    const appliedValidation = path.join(packageDirectory, 'validation.json');
    if (!accepted.edited && fs.existsSync(appliedValidation)) {
        validation = readJsonUtf8<AutomationValidation>(appliedValidation);
    } else {
        validation = automationResponseValidator.validate(scenario, plan, accepted.response);
        validationSource = 'golden';
        if (!validation.valid) throw new GoldenValidationError(validation);
    }

    // Lo corregido en el editor se lleva al framework; lo corregido en el
    // framework ya esta ahi. En ambos casos el recibo y el registro deben
    // describir los bytes que quedan en disco.
    const history = new AutomationHistoryStore(packageDirectory);
    history.ensureRevision(scenario.recordingId, scenario.request?.caseId);
    const appliedEdits: string[] = [];
    if (accepted.edited) {
        history.checkpoint('before-golden-qa-edit');
        history.beginRevision({ recordingId: scenario.recordingId, caseId: scenario.request?.caseId, source: 'qa-edit' }, [
            { name: 'agent-response.json', content: JSON.stringify(accepted.response, null, 2) + '\n' },
        ]);
        for (const file of accepted.response.files) {
            if (!accepted.editedLayers.includes(file.layer)) continue;
            const absolute = path.join(frameworkRoot, file.path);
            const current = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf-8') : undefined;
            if (current !== file.content) {
                writeUtf8FileAtomic(absolute, file.content);
                appliedEdits.push(file.layer);
            }
        }
        const receipt = createAutomationApplicationReceipt(frameworkRoot, scenario, plan, accepted.response, history.identity());
        writeJsonUtf8(path.join(packageDirectory, 'application-receipt.json'), receipt);
        writeJsonUtf8(path.join(packageDirectory, 'agent-response.json'), accepted.response);
        writeJsonUtf8(appliedValidation, validation);
        generatedFileRegistry.register(
            automationResponseValidator.toPreview(accepted.response),
            scenario.squad,
            plan.files,
        );
    }

    const catalog = reuseAnalyzer.getCatalog(
        scenario.squad,
        scenario.platform,
        normalizeFeatureScope(scenario.request?.featureScope),
    );
    const saved = saveGoldenCase({
        root: goldenDatasetRoot(projectPaths),
        packageDirectory,
        frameworkRoot,
        catalog,
        accepted,
        validation,
        validationSource,
        executed: request.executed || 'not-run',
        notes: request.notes,
        savedBy: os.userInfo().username,
    });
    history.capture('golden-manifest.json', JSON.stringify(saved.manifest, null, 2) + '\n', 'qa', 'legacy-golden-saved');
    return { ...saved, appliedEdits };
}
