import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ipcMain } from 'electron';
import { FwkMobileGenerator, GenerationRequest } from '../../../core/generation';
import { RecordedStep } from '../../../core/automation';
import { OutputValidator } from '../../../core/validation';
import { GeneratedFileRegistry } from '../../../core/automation';
import { projectPaths } from '../../../core/workspace';
import { FeatureGenerator } from '../featureGenerator';
import { RecorderRuntimeState } from './runtimeState';

const GENERATION_ENABLED = process.env.RECORDER_ENABLE_GENERATION === 'true';

/** Convierte un RecordedStep en una línea de código TypeScript usando PageFactory */
function stepToCode(s: any): string {
    const loc = s.variableName
        ? `'${s.variableName}'`
        : s.selector ? `'${s.selector}'` : "''";
    const val = (s.value || '').replace(/'/g, "\\'");

    switch (s.action) {
        case 'CLICK':               return `    await PageFactory.base.click(${loc});`;
        case 'ESCRIBIR':            return `    await PageFactory.base.type(${loc}, '${val}');`;
        case 'LIMPIAR':             return `    await PageFactory.base.clear(${loc});`;
        case 'SCROLL_DOWN':         return `    await PageFactory.base.scrollDown();`;
        case 'SCROLL_UP':           return `    await PageFactory.base.scrollUp();`;
        case 'SCROLL_HASTA':        return `    await PageFactory.base.scrollTo(${loc});`;
        case 'SWIPE':               return `    await PageFactory.base.swipe('${val}');`;
        case 'PRESION_LARGA':       return `    await PageFactory.base.longPress(${loc});`;
        case 'VOLVER':              return `    await PageFactory.base.back();`;
        case 'ESPERAR':             return `    await PageFactory.base.wait(${val || 1});`;
        case 'SCREENSHOT':          return `    await PageFactory.base.screenshot();`;
        case 'VERIFICAR_TEXTO':     return `    await PageFactory.base.verifyText(${loc}, '${val}');`;
        case 'VERIFICAR_EXISTE':    return `    await PageFactory.base.verifyExists(${loc});`;
        case 'VERIFICAR_NO_EXISTE': return `    await PageFactory.base.verifyNotExists(${loc});`;
        case 'ABRIR_APP':           return `    // ABRIR_APP: '${val}' — gestionar en Before hook`;
        default:                    return `    // TODO: ${s.action} ${loc}`;
    }
}

function generationFingerprint(request: GenerationRequest, steps: RecordedStep[]): string {
    return crypto.createHash('sha256')
        .update(JSON.stringify({ request, steps }))
        .digest('hex');
}

/**
 * Dependencias de la generación heredada: preview/generación directa de las
 * cuatro capas a partir de `FwkMobileGenerator` (sin pasar por el pipeline de
 * automatización con agente) y el generador de Gherkin/steps enlazados. Está
 * bloqueada detrás de `RECORDER_ENABLE_GENERATION` en sus dos handlers de
 * escritura final (`generate-files`, `generate-linked-files`).
 */
export interface GenerationHandlersContext {
    state: RecorderRuntimeState;
    featureGen: FeatureGenerator;
    fwkMobileGenerator: FwkMobileGenerator;
    outputValidator: OutputValidator;
    generatedFileRegistry: GeneratedFileRegistry;
}

export function registerGenerationHandlers(context: GenerationHandlersContext): void {
    const { state, featureGen, fwkMobileGenerator, outputValidator, generatedFileRegistry } = context;

    ipcMain.handle('preview-gherkin', async (_, featureName: string, scenarioName: string) => {
        return { success: true, preview: featureGen.preview(featureName, scenarioName, state.recordedSteps) };
    });

    ipcMain.handle('preview-fwk-files', async (_, request: Omit<GenerationRequest, 'platform'>) => {
        try {
            const prepared = state.withPlatform(request);
            const preview = fwkMobileGenerator.preview(prepared, state.recordedSteps);
            const validation = outputValidator.validate(preview, prepared.platform);
            const managed = generatedFileRegistry.assess(preview, prepared.squad);
            validation.conflicts = managed.conflicts;
            validation.valid = validation.errors.length === 0 && validation.conflicts.length === 0;
            const fingerprint = generationFingerprint(prepared, state.recordedSteps);
            const previewToken = crypto.randomUUID();
            state.approvedPreviews.clear();
            state.approvedPreviews.set(previewToken, fingerprint);
            return {
                success: true,
                preview,
                validation,
                previewToken,
                managedUpdates: managed.writable.size
            };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('generate-fwk-files', async (
        _,
        request: Omit<GenerationRequest, 'platform'>,
        previewToken: string,
        reviewedContents?: Record<string, string>
    ) => {
        try {
            const prepared = state.withPlatform(request);
            const expectedFingerprint = state.approvedPreviews.get(previewToken);
            const actualFingerprint = generationFingerprint(prepared, state.recordedSteps);
            if (!previewToken || !expectedFingerprint || expectedFingerprint !== actualFingerprint) {
                throw new Error('La grabación cambió. Ejecuta Preview nuevamente antes de generar.');
            }
            let preview = fwkMobileGenerator.preview(prepared, state.recordedSteps);
            if (reviewedContents) {
                preview = fwkMobileGenerator.withReviewedContents(preview, reviewedContents);
            }
            const validation = outputValidator.validate(preview, prepared.platform);
            const managed = generatedFileRegistry.assess(preview, prepared.squad);
            validation.conflicts = managed.conflicts;
            validation.valid = validation.errors.length === 0 && validation.conflicts.length === 0;
            if (!validation.valid) {
                const details = [...validation.errors, ...validation.conflicts].join(', ');
                throw new Error(`La salida no superó la validación: ${details}`);
            }
            const generated = fwkMobileGenerator.generate(
                prepared,
                state.recordedSteps,
                managed.writable,
                reviewedContents
            );
            const manifest = generatedFileRegistry.register(generated, prepared.squad);
            state.approvedPreviews.delete(previewToken);
            return {
                success: true,
                generated,
                validation,
                managedFiles: Object.keys(manifest.files)
            };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('generate-files', async (_, featureName: string, scenarioName: string) => {
        if (!GENERATION_ENABLED) {
            return {
                success: false,
                error: 'La generación está bloqueada hasta implementar la salida compatible con fwk-mobile-test.'
            };
        }
        if (state.recordedSteps.length === 0) return { success: false, error: 'No hay steps grabados' };
        const filePath     = featureGen.generate(featureName, scenarioName, state.recordedSteps);
        const locatorsPath = state.locatorManager.getFilePath();
        return { success: true, featurePath: filePath, locatorsPath };
    });

    ipcMain.handle('generate-linked-files', async (_, featureName: string, scenarioName: string, stepRows: { keyword: string; text: string }[], linked: Record<string, any[]>) => {
        try {
            if (!GENERATION_ENABLED) {
                return {
                    success: false,
                    error: 'La generación está bloqueada hasta implementar la salida compatible con fwk-mobile-test.'
                };
            }
            // Debe coincidir con cucumber.json para que los escenarios generados se ejecuten.
            const featuresDir = projectPaths.features;
            const stepsDir    = projectPaths.stepDefinitions;
            fs.mkdirSync(featuresDir, { recursive: true });
            fs.mkdirSync(stepsDir,    { recursive: true });

            // ── .feature ──────────────────────────────────────────────────────────
            const fileName = featureName.toLowerCase()
                .replace(/\s+/g, '_')
                .replace(/[^a-z0-9_]/g, '');
            const featurePath = `${featuresDir}/${fileName}.feature`;
            const date = new Date().toLocaleString('es-PE');
            const featureLines = [
                `# Generado por Appium Recorder`,
                `# Fecha: ${date}`,
                `# locator-module: global`,
                `# Locators: ${path.join(projectPaths.locators, 'global.locator.json')}`,
                '',
                `Feature: ${featureName}`,
                '',
                `  Scenario: ${scenarioName}`,
                ...stepRows.map(r => `    ${r.keyword} ${r.text}`),
                ''
            ];
            fs.writeFileSync(featurePath, featureLines.join('\n'), 'utf-8');

            // ── linked-steps.ts ───────────────────────────────────────────────────
            const linkedStepsPath = `${stepsDir}/linked-steps.ts`;

            // Leer steps existentes para hacer merge (no sobreescribir steps previos)
            let existingBlocks: string[] = [];
            if (fs.existsSync(linkedStepsPath)) {
                const current = fs.readFileSync(linkedStepsPath, 'utf-8');
                // Extraer bloques Given existentes
                const blockRegex = /Given\(['"`](.+?)['"`],[\s\S]*?\}\);/g;
                let m;
                while ((m = blockRegex.exec(current)) !== null) {
                    existingBlocks.push(m[0]);
                }
            }

            // Construir nuevos bloques desde linked
            const existingTexts = new Set(existingBlocks.map(b => {
                const m = b.match(/Given\(['"`](.+?)['"`]/);
                return m ? m[1] : '';
            }));

            const newBlocks: string[] = [];
            for (const [stepText, steps] of Object.entries(linked)) {
                if (existingTexts.has(stepText)) continue; // no duplicar
                const lines = steps
                    .filter((s: any) => s.action !== 'ABRIR_APP')
                    .map((s: any) => stepToCode(s));
                if (lines.length === 0) continue;
                newBlocks.push(
                    `Given('${stepText}', async () => {\n` +
                    lines.join('\n') +
                    '\n});'
                );
            }

            const allBlocks = [...existingBlocks, ...newBlocks];

            const tsContent = [
                `// Generado por Appium Recorder — ${date}`,
                `import { Given } from '@cucumber/cucumber';`,
                `import { PageFactory } from '../pageFactory';`,
                '',
                ...allBlocks.map(b => b + '\n'),
            ].join('\n');

            fs.writeFileSync(linkedStepsPath, tsContent, 'utf-8');

            return { success: true, featurePath, linkedStepsPath };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });
}
