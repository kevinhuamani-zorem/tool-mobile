import fs from 'fs';
import path from 'path';
import { GeneratedPreview, GenerationRequest } from './fwkMobileGenerator';
import { RecordedStep, toGherkinLine } from './models';
import { projectPaths } from './projectPaths';

function safeName(value: string): string {
    const normalized = value.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!normalized) throw new Error('Nombre de exportación neutral inválido');
    return normalized;
}

export class NeutralGenerator {
    preview(request: GenerationRequest, steps: RecordedStep[]): GeneratedPreview {
        if (!steps.length) throw new Error('No hay acciones grabadas');
        const name = safeName(request.fileName || request.scenarioName);
        const featurePath = path.join(projectPaths.neutralExports, `${name}.feature`);
        const recordingPath = path.join(projectPaths.neutralExports, `${name}.recording.json`);
        const scenarioRows = request.scenarioRows?.length
            ? request.scenarioRows.map(row => `    ${row.keyword} ${row.text}`)
            : steps.map((step, index) => `    ${toGherkinLine(step, index)}`);
        const featureContent = [
            '# Exportación neutral de Appium Visual Recorder',
            `Feature: ${request.featureName}`,
            '',
            `  @${request.tag}`,
            `  Scenario: [${request.caseId}][${request.pathType}][AUTO-FRONT] ${request.scenarioName}`,
            ...scenarioRows,
            ''
        ].join('\n');
        const recordingContent = JSON.stringify({
            schemaVersion: 1,
            exportedAt: new Date().toISOString(),
            platform: request.platform,
            metadata: {
                featureName: request.featureName,
                scenarioName: request.scenarioName,
                caseId: request.caseId,
                pathType: request.pathType,
                tag: request.tag
            },
            scenarioRows: request.scenarioRows || [],
            actions: steps
        }, null, 2) + '\n';
        return {
            featurePath,
            locatorPath: recordingPath,
            featureContent,
            locatorContent: recordingContent,
            files: [featurePath, recordingPath]
        };
    }

    generate(
        request: GenerationRequest,
        steps: RecordedStep[],
        reviewedContents?: Record<string, string>
    ): GeneratedPreview {
        const preview = this.withReviewedContents(this.preview(request, steps), reviewedContents);
        fs.mkdirSync(projectPaths.neutralExports, { recursive: true });
        const outputs = [
            [preview.featurePath, preview.featureContent],
            [preview.locatorPath!, preview.locatorContent!]
        ] as const;
        for (const [file, content] of outputs) {
            if (fs.existsSync(file)) throw new Error(`La exportación ya existe: ${file}`);
            fs.writeFileSync(file, content, { flag: 'wx' });
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
        return {
            ...preview,
            featureContent: Object.prototype.hasOwnProperty.call(
                reviewedContents,
                preview.featurePath
            ) ? String(reviewedContents[preview.featurePath]) : preview.featureContent,
            locatorContent: preview.locatorPath && Object.prototype.hasOwnProperty.call(
                reviewedContents,
                preview.locatorPath
            ) ? String(reviewedContents[preview.locatorPath]) : preview.locatorContent
        };
    }
}
