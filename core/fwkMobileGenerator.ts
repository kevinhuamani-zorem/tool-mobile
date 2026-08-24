import fs from 'fs';
import path from 'path';
import { translateToEnglish } from './englishIdentifiers';
import { aliasImport, frameworkContract } from './frameworkContract';
import { projectPaths } from './projectPaths';
import { RecordedStep, toGherkinLine } from './models';
import { screenObjectNames } from './semanticNaming';
import { withGeneratedFileMetadata } from './generatedFileMetadata';
import { featureScopeDirectory, normalizeFeatureScope } from './featureScope';

export type TestPathType = 'Happy Path' | 'Unhappy Path';
export type MobilePlatform = 'android' | 'ios';

export interface GenerationRequest {
    squad: string;
    /** Ruta opcional bajo features/yape-features/<squad>; no altera las demás capas. */
    featureScope?: string;
    featureName: string;
    scenarioName: string;
    fileName: string;
    locatorModule: string;
    caseId: string;
    pathType: TestPathType;
    tag: string;
    dataName?: string;
    examples?: Record<string, string>;
    platform: MobilePlatform;
    createdAt?: string;
    scenarioRows?: {
        keyword: 'Given' | 'When' | 'Then' | 'And' | 'But';
        text: string;
        actions?: RecordedStep[];
        status?: 'reused' | 'missing';
        methodName?: string;
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
            featureScopeDirectory(projectPaths.features, normalized.squad, normalized.featureScope),
            `${normalized.fileName}.feature`
        );
        const missingRows = normalized.scenarioRows?.filter(row => row.status === 'missing') || [];
        const generationActions = normalized.scenarioRows
            ? missingRows.flatMap(row => row.actions || [])
            : steps;
        this.validateGenerationActions(missingRows);
        const locatorEntries = this.collectLocators(generationActions);
        const createdAt = normalized.createdAt || new Date().toISOString();
        const locatorPath = locatorEntries.length > 0
            ? path.join(
                projectPaths.locators,
                normalized.squad,
                `${normalized.locatorModule}.locator.json`
            )
            : undefined;

        const featureContent = withGeneratedFileMetadata(
            'feature',
            this.buildFeature(normalized, steps),
            createdAt
        );
        const locatorContent = locatorPath
            ? withGeneratedFileMetadata(
                'locators',
                this.buildLocators(normalized, locatorEntries),
                createdAt
            )
            : undefined;
        const stepPath = missingRows.length > 0
            ? path.join(projectPaths.stepDefinitions, normalized.squad, `${normalized.fileName}.steps.ts`)
            : undefined;
        const screenPath = missingRows.length > 0
            ? path.join(projectPaths.screenobjects, normalized.squad, `${normalized.locatorModule}.screen.ts`)
            : undefined;

        return {
            featurePath,
            locatorPath,
            featureContent,
            locatorContent,
            stepPath,
            stepContent: stepPath && screenPath
                ? withGeneratedFileMetadata(
                    'steps',
                    this.buildStepDefinitions(normalized, missingRows, stepPath, screenPath),
                    createdAt
                )
                : undefined,
            screenPath,
            screenContent: screenPath
                ? withGeneratedFileMetadata(
                    'screen',
                    this.buildScreenObject(normalized, missingRows, screenPath, locatorPath),
                    createdAt
                )
                : undefined,
            files: [
                featurePath,
                ...(locatorPath ? [locatorPath] : []),
                ...(stepPath ? [stepPath] : []),
                ...(screenPath ? [screenPath] : [])
            ]
        };
    }

    generate(
        request: GenerationRequest,
        steps: RecordedStep[],
        managedOverwriteFiles = new Set<string>(),
        reviewedContents?: Record<string, string>
    ): GeneratedPreview {
        const preview = this.withReviewedContents(
            this.preview(request, steps),
            reviewedContents
        );
        return this.writePreview(preview, managedOverwriteFiles);
    }

    writePreview(preview: GeneratedPreview, managedOverwriteFiles = new Set<string>()): GeneratedPreview {
        const conflicts = preview.files.filter(
            file => fs.existsSync(file) && !managedOverwriteFiles.has(file)
        );
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
        const originals = new Map<string, Buffer>();
        try {
            for (const output of outputs) {
                fs.mkdirSync(path.dirname(output.file), { recursive: true });
                if (fs.existsSync(output.file)) {
                    originals.set(output.file, fs.readFileSync(output.file));
                }
                const temporary = `${output.file}.recorder-${process.pid}.tmp`;
                fs.writeFileSync(temporary, output.content, { encoding: 'utf-8', flag: 'wx' });
                temporaryFiles.push(temporary);
            }
            outputs.forEach((output, index) => fs.renameSync(temporaryFiles[index], output.file));
        } catch (error) {
            for (const temporary of temporaryFiles) {
                if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
            }
            for (const output of outputs) {
                if (!originals.has(output.file) && fs.existsSync(output.file)) fs.unlinkSync(output.file);
            }
            for (const [file, content] of originals) fs.writeFileSync(file, content);
            throw error;
        }

        return preview;
    }

    withReviewedContents(
        preview: GeneratedPreview,
        reviewedContents?: Record<string, string>
    ): GeneratedPreview {
        if (!reviewedContents) return preview;
        const allowed = new Set(preview.files.map(file => path.resolve(file)));
        for (const file of Object.keys(reviewedContents)) {
            if (!allowed.has(path.resolve(file))) {
                throw new Error(`El editor intentó modificar un archivo fuera del preview: ${file}`);
            }
        }
        const content = (file: string | undefined, fallback: string | undefined) =>
            file && Object.prototype.hasOwnProperty.call(reviewedContents, file)
                ? String(reviewedContents[file])
                : fallback;
        return {
            ...preview,
            featureContent: content(preview.featurePath, preview.featureContent) || '',
            locatorContent: content(preview.locatorPath, preview.locatorContent),
            stepContent: content(preview.stepPath, preview.stepContent),
            screenContent: content(preview.screenPath, preview.screenContent)
        };
    }

    private normalizeRequest(request: GenerationRequest): GenerationRequest {
        const squad = validateRelativeModule(request.squad, 'Squad');
        const locatorModule = validateRelativeModule(request.locatorModule, 'Módulo de locators');
        const fileName = normalizeFileName(request.fileName || request.featureName);
        if (!fileName || !safeSegment.test(fileName)) {
            throw new Error(`Nombre de archivo inválido: ${request.fileName}`);
        }

        const caseId = request.caseId.trim().toUpperCase();
        if (!/^TC-\d+$/.test(caseId)) {
            throw new Error('El ID debe usar el formato TC-10239');
        }

        const tag = request.tag.trim().replace(/^@/, '');
        if (!/^[A-Za-z0-9_-]+$/.test(tag)) throw new Error(`Tag inválido: ${request.tag}`);
        if (!request.featureName.trim()) throw new Error('El nombre del Feature es obligatorio');
        if (!request.scenarioName.trim()) throw new Error('El nombre del Scenario es obligatorio');
        if (!['android', 'ios'].includes(request.platform)) throw new Error('Plataforma inválida');
        for (const [name, value] of Object.entries(request.examples || {})) {
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
                throw new Error(`Parámetro inválido: ${name}`);
            }
            if (!String(value).trim()) throw new Error(`El parámetro "${name}" no tiene valor de ejemplo`);
        }
        for (const row of request.scenarioRows || []) {
            const locatorReference = row.text.match(/\{([^{}]+)\}/)?.[1]?.trim();
            if (locatorReference) {
                throw new Error(
                    `No uses el locator {${locatorReference}} en el Gherkin. ` +
                    `Enlaza la acción internamente o usa un parámetro sin espacios, por ejemplo ` +
                    `<${locatorReference.replace(/\s+/g, '_')}>.`
                );
            }
        }

        return {
            ...request,
            squad,
            featureScope: normalizeFeatureScope(request.featureScope),
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
        const examples = { ...(request.examples || {}) };
        if (request.dataName && !examples.username) examples.username = request.dataName;
        const outline = Object.keys(examples).length > 0;
        const scenarioLines = request.scenarioRows?.length
            ? request.scenarioRows.map(row => `    ${row.keyword} ${row.text.trim()}`)
            : steps.map((step, index) => `    ${toGherkinLine(step, index)}`);
        const lines = [
            `# locator-module: ${request.squad}/${request.locatorModule}`,
            '',
            `Feature: ${request.featureName}`,
            '',
            `  @${request.tag} @${request.platform}`,
            `  Scenario${outline ? ' Outline' : ''}: [${request.caseId}][${request.pathType}][AUTO-FRONT] ${request.scenarioName}`,
            ...scenarioLines
        ];

        if (outline) {
            const names = Object.keys(examples);
            lines.push(
                '',
                '    Examples:',
                `      | ${names.join(' | ')} |`,
                `      | ${names.map(name => examples[name]).join(' | ')} |`
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

    private validateGenerationActions(
        rows: NonNullable<GenerationRequest['scenarioRows']>
    ): void {
        const withoutLocator = new Set<RecordedStep['action']>([
            'ABRIR_APP', 'SCROLL_DOWN', 'SCROLL_UP', 'SWIPE', 'VOLVER', 'ESPERAR', 'SCREENSHOT'
        ]);
        for (const row of rows) {
            if (!row.actions || row.actions.length === 0) {
                throw new Error(`El step faltante "${row.text}" no tiene acciones enlazadas`);
            }
            for (const action of row.actions) {
                if (!withoutLocator.has(action.action) && (!action.variableName || !action.selector)) {
                    throw new Error(
                        `La acción ${action.action} del step "${row.text}" requiere nombre y selector`
                    );
                }
                const lines = this.actionLines(action, [], 0);
                if (lines.length === 0) {
                    throw new Error(
                        `La acción ${action.action} del step "${row.text}" no genera código ejecutable`
                    );
                }
            }
        }
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
        const importPath = this.frameworkAlias(
            screenPath,
            projectPaths.screenobjects,
            '@screenobjects'
        );
        const screenInstanceName = screenObjectNames(screenPath).instanceName;
        const effectiveKeywords = this.effectiveStepKeywords(rows);
        const imports = [...new Set(effectiveKeywords)].sort();
        const blocks = rows.map((row, index) => {
            const keyword = effectiveKeywords[index];
            const parameters = [...row.text.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)]
                .map(match => match[1]);
            const expression = this.stepExpression(row.text);
            const args = parameters.map(name => `${name}: string`).join(', ');
            const callArgs = parameters.join(', ');
            const methodName = this.rowMethodName(row, index);
            return {
                key: `${keyword}:${expression}`,
                content: [
                `${keyword}(/^${expression}$/, async (${args}) => {`,
                `    await ${screenInstanceName}.${methodName}(${callArgs});`,
                `});`
                ].join('\n')
            };
        }).filter((block, index, all) =>
            all.findIndex(candidate => candidate.key === block.key) === index
        );

        return [
            `import { ${imports.join(', ')} } from '@wdio/cucumber-framework';`,
            `import ${screenInstanceName} from '${importPath}';`,
            '',
            ...blocks.flatMap(block => [block.content, ''])
        ].join('\n');
    }

    private effectiveStepKeywords(
        rows: NonNullable<GenerationRequest['scenarioRows']>
    ): ('Given' | 'When' | 'Then')[] {
        let previous: 'Given' | 'When' | 'Then' = 'Given';
        return rows.map(row => {
            if (row.keyword === 'Given' || row.keyword === 'When' || row.keyword === 'Then') {
                previous = row.keyword;
            }
            return previous;
        });
    }

    private buildScreenObject(
        request: GenerationRequest,
        rows: NonNullable<GenerationRequest['scenarioRows']>,
        screenPath: string,
        locatorPath?: string
    ): string {
        // Resueltos contra el framework en disco, no fijos: si BaseScreen o
        // LocatorFactory se mueven, el import generado se mueve con ellos.
        const contract = frameworkContract(projectPaths.frameworkRoot);
        const baseImport = contract.baseScreenImport;
        const factoryImport = contract.locatorFactoryImport;
        const enumsImport = contract.typeLocatorImport;
        const locatorImport = locatorPath
            ? this.frameworkAlias(locatorPath, projectPaths.locators, '@locators')
            : undefined;
        const className = screenObjectNames(screenPath).className;
        const locators = this.collectLocators(rows.flatMap(row => row.actions || []));
        const androidBlock = locatorBlockName(request.locatorModule, 'android');
        const iosBlock = locatorBlockName(request.locatorModule, 'ios');

        const getters = locators.map(([name, selector]) => {
            const activeType = this.locatorType(selector, request.platform);
            const iosType = request.platform === 'ios' ? activeType : 'XPATH';
            const androidType = request.platform === 'android' ? activeType : 'XPATH';
            return [
                `    private get ${name}(): string {`,
                `        return ${contract.locatorFactorySymbol}.getElement(`,
                `            ${contract.typeLocatorSymbol}.${iosType}, Locators[${JSON.stringify(iosBlock)}].${name},`,
                `            ${contract.typeLocatorSymbol}.${androidType}, Locators[${JSON.stringify(androidBlock)}].${name}`,
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
            const methodName = this.rowMethodName(row, index);
            return {
                name: methodName,
                content: [
                `    public async ${methodName}(${args}): Promise<void> {`,
                ...actions.map(line => `        ${line}`),
                `    }`
                ].join('\n')
            };
        }).filter((method, index, all) =>
            all.findIndex(candidate => candidate.name === method.name) === index
        );
        const usesBrowser = methods.some(method => /\bbrowser\./.test(method.content));

        return [
            ...(usesBrowser ? [`import { browser } from '@wdio/globals';`] : []),
            `import ${contract.baseScreenClass} from '${baseImport}';`,
            ...(locators.length > 0 ? [
                `import ${contract.locatorFactorySymbol} from '${factoryImport}';`,
                `import { ${contract.typeLocatorSymbol} } from '${enumsImport}';`,
                `import Locators from '${locatorImport}' with { type: 'json' };`
            ] : []),
            '',
            `class ${className} extends ${contract.baseScreenClass} {`,
            ...getters.flatMap(getter => ['', getter]),
            ...methods.flatMap(method => ['', method.content]),
            `}`,
            '',
            `export default new ${className}();`,
            ''
        ].join('\n');
    }

    private rowMethodName(
        row: NonNullable<GenerationRequest['scenarioRows']>[number],
        index: number
    ): string {
        if (row.methodName && /^[a-z][A-Za-z0-9]*$/.test(row.methodName)) {
            return row.methodName;
        }
        // El texto del step es espanol a proposito (lo lee el QA); el nombre del
        // metodo no: el codigo del framework se nombra en ingles.
        const source = row.text.replace(/<[^>]+>/g, '');
        const translated = translateToEnglish(source).name;
        if (translated) return translated;
        const words = source
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Za-z0-9]+/g, ' ')
            .trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) return `executeStep${index + 1}`;
        return words[0].toLowerCase() +
            words.slice(1).map(word => word[0].toUpperCase() + word.slice(1).toLowerCase()).join('');
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

    /**
     * El prefijo sale del tsconfig del framework; el argumento `alias` es solo
     * el respaldo por si ese mapeo no existe (por ejemplo, un módulo nuevo que no
     * genera tsconfig).
     */
    private frameworkAlias(targetFile: string, root: string, alias: string): string {
        const relative = path.relative(root, targetFile).replace(/\\/g, '/');
        if (!relative || relative === '..' || relative.startsWith('../')) {
            throw new Error(`No se puede crear alias fuera de ${root}: ${targetFile}`);
        }
        const contract = frameworkContract(projectPaths.frameworkRoot);
        const fromRoot = path.relative(projectPaths.frameworkRoot, targetFile).replace(/\\/g, '/');
        const specifier = aliasImport(fromRoot, contract.aliases) || `${alias}/${relative}`;
        // El Screen Object generado se importa como el framework importa los
        // suyos; el JSON de locators conserva su extension.
        return specifier.replace(/\.tsx?$/, contract.importExtension);
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

}
