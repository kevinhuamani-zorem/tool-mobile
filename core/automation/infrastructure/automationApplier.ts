import fs from 'fs';
import path from 'path';
import {
    AutomationAgentResponse,
    AutomationScenario,
    GenerationPlan,
} from '../contracts';
import { GeneratedPreview, FwkMobileGenerator } from '../../generation';
import { frameworkLocator } from '../../indexing';
import { projectPaths } from '../../workspace';
import {
    AutomationPatchWriter,
    PatchOutcome,
    featureAdditions,
    locatorAdditions,
    screenAdditions,
    stepsAdditions,
} from './automationPatchWriter';
import { GeneratedFileRegistry, ManagedFileAssessment } from './generatedFileRegistry';

export interface AdditiveUpdateResult {
    outcomes: PatchOutcome[];
    /** Rutas absolutas ya atendidas por el patch; la escritura completa las omite. */
    absolute: Set<string>;
}

export interface ApplyAutomationResult {
    managed: ManagedFileAssessment;
    patched: AdditiveUpdateResult;
    generated: GeneratedPreview;
}

/**
 * Aplica al framework una respuesta ya validada.
 *
 * Vivia dentro del handler IPC `generate-automation-response`, donde ni los
 * tests ni la CLI podian ejercerlo y el helper de pruebas lo duplicaba. Aqui
 * es el unico camino: las capas `update` se amplian con un patch aditivo (el
 * archivo puede ser ajeno y solo recibe los simbolos nuevos), las `create` se
 * escriben completas y el registro anota lo que el recorder creo o amplio.
 * No valida: quien llama ya paso por `AutomationResponseValidator`.
 */
export class AutomationApplier {
    constructor(
        private readonly patchWriter = new AutomationPatchWriter(),
        private readonly generator = new FwkMobileGenerator(),
        private readonly registry = new GeneratedFileRegistry(),
        private readonly frameworkRoot = projectPaths.frameworkRoot,
    ) {}

    /**
     * Convierte las capas planificadas como `update` en un patch aditivo.
     *
     * El contenido propuesto trae el archivo completo; se compara contra el que
     * esta en disco y solo se insertan los simbolos nuevos con su comentario de
     * trazabilidad. Los `completions` rellenan claves existentes con el valor
     * que el QA verifico en la accion, nunca con uno escrito por el agente.
     */
    applyAdditiveUpdates(
        scenario: AutomationScenario,
        plan: GenerationPlan,
        response: AutomationAgentResponse,
        updates: Map<string, string>,
    ): AdditiveUpdateResult {
        const root = this.frameworkRoot;
        const absolute = new Set<string>();
        const contentOf = (layer: string) => response.files.find(file => file.layer === layer)?.content;
        const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf-8');
        const exists = (relative: string) => fs.existsSync(path.join(root, relative));
        const createdAt = new Date().toISOString();
        const input: any = { recordingId: scenario.recordingId, createdAt };

        const completionsByFile = new Map<
            string,
            { name: string; platform: 'android' | 'ios'; block: string; value: string }[]
        >();
        for (const completion of response.completions || []) {
            const targets = plan.resolutions
                .find(resolution => resolution.sequence === completion.sequence)
                ?.completionTargets?.filter(candidate =>
                    candidate.file === completion.file
                    && candidate.name === completion.name
                    && candidate.platform === completion.platform
                    && candidate.block.toLowerCase().endsWith(completion.platform)
                ) || [];
            const target = targets.length === 1 ? targets[0] : undefined;
            if (!target) {
                throw new Error(`Completion no autorizado para ${completion.file}#${completion.name}.`);
            }
            const action = scenario.actions.find(step => step.sequence === completion.sequence);
            const value = action?.locatorValue
                || (action?.selector ? frameworkLocator(action.selector, completion.platform).value : '');
            if (!value) {
                throw new Error(`La acción ${completion.sequence} no contiene un locator primario aplicable.`);
            }
            const bucket = completionsByFile.get(completion.file) || [];
            bucket.push({ name: completion.name, platform: completion.platform, block: target.block, value });
            completionsByFile.set(completion.file, bucket);
        }

        const locatorsPath = updates.get('locators');
        const locatorsProposed = contentOf('locators');
        if (locatorsPath && locatorsProposed && exists(locatorsPath)) {
            input.locators = {
                file: locatorsPath,
                additions: locatorAdditions(read(locatorsPath), locatorsProposed),
                completions: completionsByFile.get(locatorsPath) || [],
            };
            completionsByFile.delete(locatorsPath);
        }
        const screenPath = updates.get('screen');
        const screenProposed = contentOf('screen');
        if (screenPath && screenProposed && exists(screenPath)) {
            input.screen = { file: screenPath, ...screenAdditions(read(screenPath), screenProposed) };
        }
        const stepsPath = updates.get('steps');
        const stepsProposed = contentOf('steps');
        if (stepsPath && stepsProposed && exists(stepsPath)) {
            const { definitions, imports } = stepsAdditions(read(stepsPath), stepsProposed);
            input.steps = { file: stepsPath, definitions, screenImport: imports[0] };
        }
        const featurePath = updates.get('feature');
        const featureProposed = contentOf('feature');
        if (featurePath && featureProposed && exists(featurePath)) {
            const scenarioBlock = featureAdditions(read(featurePath), featureProposed);
            if (scenarioBlock) input.feature = { file: featurePath, scenario: scenarioBlock };
        }

        const outcomes = this.patchWriter.apply(input, root);
        // Un relleno puede caer en un modulo que este caso no escribe (grabar
        // en Android sobre un modulo hecho en iOS): va en su propia pasada.
        for (const [file, completions] of completionsByFile) {
            if (!exists(file)) {
                throw new Error(`No existe el archivo externo autorizado para completion: ${file}`);
            }
            outcomes.push(...this.patchWriter.apply(
                { recordingId: scenario.recordingId, createdAt, locators: { file, additions: [], completions } },
                root,
            ));
        }
        for (const outcome of outcomes) absolute.add(path.join(root, outcome.file));
        return { outcomes, absolute };
    }

    /**
     * Escritura completa de una respuesta validada: evalua el registro,
     * amplia las capas `update`, escribe las `create` y registra todo.
     * Lanza si algun archivo existente no esta administrado por el recorder.
     */
    apply(
        scenario: AutomationScenario,
        plan: GenerationPlan,
        response: AutomationAgentResponse,
        preview: GeneratedPreview,
    ): ApplyAutomationResult {
        const managed = this.registry.assess(preview, scenario.squad, plan.files);
        if (managed.conflicts.length) {
            throw new Error(`Archivos existentes no administrados: ${managed.conflicts.join(', ')}`);
        }
        const updates = new Map(plan.files
            .filter(file => file.operation === 'update')
            .map(file => [file.layer, file.path]));
        const patched = this.applyAdditiveUpdates(scenario, plan, response, updates);
        const createOnly: GeneratedPreview = {
            ...preview,
            files: preview.files.filter(file => !patched.absolute.has(file)),
        };
        const generated = this.generator.writePreview(
            createOnly,
            new Set([...managed.writable].filter(file => !patched.absolute.has(file))),
        );
        this.registry.register(generated, scenario.squad, plan.files);
        for (const outcome of patched.outcomes) {
            if (!outcome.added.length) continue;
            this.registry.registerPatch(
                path.join(this.frameworkRoot, outcome.file),
                scenario.squad,
                scenario.recordingId,
                outcome.added,
            );
        }
        return { managed, patched, generated };
    }
}
