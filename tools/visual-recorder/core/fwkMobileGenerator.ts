import fs from 'fs';
import path from 'path';
import { projectPaths } from './projectPaths';
import { RecordedStep, toGherkinLine } from './models';

export type TestPathType = 'Happy Path' | 'Unhappy Path';
export type MobilePlatform = 'android' | 'ios';

export interface GenerationRequest {
    squad: string;
    featureName: string;
    scenarioName: string;
    fileName: string;
    locatorModule: string;
    caseId: string;
    pathType: TestPathType;
    tag: string;
    dataName?: string;
    platform: MobilePlatform;
    scenarioRows?: {
        keyword: 'Given' | 'When' | 'Then' | 'And' | 'But';
        text: string;
        actions?: RecordedStep[];
        status?: 'reused' | 'missing';
    }[];
}

export interface GeneratedPreview {
    featurePath: string;
    locatorPath?: string;
    featureContent: string;
    locatorContent?: string;
    stepPath?: string;
    stepContent?: string;
    screenPath?: string;
    screenContent?: string;
    files: string[];
}

const safeSegment = /^[a-z0-9][a-z0-9_-]*$/;

function normalizeFileName(value: string): string {
    return value.trim().toLowerCase()
        .replace(/\.feature$/i, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, '');
}

function validateRelativeModule(value: string, label: string): string {
    const normalized = value.trim().toLowerCase()
        .replace(/\\/g, '/')
        .replace(/\.locator\.json$/i, '')
        .replace(/^\/+|\/+$/g, '');
    const segments = normalized.split('/');
    if (!normalized || segments.some(segment => !safeSegment.test(segment))) {
        throw new Error(`${label} inválido: ${value}`);
    }
    return normalized;
}

function locatorBlockName(moduleName: string, platform: MobilePlatform): string {
    const base = path.posix.basename(moduleName);
    const camel = base.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
    return `${camel}${platform === 'android' ? 'Android' : 'Ios'}`;
}

export class FwkMobileGenerator {
    preview(request: GenerationRequest, steps: RecordedStep[]): GeneratedPreview {
        const normalized = this.normalizeRequest(request);
        if (steps.length === 0) throw new Error('No hay steps grabados');

        const featurePath = path.join(
            projectPaths.features,
            normalized.squad,
            `${normalized.fileName}.feature`
        );
        const locatorEntries = this.collectLocators(steps);
        const missingRows = normalized.scenarioRows?.filter(row => row.status === 'missing') || [];
        const locatorPath = locatorEntries.length > 0 || missingRows.length > 0
            ? path.join(
                projectPaths.locators,
                normalized.squad,
                `${normalized.locatorModule}.locator.json`
            )
            : undefined;

        const featureContent = this.buildFeature(normalized, steps);
        const locatorContent = locatorPath
            ? this.buildLocators(normalized, locatorEntries)
            : undefined;
        const stepPath = missingRows.length > 0
            ? path.join(projectPaths.stepDefinitions, normalized.squad, `${normalized.fileName}.steps.ts`)
            : undefined;
        const screenPath = missingRows.length > 0
            ? path.join(projectPaths.screenobjects, normalized.squad, `${normalized.locatorModule}.screen.ts`)
            : undefined;

        if (missingRows.some(row => !row.actions || row.actions.length === 0)) {
            throw new Error('Cada step faltante debe tener al menos una acción grabada');
        }

        return {
            featurePath,
            locatorPath,
            featureContent,
            locatorContent,
            stepPath,
            stepContent: stepPath && screenPath
                ? this.buildStepDefinitions(normalized, missingRows, stepPath, screenPath)
                : undefined,
            screenPath,
            screenContent: screenPath && locatorPath
                ? this.buildScreenObject(normalized, missingRows, screenPath, locatorPath)
                : undefined,
            files: [
                featurePath,
                ...(locatorPath ? [locatorPath] : []),
                ...(stepPath ? [stepPath] : []),
                ...(screenPath ? [screenPath] : [])
            ]
        };
    }

    generate(request: GenerationRequest, steps: RecordedStep[]): GeneratedPreview {
        const preview = this.preview(request, steps);
        const conflicts = preview.files.filter(file => fs.existsSync(file));
        if (conflicts.length > 0) {
            throw new Error(
                `No se sobrescribieron archivos existentes: ${conflicts
                    .map(file => path.relative(projectPaths.frameworkRoot, file))
                    .join(', ')}`
            );
        }

        const outputs = [
            { file: preview.featurePath, content: preview.featureContent },
            ...(preview.locatorPath && preview.locatorContent
                ? [{ file: preview.locatorPath, content: preview.locatorContent }]
                : []),
            ...(preview.stepPath && preview.stepContent
                ? [{ file: preview.stepPath, content: preview.stepContent }]
                : []),
            ...(preview.screenPath && preview.screenContent
                ? [{ file: preview.screenPath, content: preview.screenContent }]
                : [])
        ];

        const temporaryFiles: string[] = [];
        try {
            for (const output of outputs) {
                fs.mkdirSync(path.dirname(output.file), { recursive: true });
                const temporary = `${output.file}.recorder-${process.pid}.tmp`;
                fs.writeFileSync(temporary, output.content, { encoding: 'utf-8', flag: 'wx' });
                temporaryFiles.push(temporary);
            }
            outputs.forEach((output, index) => fs.renameSync(temporaryFiles[index], output.file));
        } catch (error) {
            for (const temporary of temporaryFiles) {
                if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
            }
            throw error;
        }

        return preview;
    }

    private normalizeRequest(request: GenerationRequest): GenerationRequest {
        const squad = validateRelativeModule(request.squad, 'Squad');
        const locatorModule = validateRelativeModule(request.locatorModule, 'Módulo de locators');
        const fileName = normalizeFileName(request.fileName || request.featureName);
        if (!fileName || !safeSegment.test(fileName)) {
            throw new Error(`Nombre de archivo inválido: ${request.fileName}`);
        }

        const caseId = request.caseId.trim().toUpperCase();
        if (!/^CP_[A-Z0-9-]+$/.test(caseId)) {
            throw new Error('El ID debe usar el formato CP_XX');
        }

        const tag = request.tag.trim().replace(/^@/, '');
        if (!/^[A-Za-z0-9_-]+$/.test(tag)) throw new Error(`Tag inválido: ${request.tag}`);
        if (!request.featureName.trim()) throw new Error('El nombre del Feature es obligatorio');
        if (!request.scenarioName.trim()) throw new Error('El nombre del Scenario es obligatorio');
        if (!['android', 'ios'].includes(request.platform)) throw new Error('Plataforma inválida');

        return {
            ...request,
            squad,
            locatorModule,
            fileName,
            caseId,
            tag,
            featureName: request.featureName.trim(),
            scenarioName: request.scenarioName.trim(),
            dataName: request.dataName?.trim()
        };
    }

    private buildFeature(request: GenerationRequest, steps: RecordedStep[]): string {
        const outline = Boolean(request.dataName);
        const scenarioLines = request.scenarioRows?.length
            ? request.scenarioRows.map(row => `    ${row.keyword} ${row.text.trim()}`)
            : steps.map((step, index) => `    ${toGherkinLine(step, index)}`);
        const lines = [
            `# Generado por Appium Visual Recorder`,
            `# locator-module: ${request.squad}/${request.locatorModule}`,
            '',
            `Feature: ${request.featureName}`,
            '',
            `  @${request.tag}`,
            `  Scenario${outline ? ' Outline' : ''}: [${request.caseId}][${request.pathType}][AUTO-FRONT] ${request.scenarioName}`,
            ...scenarioLines
        ];

        if (outline) {
            lines.push(
                '',
                '    Examples:',
                '      | username |',
                `      | ${request.dataName} |`
            );
        }

        return `${lines.join('\n')}\n`;
    }

    private collectLocators(steps: RecordedStep[]): [string, string][] {
        const locators = new Map<string, string>();
        for (const step of steps) {
            if (!step.variableName || !step.selector) continue;
            const name = step.variableName.trim();
            if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
                throw new Error(`Nombre de locator inválido: ${name}`);
            }
            const previous = locators.get(name);
            if (previous && previous !== step.selector) {
                throw new Error(`El locator "${name}" tiene selectores diferentes`);
            }
            locators.set(name, step.selector.trim());
        }
        return [...locators.entries()];
    }

    private buildLocators(
        request: GenerationRequest,
        entries: [string, string][]
    ): string {
        const active = Object.fromEntries(entries.map(([name, selector]) => [
            name,
            this.locatorValue(selector)
        ]));
        const inactive = Object.fromEntries(entries.map(([name]) => [name, '']));
        const android = request.platform === 'android' ? active : inactive;
        const ios = request.platform === 'ios' ? active : inactive;
        return JSON.stringify({
            [locatorBlockName(request.locatorModule, 'android')]: android,
            [locatorBlockName(request.locatorModule, 'ios')]: ios
        }, null, 4) + '\n';
    }

    private buildStepDefinitions(
        request: GenerationRequest,
        rows: NonNullable<GenerationRequest['scenarioRows']>,
        stepPath: string,
        screenPath: string
    ): string {
        const importPath = this.relativeImport(stepPath, screenPath);
        const imports = [...new Set(rows.map(row =>
            row.keyword === 'When' ? 'When' : row.keyword === 'Then' ? 'Then' : 'Given'
        ))].sort();
        const blocks = rows.map((row, index) => {
            const keyword = row.keyword === 'When' ? 'When' : row.keyword === 'Then' ? 'Then' : 'Given';
            const parameters = [...row.text.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)]
                .map(match => match[1]);
            const expression = this.stepExpression(row.text);
            const args = parameters.map(name => `${name}: string`).join(', ');
            const callArgs = parameters.join(', ');
            return [
                `${keyword}(/^${expression}$/, async (${args}) => {`,
                `    await generatedScreen.executeStep${index + 1}(${callArgs});`,
                `});`
            ].join('\n');
        });

        return [
            `import { ${imports.join(', ')} } from '@wdio/cucumber-framework';`,
            `import generatedScreen from '${importPath}';`,
            '',
            ...blocks.flatMap(block => [block, ''])
        ].join('\n');
    }

    private buildScreenObject(
        request: GenerationRequest,
        rows: NonNullable<GenerationRequest['scenarioRows']>,
        screenPath: string,
        locatorPath: string
    ): string {
        const baseImport = this.relativeImport(
            screenPath,
            path.join(projectPaths.screenobjects, 'commons', 'base.screen.ts')
        );
        const factoryImport = this.relativeImport(
            screenPath,
            path.join(projectPaths.frameworkRoot, 'support', 'utils', 'LocatorFactory.ts')
        );
        const enumsImport = this.relativeImport(
            screenPath,
            path.join(projectPaths.frameworkRoot, 'support', 'utils', 'Enums.ts')
        );
        const locatorImport = this.relativeImport(screenPath, locatorPath);
        const className = this.pascalName(request.locatorModule) + 'Screen';
        const locators = this.collectLocators(rows.flatMap(row => row.actions || []));
        const androidBlock = locatorBlockName(request.locatorModule, 'android');
        const iosBlock = locatorBlockName(request.locatorModule, 'ios');

        const getters = locators.map(([name, selector]) => {
            const activeType = this.locatorType(selector, request.platform);
            const iosType = request.platform === 'ios' ? activeType : 'XPATH';
            const androidType = request.platform === 'android' ? activeType : 'XPATH';
            return [
                `    private get ${name}(): string {`,
                `        return LocatorFactory.getElement(`,
                `            TypeLocator.${iosType}, Locators.${iosBlock}.${name},`,
                `            TypeLocator.${androidType}, Locators.${androidBlock}.${name}`,
                `        );`,
                `    }`
            ].join('\n');
        });

        const methods = rows.map((row, index) => {
            const parameters = [...row.text.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)]
                .map(match => match[1]);
            const args = parameters.map(name => `${name}: string`).join(', ');
            const actions = (row.actions || []).flatMap((action, actionIndex) =>
                this.actionLines(action, parameters, actionIndex)
            );
            return [
                `    public async executeStep${index + 1}(${args}): Promise<void> {`,
                ...actions.map(line => `        ${line}`),
                `    }`
            ].join('\n');
        });

        return [
            `import { browser } from '@wdio/globals';`,
            `import BaseScreen from '${baseImport}';`,
            `import LocatorFactory from '${factoryImport}';`,
            `import { TypeLocator } from '${enumsImport}';`,
            `import Locators from '${locatorImport}' with { type: 'json' };`,
            '',
            `class ${className} extends BaseScreen {`,
            ...getters.flatMap(getter => ['', getter]),
            ...methods.flatMap(method => ['', method]),
            `}`,
            '',
            `export default new ${className}();`,
            ''
        ].join('\n');
    }

    private actionLines(
        action: RecordedStep,
        parameters: string[],
        actionIndex: number
    ): string[] {
        const locator = action.variableName ? `this.${action.variableName}` : undefined;
        const value = this.codeValue(action.value || '', parameters);
        const element = `element${actionIndex + 1}`;
        switch (action.action) {
            case 'CLICK':
                return locator ? [`await this.uiHelper.interactWithElement(${locator}, 'click');`] : [];
            case 'ESCRIBIR':
                return locator
                    ? [`await this.uiHelper.interactWithElement(${locator}, 'setValue', ${value});`]
                    : [];
            case 'LIMPIAR':
                return locator
                    ? [
                        `const ${element} = await this.uiHelper.waitForElementToBeReady(${locator});`,
                        `await ${element}.clearValue();`
                    ]
                    : [];
            case 'VERIFICAR_TEXTO':
                return locator
                    ? [
                        `const ${element} = await this.uiHelper.waitForElementToBeReady(${locator});`,
                        `await expect(${element}).toHaveText(${value});`
                    ]
                    : [];
            case 'VERIFICAR_EXISTE':
                return locator ? [`await this.uiHelper.waitForDisplayed(${locator});`] : [];
            case 'VERIFICAR_NO_EXISTE':
                return locator
                    ? [`expect(await this.uiHelper.isElementPresent(${locator})).toBe(false);`]
                    : [];
            case 'SCROLL_DOWN':
                return ['await this.gestureHelper.verticalScrollingToEnd();'];
            case 'SCROLL_UP':
                return [
                    `await browser.execute('mobile: scrollGesture', { direction: 'up', percent: 0.75 });`
                ];
            case 'SCROLL_HASTA':
                return [`await this.gestureHelper.verticalScrollTextIntoView(${value});`];
            case 'SWIPE':
                return [
                    `await browser.execute('mobile: swipeGesture', { direction: ${value}, percent: 0.75 });`
                ];
            case 'PRESION_LARGA':
                return locator
                    ? [
                        `const ${element} = await this.uiHelper.waitForElementToBeReady(${locator});`,
                        `await browser.execute('mobile: longClickGesture', { elementId: ${element}.elementId });`
                    ]
                    : [];
            case 'VOLVER':
                return ['await browser.back();'];
            case 'ESPERAR':
                return [`await browser.pause(Number(${value}) * 1000);`];
            case 'SCREENSHOT':
                return [`await browser.saveScreenshot(${value});`];
            case 'ABRIR_APP':
                return [`await browser.activateApp(${value});`];
            default:
                throw new Error(`Acción no soportada para generación: ${action.action}`);
        }
    }

    private locatorValue(selector: string): string {
        const shortId = selector.match(/^id=([^/:]+)$/)?.[1];
        if (shortId) return `//*[@resource-id="${shortId}"]`;
        return selector.trim()
            .replace(/^android=/, '')
            .replace(/^iosPredicate=/, '')
            .replace(/^iosClassChain=/, '')
            .replace(/^id=/, '')
            .replace(/^class=/, '')
            .replace(/^~/, '');
    }

    private locatorType(selector: string, platform: MobilePlatform): string {
        if (/^id=[^/:]+$/.test(selector)) return 'XPATH';
        if (selector.startsWith('android=')) return 'ANDROID';
        if (selector.startsWith('iosPredicate=')) return 'PREDICATESTRING';
        if (selector.startsWith('iosClassChain=')) return 'CLASSCHAIN';
        if (selector.startsWith('class=')) return 'CLASSNAME';
        if (selector.startsWith('id=') || selector.startsWith('~')) return 'ID';
        if (platform === 'android' && selector.includes('new UiSelector')) return 'ANDROID';
        return 'XPATH';
    }

    private relativeImport(fromFile: string, targetFile: string): string {
        let relative = path.relative(path.dirname(fromFile), targetFile).replace(/\\/g, '/');
        if (!relative.startsWith('.')) relative = `./${relative}`;
        return relative.replace(/\.ts$/, '.ts').replace(/\.json$/, '.json');
    }

    private stepExpression(text: string): string {
        return text.split(/(<[A-Za-z_][A-Za-z0-9_]*>)/g)
            .map(part => /^<.+>$/.test(part)
                ? '(.*)'
                : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('');
    }

    private codeValue(value: string, parameters: string[]): string {
        const placeholder = value.match(/^<([A-Za-z_][A-Za-z0-9_]*)>$/)?.[1];
        if (placeholder && parameters.includes(placeholder)) return placeholder;
        return JSON.stringify(value);
    }

    private pascalName(value: string): string {
        return value.split(/[/_-]+/)
            .filter(Boolean)
            .map(segment => segment[0].toUpperCase() + segment.slice(1))
            .join('');
    }
}
