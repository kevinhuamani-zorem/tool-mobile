export interface LinkedScenarioRow {
    text: string;
    actionIndices: number[];
}

export interface GenerationQualityMetrics {
    actionCoverage: number;
    invalidActionIndices: number[];
    linkedRows: number;
    totalRows: number;
    duplicateRows: number;
    qualityScore: number;
    passed: boolean;
}

/** Métricas deterministas y locales para validar el enlazado antes de generar. */
export function calculateGenerationQuality(
    rows: LinkedScenarioRow[],
    actionCount: number
): GenerationQualityMetrics {
    const count = Number.isSafeInteger(actionCount) && actionCount > 0 ? actionCount : 0;
    const validIndex = (index: number) => Number.isInteger(index) && index >= 0 && index < count;
    const indices = rows.flatMap(row => row.actionIndices);
    const invalidActionIndices = indices.filter(index => !validIndex(index));
    const linkedActions = new Set(indices.filter(validIndex));
    const normalizedRows = rows.map(row => row.text.toLowerCase().replace(/\s+/g, ' ').trim());
    const duplicateRows = normalizedRows.length - new Set(normalizedRows).size;
    const actionCoverage = count === 0 ? 0 : linkedActions.size / count;
    const linkedRows = rows.filter(row => row.actionIndices.some(validIndex)).length;
    const rowCoverage = rows.length === 0 ? 0 : linkedRows / rows.length;
    const qualityScore = Math.max(
        0,
        Math.round((actionCoverage * 0.6 + rowCoverage * 0.4 - duplicateRows * 0.15) * 100)
    );
    return {
        actionCoverage,
        invalidActionIndices,
        linkedRows,
        totalRows: rows.length,
        duplicateRows,
        qualityScore,
        passed: actionCoverage === 1 && rowCoverage === 1 && duplicateRows === 0 && invalidActionIndices.length === 0
    };
}
