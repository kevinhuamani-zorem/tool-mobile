import * as fs from 'fs';
import * as path from 'path';
import { RecordedStep, toGherkinLine } from '../../core/models';

export class FeatureGenerator {
    constructor(
        private featuresPath: string,
        private locatorsPath: string
    ) {}

    generate(featureName: string, scenarioName: string, steps: RecordedStep[]): string {
        fs.mkdirSync(this.featuresPath, { recursive: true });
        const fileName = featureName.toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9_]/g, '');
        const filePath = path.join(this.featuresPath, `${fileName}.feature`);
        fs.writeFileSync(filePath, this.buildContent(featureName, scenarioName, steps), 'utf-8');
        console.log('[FeatureGenerator] Generado:', filePath);
        return filePath;
    }

    preview(featureName: string, scenarioName: string, steps: RecordedStep[]): string {
        return this.buildContent(featureName, scenarioName, steps);
    }

    private buildContent(featureName: string, scenarioName: string, steps: RecordedStep[]): string {
        const date = new Date().toLocaleString('es-PE');
        return [
            `# Generado por Appium Visual Recorder`,
            `# Fecha: ${date}`,
            `# locator-module: global`,
            `# Locators: ${this.locatorsPath}`,
            '',
            `Feature: ${featureName}`,
            '',
            `  Scenario: ${scenarioName}`,
            ...steps.map((s, i) => `    ${toGherkinLine(s, i)}`),
            ''
        ].join('\n');
    }
}
