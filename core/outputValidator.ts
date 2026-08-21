import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { GeneratedPreview } from './fwkMobileGenerator';
import { projectPaths } from './projectPaths';

export interface OutputValidation {
    valid: boolean;
    errors: string[];
    warnings: string[];
    conflicts: string[];
}

export class OutputValidator {
    validate(preview: GeneratedPreview): OutputValidation {
        const errors: string[] = [];
        const warnings: string[] = [];
        const conflicts = preview.files
            .filter(file => fs.existsSync(file))
            .map(file => path.relative(projectPaths.frameworkRoot, file));

        this.validatePaths(preview, errors);
        this.validateFeature(preview.featureContent, errors);
        if (preview.locatorContent) this.validateJson(preview.locatorContent, errors, warnings);
        if (preview.stepContent) this.validateTypeScript(preview.stepContent, 'Steps', errors);
        if (preview.screenContent) this.validateTypeScript(preview.screenContent, 'ScreenObject', errors);

        return {
            valid: errors.length === 0 && conflicts.length === 0,
            errors,
            warnings,
            conflicts
        };
    }

    private validatePaths(preview: GeneratedPreview, errors: string[]): void {
        const allowedRoots = [
            projectPaths.features,
            projectPaths.stepDefinitions,
            projectPaths.screenobjects,
            projectPaths.locators
        ].map(root => path.resolve(root) + path.sep);

        for (const file of preview.files) {
            const resolved = path.resolve(file);
            if (!allowedRoots.some(root => resolved.startsWith(root))) {
                errors.push(`Ruta fuera del framework permitido: ${file}`);
            }
        }
    }

    private validateFeature(content: string, errors: string[]): void {
        if (!/^Feature:\s+\S+/m.test(content)) errors.push('Feature sin nombre');
        if (!/^\s*@(?!@)[A-Za-z0-9_-]+\s*$/m.test(content)) errors.push('Feature sin tag válido');
        if (!/Scenario(?: Outline)?: \[TC-\d+\]\[(?:Happy|Unhappy) Path\]\[AUTO-FRONT\]/.test(content)) {
            errors.push('Scenario sin formato [TC-10239][Path][AUTO-FRONT]');
        }
        if (!/^\s+(?:Given|When|Then|And|But)\s+\S+/m.test(content)) {
            errors.push('Scenario sin steps Gherkin');
        }
        if (/\bundefined\b|\bnull\b/.test(content)) errors.push('Feature contiene valores indefinidos');
    }

    private validateJson(content: string, errors: string[], warnings: string[]): void {
        try {
            const document = JSON.parse(content) as Record<string, Record<string, string>>;
            const blocks = Object.keys(document);
            if (!blocks.some(block => block.endsWith('Android'))) {
                errors.push('Locators sin bloque Android');
            }
            if (!blocks.some(block => block.endsWith('Ios'))) {
                errors.push('Locators sin bloque Ios');
            }
            const entries = Object.values(document).flatMap(block => Object.entries(block));
            if (entries.length === 0) {
                errors.push('El archivo de locators no contiene ningún locator');
            }
            const empty = entries
                .filter(([, value]) => !value.trim()).length;
            if (empty > 0) {
                warnings.push(`${empty} locator(es) requieren selector de la otra plataforma`);
            }
            const genericXpaths = entries
                .filter(([, value]) =>
                    /^\/\/(?:android\.(?:widget|view)\.|XCUIElementType)[A-Za-z0-9_.]+$/.test(
                        value.trim()
                    )
                )
                .map(([name]) => name);
            if (genericXpaths.length > 0) {
                warnings.push(
                    `Locators demasiado genéricos: ${genericXpaths.join(', ')}. ` +
                    `Usa resource-id, accessibility ID, texto o atributos específicos.`
                );
            }
        } catch (error: any) {
            errors.push(`JSON de locators inválido: ${error.message}`);
        }
    }

    private validateTypeScript(content: string, label: string, errors: string[]): void {
        const result = ts.transpileModule(content, {
            compilerOptions: {
                module: ts.ModuleKind.ESNext,
                target: ts.ScriptTarget.ES2022
            },
            reportDiagnostics: true
        });
        for (const diagnostic of result.diagnostics || []) {
            errors.push(`${label}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
        }
        if (
            label === 'ScreenObject' &&
            /public\s+async\s+\w+\s*\([^)]*\)\s*:\s*Promise<void>\s*\{\s*\}/m.test(content)
        ) {
            errors.push('ScreenObject contiene un método de acción vacío');
        }
    }
}
