import { RecordedStep } from '../core/models';
import { CodeGraph, CodeSubgraph } from '../core/codeGraph';
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
    approvedScenarioRows: {
        keyword: string;
        text: string;
        actionIndices: number[];
    }[];
    existingDefinitions: {
        squad: string;
        file: string;
        expression: string;
    }[];
    codeGraph: {
        nodes: CodeSubgraph['nodes'];
        edges: CodeSubgraph['edges'];
        metrics: CodeSubgraph['metrics'];
    };
    rules: string[];
}

export class GenerationContextBuilder {
    constructor(private readonly codeGraph = new CodeGraph()) {}

    build(input: {
        squad: string;
        platform: 'android' | 'ios';
        caseId: string;
        featureName?: string;
        scenarioName?: string;
        actions: RecordedStep[];
        scenarioRows?: {
            keyword: string;
            text: string;
            actionIndices: number[];
        }[];
    }): AiGenerationContext {
        const subgraph = this.codeGraph.query({
            squad: input.squad,
            actions: input.actions,
            limit: 80
        });
        const definitions = subgraph.nodes
            .filter(node => node.type === 'stepDefinition')
            .map(node => ({
                squad: node.squad,
                file: node.file,
                expression: node.text || node.name
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
            approvedScenarioRows: (input.scenarioRows || []).map(row => ({
                keyword: row.keyword,
                text: row.text,
                actionIndices: row.actionIndices
            })),
            existingDefinitions: definitions,
            codeGraph: subgraph,
            rules: [
                'Escribe Gherkin en español y desde la perspectiva del usuario.',
                'No incluyas nombres de locators, selectores ni detalles de Appium en el texto.',
                'Cada acción debe aparecer exactamente en una o más líneas mediante actionIndices.',
                'Evita expresiones que coincidan con existingDefinitions.',
                'Usa parámetros <nombre> solo para datos variables.',
                'No reutilices ni modifiques definiciones existentes.',
                'Si approvedScenarioRows contiene líneas, conserva exactamente su keyword, texto, orden y actionIndices.',
                'En ese caso usa rows únicamente para asignar methodName semánticos a las líneas aprobadas.',
                'Propón fileName y locatorModule descriptivos en kebab-case.',
                'Propón methodName y locatorName semánticos en camelCase; nunca uses view_93 o nombres por índice.'
            ]
        }) as AiGenerationContext;
    }
}
