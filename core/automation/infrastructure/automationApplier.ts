import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { writeUtf8FileAtomic } from '../../shared';
import { ReconciliationInput, reconcileFrameworkFile, recoveryGitContext } from './automationReconciliation';
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
    PreparedPatch,
    PreparationDiagnostic,
    discardedScreenChanges,
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
    patches?: PreparedPatch[];
    diagnostics?: PreparationDiagnostic[];
}

export interface PreparedAutomation {
    frameworkRoot: string;
    response: AutomationAgentResponse;
    preview: GeneratedPreview;
    files: Array<{ path: string; before: string | null; content: string }>;
    outcomes: PatchOutcome[];
    /** Non-blocking differences between proposed and safely prepared shared code. */
    diagnostics?: PreparationDiagnostic[];
    digest: string;
    conflicts?: string[];
    checkout?: ReturnType<typeof recoveryGitContext>;
}

function digest(value: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export interface ApplyAutomationResult {
    managed: ManagedFileAssessment;
    patched: AdditiveUpdateResult;
    generated: GeneratedPreview;
}

/**
 * Exporta al framework una propuesta revisada, incluso con observaciones.
 *
 * Vivia dentro del handler IPC `generate-automation-response`, donde ni los
 * tests ni la CLI podian ejercerlo y el helper de pruebas lo duplicaba. Aqui
 * es el unico camino: las capas `update` se amplian con un patch aditivo (el
 * archivo puede ser ajeno y solo recibe los simbolos nuevos), las `create` se
 * escriben completas y el registro anota lo que el recorder creo o amplio.
 * Valida el contrato de escritura; los diagnósticos de calidad no impiden exportar.
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
        prepareOnly = false,
        baselines = new Map<string, string>(),
    ): AdditiveUpdateResult {
        const root = this.frameworkRoot;
        const absolute = new Set<string>();
        const contentOf = (layer: string) => response.files.find(file => file.layer === layer)?.content;
        const read = (relative: string) => baselines.get(relative) ?? fs.readFileSync(path.join(root, relative), 'utf-8');
        const exists = (relative: string) => fs.existsSync(path.join(root, relative));
        const createdAt = scenario.createdAt;
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
            input.steps = { file: stepsPath, definitions, imports };
        }
        const featurePath = updates.get('feature');
        const featureProposed = contentOf('feature');
        if (featurePath && featureProposed && exists(featurePath)) {
            const scenarioBlock = featureAdditions(read(featurePath), featureProposed);
            if (scenarioBlock) input.feature = { file: featurePath, scenario: scenarioBlock };
        }

        const patches = this.patchWriter.prepare(input, root, baselines);
        // Un relleno puede caer en un modulo que este caso no escribe (grabar
        // en Android sobre un modulo hecho en iOS): va en su propia pasada.
        for (const [file, completions] of completionsByFile) {
            if (!exists(file)) {
                throw new Error(`No existe el archivo externo autorizado para completion: ${file}`);
            }
            patches.push(...this.patchWriter.prepare(
                { recordingId: scenario.recordingId, createdAt, locators: { file, additions: [], completions } },
                root, baselines,
            ));
        }
        const diagnostics = screenPath && screenProposed && exists(screenPath)
            ? discardedScreenChanges(screenPath, read(screenPath), screenProposed,
                patches.find(patch => patch.file === screenPath)?.content ?? read(screenPath))
            : [];
        if (!prepareOnly) {
            const written: PreparedPatch[] = [];
            try {
                for (const patch of patches) {
                    if (patch.before === patch.content) continue;
                    writeUtf8FileAtomic(path.join(root, patch.file), patch.content);
                    written.push(patch);
                }
            } catch (error) {
                for (const patch of written.reverse()) writeUtf8FileAtomic(path.join(root, patch.file), patch.before);
                throw error;
            }
        }
        const outcomes = patches.map(({ before, content, ...outcome }) => outcome);
        for (const outcome of outcomes) absolute.add(path.join(root, outcome.file));
        return { outcomes, absolute, patches, diagnostics };
    }

    /** Resolves every final byte before review; no target or registry writes. */
    prepare(scenario: AutomationScenario, plan: GenerationPlan, response: AutomationAgentResponse,
        preview: GeneratedPreview, baselines = new Map<string, string>(), reconciliation?: ReconciliationInput): PreparedAutomation {
        if (!Array.isArray(response.files) || !response.files.length || response.files.length > 4) {
            throw new Error('No hay archivos exportables o el conjunto de capas es inválido.');
        }
        if (response.recordingId !== scenario.recordingId || (plan.recordingId && plan.recordingId !== scenario.recordingId) || (plan.planId && response.planId !== plan.planId)) {
            throw new Error('La propuesta pertenece a otra grabación o plan.');
        }
        const seen = new Set<string>();
        for (const file of response.files) {
            const planned = plan.files.find(item => item.layer === file.layer && item.path === file.path);
            if (!planned || !['create', 'update'].includes(planned.operation) || seen.has(file.layer)
                || typeof file.content !== 'string') throw new Error(`Archivo fuera del plan o capa duplicada: ${file.path}`);
            seen.add(file.layer);
            const target = this.target(file.path);
            if (planned.operation === 'update' && !fs.existsSync(target)) throw new Error(`El baseline fue eliminado: ${file.path}`);
        }
        if (response.completions !== undefined && !Array.isArray(response.completions)) throw new Error('Completions inválidos.');
        for (const file of response.completions || []) this.target(file.file);
        if (plan.reconciliation) {
            if (!reconciliation || reconciliation.baseline.planId !== plan.planId || reconciliation.baseline.revisionId !== plan.reconciliation.revisionId) throw new Error('Falta el baseline QA autorizado.');
            return this.prepareReconciled(scenario, plan, response, preview, reconciliation);
        }
        const updates = new Map(plan.files.filter(file => file.operation === 'update').map(file => [file.layer, file.path]));
        const patched = this.applyAdditiveUpdates(scenario, plan, response, updates, true, baselines);
        const byPath = new Map(patched.patches!.map(file => [file.file, file]));
        const finalResponse = { ...response, files: response.files.map(file => ({
            ...file, content: byPath.get(file.path)?.content
                ?? (updates.has(file.layer) ? baselines.get(file.path) ?? fs.readFileSync(this.target(file.path), 'utf8') : file.content),
        })) };
        const files = finalResponse.files.map(file => ({
            path: file.path, content: file.content,
            before: fs.existsSync(this.target(file.path)) ? fs.readFileSync(this.target(file.path), 'utf8') : null,
        }));
        for (const patch of patched.patches!) {
            if (!files.some(file => file.path === patch.file)) files.push({ path: patch.file, before: patch.before, content: patch.content });
        }
        const content = (layer: string) => finalResponse.files.find(file => file.layer === layer)?.content;
        const finalPreview = { ...preview, featureContent: content('feature') || '', stepContent: content('steps'),
            screenContent: content('screen'), locatorContent: content('locators'),
            beforeContents: Object.fromEntries(files.map(file => [this.target(file.path), file.before])),
            additionalFiles: files.filter(file => !response.files.some(item => item.path === file.path))
                .map(file => ({ path: this.target(file.path), content: file.content, before: file.before || '' })),
        };
        return { frameworkRoot: this.frameworkRoot, response: finalResponse, preview: finalPreview, files,
            outcomes: patched.outcomes, diagnostics: patched.diagnostics,
            digest: digest({ files, response: finalResponse }) };
    }

    private prepareReconciled(scenario: AutomationScenario, plan: GenerationPlan, response: AutomationAgentResponse,
        preview: GeneratedPreview, input: ReconciliationInput): PreparedAutomation {
        const conflicts: string[] = [];
        const files = response.files.map(file => {
            const target = this.target(file.path);
            const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
            const merged = reconcileFrameworkFile(file, before, input);
            if (merged.conflict) conflicts.push(`${file.path}: conflicto entre propuesta y framework. Resuelve los marcadores y revalida.`);
            return { path: file.path, before, content: merged.content };
        });
        const finalResponse = { ...response, files: response.files.map(file => ({ ...file, content: files.find(item => item.path === file.path)!.content })) };
        const finalPreview = { ...preview,
            featureContent: finalResponse.files.find(file => file.layer === 'feature')?.content || '',
            stepContent: finalResponse.files.find(file => file.layer === 'steps')?.content,
            screenContent: finalResponse.files.find(file => file.layer === 'screen')?.content,
            locatorContent: finalResponse.files.find(file => file.layer === 'locators')?.content,
            beforeContents: Object.fromEntries(files.map(file => [this.target(file.path), file.before])),
        };
        // Completion targets remain confined and transactional, including external modules.
        const patches = this.applyAdditiveUpdates(scenario, plan, { ...finalResponse, files: [] }, new Map(), true,
            new Map(files.map(file => [file.path, file.content])));
        for (const patch of patches.patches || []) {
            const existing = files.find(file => file.path === patch.file);
            if (existing) {
                existing.content = patch.content;
                finalResponse.files.find(file => file.path === patch.file)!.content = patch.content;
            } else files.push({ path: patch.file, before: fs.readFileSync(this.target(patch.file), 'utf8'), content: patch.content });
        }
        for (const [layer, key] of [['feature', 'featureContent'], ['steps', 'stepContent'], ['screen', 'screenContent'], ['locators', 'locatorContent']] as const)
            (finalPreview as any)[key] = finalResponse.files.find(file => file.layer === layer)?.content;
        finalPreview.additionalFiles = files.filter(file => !response.files.some(item => item.path === file.path))
            .map(file => ({ path: this.target(file.path), content: file.content, before: file.before || '' }));
        const checkout = recoveryGitContext(this.frameworkRoot);
        return { frameworkRoot: this.frameworkRoot, response: finalResponse, preview: finalPreview, files,
            outcomes: patches.outcomes, conflicts, checkout, digest: digest({ files, response: finalResponse, conflicts, checkout }) };
    }

    private target(relative: string): string {
        if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Ruta de aplicación inválida.');
        const root = path.resolve(this.frameworkRoot);
        const target = path.resolve(root, relative);
        const inside = path.relative(root, target);
        if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw new Error(`Ruta fuera del framework: ${relative}`);
        let cursor = target;
        while (cursor !== root) {
            try {
                if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlink no permitido: ${relative}`);
            } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
            cursor = path.dirname(cursor);
        }
        return target;
    }

    requireUnchanged(prepared: PreparedAutomation): void {
        if (prepared.frameworkRoot !== this.frameworkRoot || prepared.digest !== digest({ files: prepared.files, response: prepared.response, conflicts: prepared.conflicts, checkout: prepared.checkout })) {
            throw new Error('El resultado preparado cambió. Reimporta y revisa nuevamente.');
        }
        if (prepared.checkout) {
            const current = recoveryGitContext(this.frameworkRoot);
            for (const key of ['repository', 'branch', 'commit'] as const) if (prepared.checkout[key] !== current[key]) throw new Error('El checkout cambió después del preview. Reimporta y revisa nuevamente.');
        }
        for (const file of prepared.files) {
            const target = this.target(file.path);
            const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
            if (current !== file.before) throw new Error(`El archivo cambió después del preview: ${file.path}. Reimporta antes de aplicar.`);
        }
    }

    /** One recoverable transaction for all target files, registry and caller metadata. */
    commit(prepared: PreparedAutomation, scenario: AutomationScenario, plan: GenerationPlan,
        finalize: () => void = () => {}, metadataFiles: string[] = []): ApplyAutomationResult {
        this.requireUnchanged(prepared);
        if (prepared.conflicts?.length) throw new Error(prepared.conflicts.join(' | '));
        const managed = this.registry.assess(prepared.preview, scenario.squad, plan.files);
        if (managed.conflicts.length) throw new Error(`Archivos existentes no administrados: ${managed.conflicts.join(', ')}`);
        const metadata = [...new Set([this.registry.storagePath(), ...metadataFiles])].map(file => ({
            path: file, before: fs.existsSync(file) ? fs.readFileSync(file) : null,
        }));
        const written: PreparedAutomation['files'] = [];
        try {
            this.requireUnchanged(prepared);
            for (const file of prepared.files) {
                if (file.content === file.before) continue;
                this.writeTarget(this.target(file.path), file.content);
                written.push(file);
            }
            this.registry.register(prepared.preview, scenario.squad, plan.files);
            for (const outcome of prepared.outcomes) if (outcome.added.length) {
                this.registry.registerPatch(this.target(outcome.file), scenario.squad, scenario.recordingId, outcome.added);
            }
            finalize();
        } catch (error) {
            for (const file of written.reverse()) {
                const target = this.target(file.path);
                if (file.before === null) fs.unlinkSync(target);
                else fs.writeFileSync(target, file.before, 'utf8');
            }
            for (const file of metadata) {
                if (file.before === null) { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); }
                else fs.writeFileSync(file.path, file.before);
            }
            throw error;
        }
        return { managed, generated: prepared.preview, patched: { outcomes: prepared.outcomes,
            diagnostics: prepared.diagnostics,
            absolute: new Set(prepared.outcomes.map(item => this.target(item.file))) } };
    }

    protected writeTarget(file: string, content: string): void {
        // Content is already prepared/validated. Do not normalize it a second
        // time: the exact reviewed bytes, including inherited text, must survive.
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const temporary = `${file}.${crypto.randomUUID()}.prepared.tmp`;
        try {
            fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
            fs.renameSync(temporary, file);
        } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
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
        return this.commit(this.prepare(scenario, plan, response, preview), scenario, plan);
    }
}
