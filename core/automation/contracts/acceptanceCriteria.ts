import crypto from 'crypto';

/** QA-owned requirements; an agent cannot grant itself verification. */
export interface AcceptanceCriterion {
    id: string;
    description: string;
    critical: boolean;
    kind: 'manual' | 'recorded-assertion' | 'date-range';
    sequence?: number;
    days?: number;
}
export type AcceptanceStatus = 'passed' | 'failed' | 'not-evaluated';
export interface AcceptanceCriterionResult {
    id: string; description: string; critical: boolean; status: AcceptanceStatus;
    message: string; sequence?: number; file?: string;
}
export interface AutomationAssessment {
    schemaVersion: 1;
    artifactHash: string;
    static: { status: 'passed' | 'failed'; errorCount: number };
    acceptance: {
        status: AcceptanceStatus; total: number; passed: number; failed: number; notEvaluated: number;
        rate: number | null; criticalFailures: number; criteria: AcceptanceCriterionResult[];
    };
    functional: { status: 'not-evaluated' };
}

export function acceptanceArtifactHash(files: Array<{ layer: string; path: string; content: string }>): string {
    const values = files.map(({ layer, path, content }) => ({ layer, path, content }))
        .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.layer < b.layer ? -1 : a.layer > b.layer ? 1 : 0);
    return crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

/** Validate before persisting any recording changes; empty is legacy-compatible. */
export function parseAcceptanceCriteria(value: unknown, actions: Array<{ action: string; sequence?: number }>): AcceptanceCriterion[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) throw new Error('Los criterios deben ser una lista.');
    const ids = new Set<string>();
    return value.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)
            || Object.keys(item).some(key => !['id', 'description', 'critical', 'kind', 'sequence', 'days'].includes(key))
            || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id.trim())
            || typeof item.description !== 'string' || !item.description.trim() || typeof item.critical !== 'boolean'
            || !['manual', 'recorded-assertion', 'date-range'].includes(item.kind))
            throw new Error(`El criterio ${index + 1} requiere identidad única, descripción, tipo y prioridad válidos.`);
        ids.add(item.id.trim());
        if (item.kind !== 'manual') {
            const action = actions.find((a, i) => (a.sequence ?? i + 1) === item.sequence);
            if (!Number.isInteger(item.sequence) || item.sequence < 1 || !action || !/^VERIFICAR_/.test(action.action))
                throw new Error(`El criterio ${index + 1} debe asociarse a una verificación grabada vigente.`);
        } else if (item.sequence !== undefined || item.days !== undefined) throw new Error(`El criterio manual ${index + 1} no admite secuencia ni rango.`);
        if (item.kind === 'date-range' && (!Number.isInteger(item.days) || item.days < 1))
            throw new Error(`El criterio ${index + 1} requiere un número positivo de días.`);
        if (item.kind !== 'date-range' && item.days !== undefined) throw new Error(`Solo un criterio de rango admite días.`);
        return { id: item.id.trim(), description: item.description.trim(), critical: item.critical, kind: item.kind,
            ...(item.sequence === undefined ? {} : { sequence: item.sequence }), ...(item.days === undefined ? {} : { days: item.days }) };
    });
}
