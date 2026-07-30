import { RecordedStep } from '../core/models';

export type GherkinKeyword = 'Given' | 'When' | 'Then' | 'And' | 'But';

export interface AiGenerationPlan {
    featureName: string;
    scenarioName: string;
    fileName: string;
    locatorModule: string;
    rows: {
        keyword: GherkinKeyword;
        text: string;
        actionIndices: number[];
        methodName: string;
    }[];
    actionNames: {
        actionIndex: number;
        locatorName?: string;
    }[];
    assumptions: string[];
    warnings: string[];
}

export interface AiPlanMetrics {
    actionCoverage: number;
    linkedRows: number;
    totalRows: number;
    duplicateRows: number;
    qualityScore: number;
    passed: boolean;
}

const keywords = new Set<GherkinKeyword>(['Given', 'When', 'Then', 'And', 'But']);
const identifier = /^[a-z][A-Za-z0-9]*$/;
const fileSegment = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const actionsWithoutLocator = new Set([
    'ABRIR_APP', 'SCROLL_DOWN', 'SCROLL_UP', 'SWIPE', 'VOLVER', 'ESPERAR', 'SCREENSHOT'
]);

export function validateGenerationPlan(
    value: unknown,
    actions: RecordedStep[]
): AiGenerationPlan {
    if (!value || typeof value !== 'object') throw new Error('Gemini no devolvió un plan');
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.featureName !== 'string' || !candidate.featureName.trim()) {
        throw new Error('La propuesta no contiene Feature');
    }
    if (typeof candidate.scenarioName !== 'string' || !candidate.scenarioName.trim()) {
        throw new Error('La propuesta no contiene Scenario');
    }
    if (typeof candidate.fileName !== 'string' || !fileSegment.test(candidate.fileName)) {
        throw new Error('La propuesta no contiene un nombre de archivo kebab-case válido');
    }
    if (typeof candidate.locatorModule !== 'string' || !fileSegment.test(candidate.locatorModule)) {
        throw new Error('La propuesta no contiene un módulo de locators kebab-case válido');
    }
    if (!Array.isArray(candidate.rows) || candidate.rows.length === 0) {
        throw new Error('La propuesta no contiene líneas Gherkin');
    }

    const rows = candidate.rows.map((rawRow, rowIndex) => {
        if (!rawRow || typeof rawRow !== 'object') {
            throw new Error(`La línea ${rowIndex + 1} no es válida`);
        }
        const row = rawRow as Record<string, unknown>;
        if (!keywords.has(row.keyword as GherkinKeyword)) {
            throw new Error(`Keyword inválido en la línea ${rowIndex + 1}`);
        }
        const text = typeof row.text === 'string' ? row.text.trim() : '';
        if (!text) throw new Error(`Texto vacío en la línea ${rowIndex + 1}`);
        if (/\{[^{}]+\}/.test(text)) {
            throw new Error(`La línea ${rowIndex + 1} expone un locator en el Gherkin`);
        }
        if (!Array.isArray(row.actionIndices) || row.actionIndices.length === 0) {
            throw new Error(`La línea ${rowIndex + 1} no está enlazada a una acción`);
        }
        const methodName = typeof row.methodName === 'string' ? row.methodName.trim() : '';
        if (!identifier.test(methodName)) {
            throw new Error(`Nombre de método inválido en la línea ${rowIndex + 1}`);
        }
        const actionIndices = [...new Set(row.actionIndices.map(index => Number(index)))];
        if (actionIndices.some(index =>
            !Number.isInteger(index) || index < 0 || index >= actions.length
        )) {
            throw new Error(`La línea ${rowIndex + 1} referencia una acción inexistente`);
        }
        return {
            keyword: row.keyword as GherkinKeyword,
            text,
            actionIndices,
            methodName
        };
    });

    if (!Array.isArray(candidate.actionNames)) {
        throw new Error('La propuesta no contiene nombres para las acciones');
    }
    const actionNames = candidate.actionNames.map((rawName, index) => {
        if (!rawName || typeof rawName !== 'object') {
            throw new Error(`Nombre de acción inválido en la posición ${index + 1}`);
        }
        const name = rawName as Record<string, unknown>;
        const actionIndex = Number(name.actionIndex);
        if (!Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex >= actions.length) {
            throw new Error(`La propuesta nombra una acción inexistente`);
        }
        const locatorName = typeof name.locatorName === 'string'
            ? name.locatorName.trim()
            : undefined;
        if (!actionsWithoutLocator.has(actions[actionIndex].action)) {
            if (!locatorName || !identifier.test(locatorName)) {
                throw new Error(`La acción ${actionIndex + 1} requiere un locator camelCase válido`);
            }
        } else if (locatorName && !identifier.test(locatorName)) {
            throw new Error(`Locator inválido en la acción ${actionIndex + 1}`);
        }
        return { actionIndex, ...(locatorName ? { locatorName } : {}) };
    });
    if (new Set(actionNames.map(item => item.actionIndex)).size !== actions.length) {
        throw new Error('Gemini debe nombrar cada acción exactamente una vez');
    }

    return {
        featureName: candidate.featureName.trim(),
        scenarioName: candidate.scenarioName.trim(),
        fileName: candidate.fileName,
        locatorModule: candidate.locatorModule,
        rows,
        actionNames,
        assumptions: Array.isArray(candidate.assumptions)
            ? candidate.assumptions.filter(item => typeof item === 'string').map(String)
            : [],
        warnings: Array.isArray(candidate.warnings)
            ? candidate.warnings.filter(item => typeof item === 'string').map(String)
            : []
    };
}

export function calculatePlanMetrics(
    plan: AiGenerationPlan,
    actionCount: number
): AiPlanMetrics {
    const linkedActions = new Set(plan.rows.flatMap(row => row.actionIndices));
    const normalizedRows = plan.rows.map(row => row.text.toLowerCase().replace(/\s+/g, ' '));
    const duplicateRows = normalizedRows.length - new Set(normalizedRows).size;
    const actionCoverage = actionCount === 0 ? 0 : linkedActions.size / actionCount;
    const linkedRows = plan.rows.filter(row => row.actionIndices.length > 0).length;
    const rowCoverage = plan.rows.length === 0 ? 0 : linkedRows / plan.rows.length;
    const qualityScore = Math.max(
        0,
        Math.round((actionCoverage * 0.6 + rowCoverage * 0.4 - duplicateRows * 0.15) * 100)
    );
    return {
        actionCoverage,
        linkedRows,
        totalRows: plan.rows.length,
        duplicateRows,
        qualityScore,
        passed: actionCoverage === 1 && rowCoverage === 1 && duplicateRows === 0
    };
}

export const generationPlanResponseSchema = {
    type: 'OBJECT',
    required: [
        'featureName', 'scenarioName', 'fileName', 'locatorModule',
        'rows', 'actionNames', 'assumptions', 'warnings'
    ],
    properties: {
        featureName: { type: 'STRING' },
        scenarioName: { type: 'STRING' },
        fileName: { type: 'STRING' },
        locatorModule: { type: 'STRING' },
        rows: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                required: ['keyword', 'text', 'actionIndices', 'methodName'],
                properties: {
                    keyword: {
                        type: 'STRING',
                        enum: ['Given', 'When', 'Then', 'And', 'But']
                    },
                    text: { type: 'STRING' },
                    actionIndices: {
                        type: 'ARRAY',
                        items: { type: 'INTEGER' }
                    },
                    methodName: { type: 'STRING' }
                }
            }
        },
        actionNames: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                required: ['actionIndex'],
                properties: {
                    actionIndex: { type: 'INTEGER' },
                    locatorName: { type: 'STRING' }
                }
            }
        },
        assumptions: { type: 'ARRAY', items: { type: 'STRING' } },
        warnings: { type: 'ARRAY', items: { type: 'STRING' } }
    }
} as const;
