import fs from 'fs';
import path from 'path';
import { translateToEnglish, screenObjectNames } from '../../shared';
import { aliasImport, frameworkContract, projectPaths } from '../../workspace';
import { frameworkLocator } from '../../indexing';
import { withGeneratedFileMetadata } from '../application/generatedFileMetadata';
import type { GeneratedPreview, ReusedLocator } from '../domain/generatedPreview';
import type {
    GenerationRequest,
    MobilePlatform,
    RecordedStep,
} from '../../automation/contracts';
import {
    toGherkinLine,
    featureScopeDirectory,
    normalizeFeatureScope,
    detectRepetition,
    locatorImportIdentifier,
    RECORDED_TEXT_READER,
    parseTextAssertion,
} from '../../automation/contracts';

export type {
    GenerationRequest,
    MobilePlatform,
    TestPathType,
} from '../../automation/contracts';
export type { GeneratedPreview, ReusedLocator } from '../domain/generatedPreview';

export function scenarioRowMethodName(
    row: NonNullable<GenerationRequest['scenarioRows']>[number],
    index: number,
): string {
    if (row.methodName && /^[a-z][A-Za-z0-9]*$/.test(row.methodName)) {
        return row.methodName;
    }
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

/**
 * Tier de ejecucion del Scenario.
 *
 * El estandar exige `@smoke_mobile` o `@regression_mobile`. Cuando el QA no lo
 * elige se deriva del tipo de camino: el Happy Path es el flujo que tiene que
 * seguir vivo en cada build, los demas van a regresion.
 */
/** Tag de dominio del producto que va sobre la linea `Feature:`. */
export function domainTag(squad: string): string {
    return String(squad).trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function executionTag(request: Pick<GenerationRequest, 'executionTag' | 'pathType'>): string {
    const chosen = String(request.executionTag || '').trim().replace(/^@/, '');
    if (chosen) return chosen;
    // `Unhappy Path` contiene "happy": el ancla al inicio es obligatoria.
    return /^\s*happy\b/i.test(String(request.pathType || '')) ? 'smoke_mobile' : 'regression_mobile';
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
    preview(
        request: GenerationRequest,
        steps: RecordedStep[],
        reused: ReusedLocator[] = [],
        options: {
            preserveDistinctActionLocators?: boolean;
            paths?: Partial<Pick<GeneratedPreview, 'featurePath' | 'stepPath' | 'screenPath' | 'locatorPath'>>;
            existingMethods?: Map<number, { name: string; args?: string[] }>;
        } = {},
    ): GeneratedPreview {
        const normalized = this.normalizeRequest(request);
        // Solo sirven los que traen referencia para la plataforma del caso: sin
        // eso no hay nada que escribir y es mas seguro crear el locator.
        const reusedByName = new Map(reused
            .filter(item => item.reference[normalized.platform === 'ios' ? 'ios' : 'android'])
            .map(item => [item.name, item]));
        if (steps.length === 0) throw new Error('No hay steps grabados');

        const featurePath = options.paths?.featurePath || path.join(
            featureScopeDirectory(projectPaths.features, normalized.squad, normalized.featureScope),
            `${normalized.fileName}.feature`
        );
        const missingRows = this.normalizeScenarioRows(
            normalized.scenarioRows?.filter(row => row.status === 'missing') || [],
            Boolean(options.preserveDistinctActionLocators),
        );
        const generationActions = normalized.scenarioRows
            ? missingRows.flatMap(row => row.actions || [])
            : steps;
        this.validateGenerationActions(missingRows);
        const locatorEntries = this.collectLocators(generationActions)
            .filter(([name]) => !reusedByName.has(name));
        const createdAt = normalized.createdAt || new Date().toISOString();
        // El modulo conserva su archivo aunque TODOS sus locators se reutilicen:
        // el contrato de cuatro capas lo exige y ahi es donde iran los proximos.
        const ownsLocatorFile = locatorEntries.length > 0 || reusedByName.size > 0;
        const locatorPath = options.paths?.locatorPath || (ownsLocatorFile
            ? path.join(
                projectPaths.locators,
                normalized.squad,
                `${normalized.locatorModule}.locator.json`
            )
            : undefined);

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
            ? options.paths?.stepPath || path.join(projectPaths.stepDefinitions, normalized.squad, `${normalized.fileName}.steps.ts`)
            : undefined;
        const screenPath = missingRows.length > 0
            ? options.paths?.screenPath || path.join(projectPaths.screenobjects, normalized.squad, `${normalized.locatorModule}.screen.ts`)
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
                    this.buildScreenObject(
                        normalized,
                        missingRows,
                        screenPath,
                        locatorPath,
                        reusedByName,
                        options.existingMethods,
                    ),
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
            ? request.scenarioRows.flatMap(row => [
                `    ${row.keyword} ${row.text.trim()}`,
                ...((row.dataTable?.headers?.length && row.dataTable.rows.length)
                    ? [
                        `      | ${row.dataTable.headers.join(' | ')} |`,
                        ...row.dataTable.rows.map(values => `      | ${values.join(' | ')} |`),
                    ]
                    : []),
            ])
            : steps.map((step, index) => `    ${toGherkinLine(step, index)}`);
        // Tags segun el estandar del repo: dominio de producto sobre `Feature:`,
        // y en el Scenario funcionalidad + tier de ejecucion. Faltar el tier es
        // un hallazgo que bloquea el merge, asi que se emite siempre.
        const featureTag = `@${domainTag(request.squad)}`;
        const scenarioTags = [
            `@${request.tag}`,
            `@${executionTag(request)}`,
            `@${request.platform}`,
        ].join(' ');
        const lines = [
            `# locator-module: ${request.squad}/${request.locatorModule}`,
            '',
            featureTag,
            `Feature: ${request.featureName}`,
            '',
            `  ${scenarioTags}`,
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
        // SCROLL_HASTA se resuelve con el texto, no con un locator:
        // `verticalScrollTextIntoView(<texto>)`. Exigirle nombre y selector
        // impedia generar cualquier grabacion que lo usara.
        const withoutLocator = new Set<RecordedStep['action']>([
            'ABRIR_APP', 'SCROLL_DOWN', 'SCROLL_UP', 'SCROLL_HASTA',
            'SWIPE', 'VOLVER', 'ESPERAR', 'SCREENSHOT'
        ]);
        for (const row of rows) {
            if (!row.actions || row.actions.length === 0) {
                throw new Error(`El step faltante "${row.text}" no tiene acciones enlazadas`);
            }
            for (let index = 0; index < row.actions.length; index++) {
                const action = row.actions[index];
                if (!withoutLocator.has(action.action) && (!action.variableName || !action.selector)) {
                    throw new Error(
                        `La acción ${action.action} del step "${row.text}" requiere nombre y selector`
                    );
                }
                // ESPERAR se valida con su vecina: sin elemento posterior no hay
                // nada a que anclar la espera, y una pausa por tiempo no es una
                // salida aceptable. El resolver abre `gap-fixed-wait-N` y el QA
                // decide; aqui simplemente no se emite nada.
                const next = row.actions[index + 1];
                if (action.action === 'ESPERAR' && !next?.variableName) continue;
                const lines = this.actionLines(action, [], 0, { hasTimeout: false, next });
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
            this.locatorValue(selector, request.platform)
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
        const imports = [...new Set([
            ...effectiveKeywords,
            ...(rows.some(row => Boolean(row.dataTable?.headers?.length)) ? ['DataTable'] : []),
        ])].sort();
        const blocks = rows.map((row, index) => {
            const keyword = effectiveKeywords[index];
            const parameters = [...row.text.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)]
                .map(match => match[1]);
            const expression = this.stepExpression(row.text);
            const methodName = scenarioRowMethodName(row, index);
            const dataTableBinding = this.dataTableBinding(row, methodName);
            const args = [
                ...parameters.map(name => `${name}: string`),
                ...(dataTableBinding ? ['dataTable: DataTable'] : []),
            ].join(', ');
            const callArgs = [
                ...parameters,
                ...(dataTableBinding ? [dataTableBinding.callArgument] : []),
            ].join(', ');
            const setup = dataTableBinding
                ? [`    const ${dataTableBinding.callArgument} = ${dataTableBinding.extractExpression};`]
                : [];
            return {
                key: `${keyword}:${expression}`,
                content: [
                `${keyword}(/^${expression}$/, async (${args}) => {`,
                ...setup,
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
        locatorPath?: string,
        reused: Map<string, ReusedLocator> = new Map(),
        existingMethods: Map<number, { name: string; args?: string[] }> = new Map(),
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
        const locatorIdentifier = locatorPath
            ? locatorImportIdentifier(locatorPath)
            : undefined;
        const className = screenObjectNames(screenPath).className;
        // Los reutilizados quedan fuera del bloque propio: se referencian, no se crean.
        const locators = this.collectLocators(rows.flatMap(row => row.actions || []))
            .filter(([name]) => !reused.has(name));
        const androidBlock = locatorBlockName(request.locatorModule, 'android');
        const iosBlock = locatorBlockName(request.locatorModule, 'ios');

        // Un locator reutilizado se referencia en su modulo de origen; copiarlo
        // aqui crearia una segunda fuente de verdad para el mismo elemento.
        const reusedInScreen = [...new Set(
            rows.flatMap(row => row.actions || [])
                .map(action => action.variableName || '')
                .filter(name => reused.has(name))
        )].map(name => reused.get(name)!);

        // Patron documentado del framework: el getter resuelve el locator y
        // devuelve `$(locator)`. Es la forma mayoritaria del repo (601 getters
        // contra 5 que devolvian string) y la que espera el review del PR.
        const getterBody = (
            iosType: string, iosReference: string,
            androidType: string, androidReference: string
        ): string[] => [
            `        const locator = ${contract.locatorFactorySymbol}.getElement(`,
            `            ${contract.typeLocatorSymbol}.${iosType}, ${iosReference},`,
            `            ${contract.typeLocatorSymbol}.${androidType}, ${androidReference}`,
            `        );`,
            `        return $(locator);`,
        ];

        const gettersFor = (name: string): string => {
            const external = reused.get(name);
            if (external) {
                const fallback = external.reference.android || external.reference.ios || '';
                return [
                    `    public get ${name}() {`,
                    ...getterBody(
                        external.type.ios || 'XPATH', external.reference.ios || fallback,
                        external.type.android || 'XPATH', external.reference.android || fallback
                    ),
                    `    }`
                ].join('\n');
            }
            const selector = locators.find(([key]) => key === name)?.[1] || '';
            const activeType = this.locatorType(selector, request.platform);
            const dynamicParameter = selector.match(/\{([A-Za-z_][A-Za-z0-9_]*)\}/)?.[1];
            if (dynamicParameter) {
                return [
                    `    public ${name}(${dynamicParameter}: string) {`,
                    `        const iosValue = ${locatorIdentifier}.${iosBlock}.${name}.replace('{${dynamicParameter}}', ${dynamicParameter});`,
                    `        const androidValue = ${locatorIdentifier}.${androidBlock}.${name}.replace('{${dynamicParameter}}', ${dynamicParameter});`,
                    ...getterBody(
                        request.platform === 'ios' ? activeType : 'XPATH',
                        'iosValue',
                        request.platform === 'android' ? activeType : 'XPATH',
                        'androidValue'
                    ),
                    `    }`
                ].join('\n');
            }
            return [
                `    public get ${name}() {`,
                ...getterBody(
                    request.platform === 'ios' ? activeType : 'XPATH',
                    `${locatorIdentifier}.${iosBlock}.${name}`,
                    request.platform === 'android' ? activeType : 'XPATH',
                    `${locatorIdentifier}.${androidBlock}.${name}`
                ),
                `    }`
            ].join('\n');
        };
        const getters = [
            ...locators.map(([name]) => gettersFor(name)),
            ...reusedInScreen.map(external => gettersFor(external.name)),
        ];

        const hasTimeout = Boolean(contract.timeoutHelperImport && contract.timeoutHelperSymbol);
        const methods = rows.map((row, index) => {
            const parameters = [...row.text.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)>/g)]
                .map(match => match[1]);
            const rowActions = row.actions || [];
            const methodName = scenarioRowMethodName(row, index);
            const dataTableBinding = this.dataTableBinding(row, methodName);
            const args = [
                ...parameters.map(name => `${name}: string`),
                ...(dataTableBinding ? [dataTableBinding.signature] : []),
            ].join(', ');
            const actions = this.methodActions(rowActions, {
                hasTimeout,
                parameters,
                dataTableBinding,
                repetitionExecution: row.repetitionExecution,
                existingMethods,
            });
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
        const body = methods.map(method => method.content).join('\n');
        // El import de @wdio/globals se arma por uso real. `expect` faltaba y
        // cualquier VERIFICAR_TEXTO generaba un Screen Object que no compila.
        const globals = [
            'browser',
            'expect',
            '$',
        ].filter(symbol => symbol === '$'
            ? getters.length > 0
            : new RegExp(`\\b${symbol.replace('$', '\\$')}[.(]`).test(body))
            .sort();
        const usesTimeout = hasTimeout && /\btimeout\b/.test(body);

        return [
            ...(globals.length ? [`import { ${globals.join(', ')} } from '@wdio/globals';`] : []),
            `import ${contract.baseScreenClass} from '${baseImport}';`,
            ...(locators.length > 0 || reusedInScreen.length > 0 ? [
                `import ${contract.locatorFactorySymbol} from '${factoryImport}';`,
                `import { ${contract.typeLocatorSymbol} } from '${enumsImport}';`,
            ] : []),
            ...(locators.length > 0 && locatorImport
                ? [`import ${locatorIdentifier} from '${locatorImport}' with { type: 'json' };`]
                : []),
            // Un import por cada modulo ajeno del que se reutiliza algo.
            ...[...new Map(reusedInScreen.map(external => [external.identifier, external])).values()]
                .map(external =>
                    `import ${external.identifier} from '${external.import}' with { type: 'json' };`),
            ...(usesTimeout
                ? [`import { ${contract.timeoutHelperSymbol} } from '${contract.timeoutHelperImport}';`]
                : []),
            ...(usesTimeout ? ['', `const timeout: number = ${contract.timeoutHelperSymbol}();`] : []),
            '',
            `class ${className} extends ${contract.baseScreenClass} {`,
            ...getters.flatMap(getter => ['', getter]),
            ...methods.flatMap(method => ['', method.content]),
            ...(body.includes('this.readRecordedText(') ? ['', RECORDED_TEXT_READER] : []),
            `}`,
            '',
            `export default new ${className}();`,
            ''
        ].join('\n');
    }

    /**
     * Lineas de un paso dentro del metodo del Screen Object.
     *
     * Con los getters devolviendo `$(locator)` las acciones operan sobre el
     * elemento, que es lo que esperan `waitForElementExistByLocator` y
     * `waitForElementDisplayedAndExpect`. Estas dos son ademas la espera
     * explicita que exige el estandar: ningun `.click()` sale sin una espera
     * delante.
     *
     * `next` es la accion siguiente y existe por `ESPERAR`: una pausa fija esta
     * prohibida, asi que se traduce a esperar explicitamente el elemento que la
     * pausa estaba esperando. Si no hay tal elemento, el resolver abre un gap y
     * aqui no se emite nada — nunca un `browser.pause`.
     */
    private actionLines(
        action: RecordedStep,
        parameters: string[],
        actionIndex: number,
        options: { hasTimeout: boolean; next?: RecordedStep } = { hasTimeout: false }
    ): string[] {
        const dynamicParameter = String(action.selector || '').match(/\{([A-Za-z_][A-Za-z0-9_]*)\}/)?.[1];
        const locator = action.variableName
            ? (dynamicParameter && parameters.includes(dynamicParameter)
                ? `this.${action.variableName}(${dynamicParameter})`
                : `this.${action.variableName}`)
            : undefined;
        const value = this.codeValue(action.value || '', parameters);
        const element = `element${actionIndex + 1}`;
        const ready = (target: string): string =>
            `await this.uiHelper.waitForElementExistByLocator(${target}, true);`;
        /** Espera con asercion: el Then tiene que afirmar, no solo esperar. */
        const displayed = (target: string, message: string): string[] =>
            options.hasTimeout
                ? [`await this.uiHelper.waitForElementDisplayedAndExpect(${target}, timeout, '${message}');`]
                : [ready(target), `await expect(${target}).toBeDisplayed();`];

        switch (action.action) {
            case 'CLICK':
                return locator ? [ready(locator), `await ${locator}.click();`] : [];
            case 'ESCRIBIR':
                return locator ? [ready(locator), `await ${locator}.setValue(${value});`] : [];
            case 'LIMPIAR':
                return locator ? [ready(locator), `await ${locator}.clearValue();`] : [];
            case 'VERIFICAR_TEXTO':
                if (action.textAssertion && locator) {
                    const assertion = parseTextAssertion(action.textAssertion, action.action, action.value)!;
                    return [
                        ...displayed(locator, 'The element to validate was not displayed'),
                        `const actualText${actionIndex + 1} = await this.readRecordedText(await ${locator}, '${assertion.source}');`,
                        `await expect(actualText${actionIndex + 1}).${assertion.operator === 'contains' ? 'toContain' : 'toBe'}(${value});`,
                    ];
                }
                return locator
                    ? [
                        ...displayed(locator, 'The element to validate was not displayed'),
                        `await expect(${locator}).toHaveText(${value});`
                    ]
                    : [];
            case 'VERIFICAR_EXISTE':
                return locator
                    ? displayed(locator, 'The expected element was not displayed')
                    : [];
            case 'VERIFICAR_NO_EXISTE':
                // `isRequired: false` devuelve false al agotar el timeout y
                // propaga cualquier otro error: no se traga fallos de
                // infraestructura como si fueran una ausencia esperada.
                return locator
                    ? [
                        `const ${element} = await this.uiHelper.waitForElementExistByLocator(${locator}, false);`,
                        `await expect(${element}).toBe(false);`
                    ]
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
                        ready(locator),
                        `const ${element} = await ${locator};`,
                        `await browser.execute('mobile: longClickGesture', { elementId: ${element}.elementId });`
                    ]
                    : [];
            case 'VOLVER':
                return ['await browser.back();'];
            case 'ESPERAR': {
                const target = options.next?.variableName;
                return target
                    ? displayed(`this.${target}`, 'The element the wait was anchored to was not displayed')
                    : [];
            }
            case 'SCREENSHOT':
                return [`await browser.saveScreenshot(${value});`];
            case 'ABRIR_APP':
                return [`await browser.activateApp(${value});`];
            default:
                throw new Error(`Acción no soportada para generación: ${action.action}`);
        }
    }

    /**
     * El par (valor, tipo) sale de `locatorStrategy`, no de una copia local.
     * Estaban duplicados y divergieron: el JSON guardaba un valor que el tipo
     * del getter no sabia recomponer.
     */
    private locatorValue(selector: string, platform: MobilePlatform): string {
        return frameworkLocator(selector, platform).value;
    }

    private locatorType(selector: string, platform: MobilePlatform): string {
        return frameworkLocator(selector, platform).type;
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

    private normalizeScenarioRows(
        rows: NonNullable<GenerationRequest['scenarioRows']>,
        preserveDistinctActionLocators = false,
    ): NonNullable<GenerationRequest['scenarioRows']> {
        return rows.map(row => {
            if (!row.dataTable?.headers?.length || !row.actions?.length) return row;
            const repetition = detectRepetition(row.actions);
            if (!repetition || row.dataTable.headers.length !== 1) return row;
            const cycleStart = row.actions.findIndex(action => action.sequence === repetition.startSequence);
            if (cycleStart < 0) return row;
            const loopActions = row.actions.slice(cycleStart, cycleStart + repetition.length);
            if (!loopActions.length) return row;
            const varying = loopActions[repetition.varyingOffset];
            if (!varying) return row;
            // Un ciclo solo puede compactarse sobre un locator parametrizable
            // cuando todas las vueltas representan la misma clave lógica. Si
            // cada opción tiene su propio locator verificado (p.ej. filtros de
            // 7/15/30/90 días), colapsarlas bajo la primera clave elimina
            // trazabilidad y puede convertir un getter reutilizado en una
            // llamada inválida `getter(valor)`.
            const varyingNames = Array.from({ length: repetition.repetitions }, (_, round) =>
                row.actions![cycleStart + round * repetition.length + repetition.varyingOffset]?.variableName || ''
            );
            if (preserveDistinctActionLocators && new Set(varyingNames).size !== 1) return row;
            const parameter = row.dataTable.headers[0];
            if (!parameter) return row;
            const selector = this.selectorTemplate(String(varying.selector || ''), parameter);
            if (!selector) return row;
            const loopStart = cycleStart;
            const postStart = cycleStart + repetition.length * repetition.repetitions;
            const compactActions = [
                ...row.actions.slice(0, cycleStart),
                ...loopActions.map((action, index) =>
                    index === repetition.varyingOffset ? { ...action, selector } : action
                ),
                ...row.actions.slice(postStart),
            ];
            return {
                ...row,
                repetitionExecution: {
                    loopStartIndex: loopStart,
                    loopLength: repetition.length,
                    parameter,
                },
                actions: compactActions,
            };
        });
    }

    private methodActions(
        rowActions: RecordedStep[],
        options: {
            hasTimeout: boolean;
            parameters: string[];
            dataTableBinding?: {
                itemVariable: string;
                callArgument: string;
                signature: string;
                extractExpression: string;
            };
            repetitionExecution?: {
                loopStartIndex: number;
                loopLength: number;
                parameter: string;
            };
            existingMethods: Map<number, { name: string; args?: string[] }>;
        }
    ): string[] {
        // La intención explícita se materializa por acción: no comprimir comparaciones
        // distintas ni heredar una implementación cuya semántica no está probada.
        if (!options.dataTableBinding || !options.repetitionExecution || rowActions.some(action => action.textAssertion)) {
            return rowActions.flatMap((action, actionIndex) =>
                this.existingMethodLines(action, options.existingMethods) || this.actionLines(action, options.parameters, actionIndex, {
                    hasTimeout: options.hasTimeout,
                    next: rowActions[actionIndex + 1],
                })
            );
        }
        const { loopStartIndex, loopLength, parameter } = options.repetitionExecution;
        const pre = rowActions.slice(0, loopStartIndex);
        const loop = rowActions.slice(loopStartIndex, loopStartIndex + loopLength);
        const post = rowActions.slice(loopStartIndex + loopLength);
        const loopVar = options.dataTableBinding.itemVariable;
        const loopParams = [...options.parameters, parameter];
        const preLines = pre.flatMap((action, actionIndex) =>
            this.existingMethodLines(action, options.existingMethods) || this.actionLines(action, options.parameters, actionIndex, {
                hasTimeout: options.hasTimeout,
                next: pre[actionIndex + 1] || loop[0],
            })
        );
        const loopLines = loop.flatMap((action, actionIndex) =>
            this.existingMethodLines(action, options.existingMethods) || this.actionLines(action, loopParams, actionIndex, {
                hasTimeout: options.hasTimeout,
                next: loop[actionIndex + 1] || post[0],
            })
        ).map(line => `    ${line.replace(new RegExp(`\\b${parameter}\\b`, 'g'), loopVar)}`);
        const postLines = post.flatMap((action, actionIndex) =>
            this.existingMethodLines(action, options.existingMethods) || this.actionLines(action, options.parameters, actionIndex, {
                hasTimeout: options.hasTimeout,
                next: post[actionIndex + 1],
            })
        );
        return [
            ...preLines,
            `for (const ${loopVar} of ${options.dataTableBinding.callArgument}) {`,
            ...loopLines,
            `}`,
            ...postLines,
        ];
    }

    private existingMethodLines(
        action: RecordedStep,
        methods: Map<number, { name: string; args?: string[] }>,
    ): string[] | undefined {
        if (action.textAssertion) return undefined;
        const method = methods.get(Number(action.sequence));
        if (!method) return undefined;
        return [`await this.${method.name}(${(method.args || []).join(', ')});`];
    }

    private dataTableBinding(
        row: NonNullable<GenerationRequest['scenarioRows']>[number],
        methodName: string,
    ): {
        itemVariable: string;
        callArgument: string;
        signature: string;
        extractExpression: string;
    } | undefined {
        if (!row.dataTable?.headers?.length) return undefined;
        if (row.dataTable.headers.length !== 1) {
            const rowsName = `${methodName}Rows`;
            return {
                itemVariable: 'row',
                callArgument: rowsName,
                signature: `${rowsName}: Array<Record<string, string>>`,
                extractExpression: 'dataTable.hashes()',
            };
        }
        const header = row.dataTable.headers[0];
        const base = this.safeIdentifier(header, 'rowValue');
        const itemVariable = `${base}Value`;
        const callArgument = `${base}Values`;
        return {
            itemVariable,
            callArgument,
            signature: `${callArgument}: string[]`,
            extractExpression: `dataTable.hashes().map((row) => row[${JSON.stringify(header)}])`,
        };
    }

    private safeIdentifier(source: string, fallback: string): string {
        const normalized = String(source || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Za-z0-9_]+/g, ' ')
            .trim();
        if (!normalized) return fallback;
        const parts = normalized.split(/\s+/);
        const output = parts[0].toLowerCase() + parts.slice(1)
            .map(part => part[0].toUpperCase() + part.slice(1).toLowerCase())
            .join('');
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(output)) return fallback;
        return output;
    }

    private selectorTemplate(selector: string, parameter: string): string | undefined {
        const match = String(selector).match(/(["'])([^"']+)\1/);
        if (!match) return undefined;
        return selector.replace(match[0], `${match[1]}{${parameter}}${match[1]}`);
    }

}
