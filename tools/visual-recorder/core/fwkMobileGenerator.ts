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
}

export interface GeneratedPreview {
    featurePath: string;
    locatorPath?: string;
    featureContent: string;
    locatorContent?: string;
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
        const locatorPath = locatorEntries.length > 0
            ? path.join(
                projectPaths.locators,
                normalized.squad,
                `${normalized.locatorModule}.locator.json`
            )
            : undefined;

        const featureContent = this.buildFeature(normalized, steps);
        const locatorContent = locatorPath
            ? JSON.stringify({
                [locatorBlockName(normalized.locatorModule, normalized.platform)]:
                    Object.fromEntries(locatorEntries)
            }, null, 4) + '\n'
            : undefined;

        return {
            featurePath,
            locatorPath,
            featureContent,
            locatorContent,
            files: [featurePath, ...(locatorPath ? [locatorPath] : [])]
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
        const lines = [
            `# Generado por Appium Visual Recorder`,
            `# locator-module: ${request.squad}/${request.locatorModule}`,
            '',
            `Feature: ${request.featureName}`,
            '',
            `  @${request.tag}`,
            `  Scenario${outline ? ' Outline' : ''}: [${request.caseId}][${request.pathType}][AUTO-FRONT] ${request.scenarioName}`,
            ...steps.map((step, index) => `    ${toGherkinLine(step, index)}`)
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
}
