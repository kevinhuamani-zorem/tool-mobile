import path from 'path';
import {
    AutomationAgentResponse,
    AutomationScenario,
    AutomationValidation,
    GenerationPlan,
} from './automationContracts';
import { GeneratedPreview } from './fwkMobileGenerator';
import { OutputValidator } from './outputValidator';
import { projectPaths } from './projectPaths';

export class AutomationResponseValidator {
    constructor(private readonly outputValidator = new OutputValidator()) {}

    toPreview(response: AutomationAgentResponse): GeneratedPreview {
        const byLayer = new Map(response.files.map(file => [file.layer, file]));
        const absolute = (relative: string) => path.join(projectPaths.frameworkRoot, relative);
        const feature = byLayer.get('feature')!;
        const steps = byLayer.get('steps');
        const screen = byLayer.get('screen');
        const locators = byLayer.get('locators');
        return {
            featurePath: absolute(feature.path),
            featureContent: feature.content,
            stepPath: steps ? absolute(steps.path) : undefined,
            stepContent: steps?.content,
            screenPath: screen ? absolute(screen.path) : undefined,
            screenContent: screen?.content,
            locatorPath: locators ? absolute(locators.path) : undefined,
            locatorContent: locators?.content,
            files: response.files.map(file => absolute(file.path)),
        };
    }

    validate(
        scenario: AutomationScenario,
        plan: GenerationPlan,
        response: AutomationAgentResponse,
        attempt = 0
    ): AutomationValidation {
        const errors: AutomationValidation['errors'] = [];
        const warnings: string[] = [];
        if (response.schemaVersion !== 1) errors.push({ code: 'schema', message: 'schemaVersion no soportado' });
        if (response.recordingId !== scenario.recordingId) errors.push({ code: 'recording-id', message: 'recordingId no coincide' });
        if (response.planId !== plan.planId) errors.push({ code: 'plan-id', message: 'planId no coincide' });

        const planned = new Map(plan.files.map(file => [file.layer, file.path]));
        const receivedLayers = new Set(response.files.map(file => file.layer));
        for (const [layer, expectedPath] of planned) {
            const file = response.files.find(candidate => candidate.layer === layer);
            if (!file) errors.push({ code: 'missing-layer', message: `Falta capa ${layer}` });
            else if (file.path !== expectedPath) errors.push({ code: 'path', message: `Ruta no planificada para ${layer}`, file: file.path });
        }
        if (receivedLayers.size !== response.files.length) errors.push({ code: 'duplicate-layer', message: 'Hay capas duplicadas' });
        for (const file of response.files) {
            if (!planned.has(file.layer)) errors.push({ code: 'extra-layer', message: `Capa no solicitada: ${file.layer}`, file: file.path });
            if (!file.content.trim()) errors.push({ code: 'empty-file', message: 'Archivo vacío', file: file.path });
        }

        const resolvedGaps = new Set(response.resolutions.map(item => item.gapId));
        for (const gapId of plan.unresolvedGapIds) {
            if (!resolvedGaps.has(gapId)) errors.push({ code: 'unresolved-gap', message: `Gap no resuelto: ${gapId}` });
        }
        const traced = new Set(response.actionTrace.map(item => item.sequence));
        for (const action of scenario.actions) {
            if (!traced.has(action.sequence)) errors.push({ code: 'trace', message: `Acción ${action.sequence} sin trazabilidad` });
        }

        if (!errors.some(error => ['missing-layer', 'path', 'extra-layer'].includes(error.code))) {
            try {
                const preview = this.toPreview(response);
                const output = this.outputValidator.validate(preview);
                output.errors.forEach(message => {
                    const layer = /^(?:Feature|Scenario)/.test(message)
                        ? 'feature'
                        : /^Steps/.test(message)
                            ? 'steps'
                            : /^(?:ScreenObject)/.test(message)
                                ? 'screen'
                                : /(?:locator|JSON)/i.test(message)
                                    ? 'locators'
                                    : undefined;
                    errors.push({
                        code: 'output',
                        message,
                        file: layer ? response.files.find(file => file.layer === layer)?.path : undefined,
                    });
                });
                warnings.push(...output.warnings);
                if (!/^\s*Then\s+\S+/m.test(preview.featureContent)) {
                    errors.push({
                        code: 'assertion',
                        message: 'Scenario sin aserción Then',
                        file: response.files.find(file => file.layer === 'feature')?.path,
                    });
                }
                const definitions = [...(preview.stepContent || '').matchAll(
                    /(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g
                )].map(match => match[1]);
                const duplicateDefinition = definitions.find((definition, index) =>
                    definitions.indexOf(definition) !== index
                );
                if (duplicateDefinition) {
                    errors.push({
                        code: 'duplicate-step-definition',
                        message: `Definición Gherkin duplicada: ${duplicateDefinition}`,
                        file: response.files.find(file => file.layer === 'steps')?.path,
                    });
                }
                const methods = [...(preview.screenContent || '').matchAll(
                    /public\s+async\s+([A-Za-z_$][\w$]*)\s*\(/g
                )].map(match => match[1]);
                const duplicateMethod = methods.find((method, index) => methods.indexOf(method) !== index);
                if (duplicateMethod) {
                    errors.push({
                        code: 'duplicate-screen-method',
                        message: `Método de Screen Object duplicado: ${duplicateMethod}`,
                        file: response.files.find(file => file.layer === 'screen')?.path,
                    });
                }
                if (/Locators\.[A-Za-z_$][\w$]*-/.test(preview.screenContent || '')) {
                    errors.push({
                        code: 'invalid-locator-access',
                        message: 'El Screen Object usa acceso inválido a un bloque locator con guiones',
                        file: response.files.find(file => file.layer === 'screen')?.path,
                    });
                }
            } catch (error: any) {
                errors.push({ code: 'preview', message: error.message });
            }
        }
        const unique = errors.filter((error, index) =>
            errors.findIndex(candidate => candidate.code === error.code && candidate.message === error.message && candidate.file === error.file) === index
        );
        const valid = unique.length === 0;
        const affectedFiles = [...new Set(unique.map(error => error.file).filter(Boolean) as string[])];
        return {
            valid,
            qualityScore: valid ? 100 : Math.max(0, 100 - unique.length * 10),
            errors: unique,
            warnings,
            ...(valid ? {} : {
                repairContext: { attempt, errors: unique, affectedFiles },
            }),
        };
    }
}
