import fs from 'fs';
import path from 'path';
import { GeneratedPreview } from '../../generation';
import { projectPaths } from '../../workspace';
import type { OutputValidation } from '../domain/validationResult';
import { validateTypeScriptSyntax } from './typescriptSyntaxValidator';

type LocatorPlatform = 'android' | 'ios';

export class OutputValidator {
    validate(preview: GeneratedPreview, platform?: LocatorPlatform): OutputValidation {
        const errors: string[] = [];
        const warnings: string[] = [];
        const conflicts = preview.files
            .filter(file => fs.existsSync(file))
            .map(file => path.relative(projectPaths.frameworkRoot, file));

        this.validatePaths(preview, errors);
        this.validateFeature(preview.featureContent, errors);
        if (preview.locatorContent) this.validateJson(preview.locatorContent, errors, warnings, platform);
        if (preview.stepContent) {
            this.validateTypeScript(preview.stepContent, 'Steps', errors);
            this.validateImports(preview.stepContent, 'Steps', errors);
        }
        if (preview.screenContent) {
            this.validateTypeScript(preview.screenContent, 'ScreenObject', errors);
            this.validateImports(preview.screenContent, 'ScreenObject', errors);
        }

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
        if (!/^\s*(?:@[A-Za-z0-9_-]+\s*)+$/m.test(content)) errors.push('Feature sin tag válido');
        if (!/Scenario(?: Outline)?: \[TC-\d+\]\[(?:Happy|Unhappy) Path\]\[AUTO-FRONT\]/.test(content)) {
            errors.push('Scenario sin formato [TC-10239][Path][AUTO-FRONT]');
        }
        if (!/^\s+(?:Given|When|Then|And|But)\s+\S+/m.test(content)) {
            errors.push('Scenario sin steps Gherkin');
        }
        if (/\bundefined\b|\bnull\b/.test(content)) errors.push('Feature contiene valores indefinidos');
    }

    private validateJson(
        content: string,
        errors: string[],
        warnings: string[],
        platform?: LocatorPlatform
    ): void {
        try {
            const document = JSON.parse(content) as Record<string, Record<string, string>>;
            const blocks = Object.keys(document).filter(block => block !== '_metadata');
            const hasBlock = (candidate: LocatorPlatform) => blocks.some(block =>
                block.toLowerCase().endsWith(candidate)
            );
            if (platform && !hasBlock(platform)) {
                errors.push(`Locators sin bloque ${platform === 'ios' ? 'iOS' : 'Android'} activo`);
            } else if (!platform && !hasBlock('android') && !hasBlock('ios')) {
                errors.push('Locators sin bloque Android o iOS');
            }
            const pendingPlatform: LocatorPlatform | undefined = platform === 'android'
                ? 'ios'
                : platform === 'ios'
                    ? 'android'
                    : undefined;
            if (pendingPlatform && !hasBlock(pendingPlatform)) {
                warnings.push(
                    `Cobertura ${pendingPlatform === 'ios' ? 'iOS' : 'Android'} pendiente; ` +
                    'podrá completarse desde otra grabación.'
                );
            }
            const entries = Object.entries(document)
                .filter(([name]) => name !== '_metadata')
                .flatMap(([, block]) => Object.entries(block));
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
        for (const diagnostic of validateTypeScriptSyntax(label, content)) {
            errors.push(`${label}: ${diagnostic.message}`);
        }
        if (
            label === 'ScreenObject' &&
            /public\s+async\s+\w+\s*\([^)]*\)\s*:\s*Promise<void>\s*\{\s*\}/m.test(content)
        ) {
            errors.push('ScreenObject contiene un método de acción vacío');
        }
    }

    private validateImports(content: string, label: string, errors: string[]): void {
        const imports = [...content.matchAll(/(?:from\s+|import\s+)['"]([^'"]+)['"]/g)]
            .map(match => match[1]);
        const relative = imports.filter(source => source.startsWith('.'));
        if (relative.length > 0) {
            errors.push(
                `${label} usa imports relativos no permitidos: ${relative.join(', ')}. ` +
                'Usa @screenobjects, @utils o @locators.'
            );
        }

        const importsBrowser = /import\s*\{[^}]*\bbrowser\b[^}]*\}\s*from\s*['"]@wdio\/globals['"]/.test(content);
        const usesBrowser = /\bbrowser\./.test(content);
        if (importsBrowser && !usesBrowser) {
            errors.push(`${label} importa browser desde @wdio/globals pero no lo utiliza`);
        }
        if (usesBrowser && !importsBrowser) {
            errors.push(`${label} utiliza browser pero no lo importa desde @wdio/globals`);
        }

        if (label === 'Steps') {
            const importsUnsupportedKeyword = /import\s*\{[^}]*(?:\bAnd\b|\bBut\b)[^}]*\}\s*from\s*['"](?:@cucumber\/cucumber|@wdio\/cucumber-framework)['"]/.test(content);
            const invokesUnsupportedKeyword = /^\s*(?:And|But)\s*\(/m.test(content);
            if (importsUnsupportedKeyword || invokesUnsupportedKeyword) {
                errors.push(
                    'Steps usa And/But como función TypeScript; conserva And/But solo en el Feature ' +
                    'y registra la definición con Given, When o Then.'
                );
            }
        }
    }
}
