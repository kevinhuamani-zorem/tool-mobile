import { RecordedStep } from '../core/models';
import { ReuseAnalyzer } from '../core/reuseAnalyzer';
import { sanitizeForAi } from './secretSanitizer';

export interface AiGenerationContext {
    squad: string;
    platform: 'android' | 'ios';
    caseId: string;
    featureHint: string;
    scenarioHint: string;
    actions: {
        index: number;
        action: string;
        logicalLocator?: string;
        value?: string;
        description?: string;
    }[];
    existingDefinitions: {
        squad: string;
        file: string;
        expression: string;
    }[];
    rules: string[];
}

export class GenerationContextBuilder {
    constructor(private readonly reuseAnalyzer = new ReuseAnalyzer()) {}

    build(input: {
        squad: string;
        platform: 'android' | 'ios';
        caseId: string;
        featureName?: string;
        scenarioName?: string;
        actions: RecordedStep[];
    }): AiGenerationContext {
        this.reuseAnalyzer.refresh();
        const definitions = this.reuseAnalyzer.getStepDefinitions()
            .filter(definition =>
                definition.squad === input.squad ||
                definition.squad === 'commons' ||
                definition.squad === 'home'
            )
            .slice(0, 250)
            .map(definition => ({
                squad: definition.squad,
                file: definition.file,
                expression: definition.expression
            }));

        return sanitizeForAi({
            squad: input.squad,
            platform: input.platform,
            caseId: input.caseId,
            featureHint: input.featureName || '',
            scenarioHint: input.scenarioName || '',
            actions: input.actions.map((action, index) => ({
                index,
                action: action.action,
                logicalLocator: action.variableName,
                value: action.value,
                description: action.description
            })),
            existingDefinitions: definitions,
            rules: [
                'Escribe Gherkin en español y desde la perspectiva del usuario.',
                'No incluyas nombres de locators, selectores ni detalles de Appium en el texto.',
                'Cada acción debe aparecer exactamente en una o más líneas mediante actionIndices.',
                'Evita expresiones que coincidan con existingDefinitions.',
                'Usa parámetros <nombre> solo para datos variables.',
                'No reutilices ni modifiques definiciones existentes.',
                'Propón fileName y locatorModule descriptivos en kebab-case.',
                'Propón methodName y locatorName semánticos en camelCase; nunca uses view_93 o nombres por índice.'
            ]
        }) as AiGenerationContext;
    }
}
