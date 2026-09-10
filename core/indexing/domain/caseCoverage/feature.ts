/** Deliberately bounded Gherkin reader. Unsupported syntax never becomes proof. */
export interface CoverageStep { text: string; index: number; unsupported?: boolean }
export interface CoverageScenario { steps: CoverageStep[]; rows: Record<string, string>[]; problem?: string }

function cells(line: string): string[] | undefined {
    if (!line.trim().startsWith('|') || !line.trim().endsWith('|')) return undefined;
    const result: string[] = [];
    let value = '';
    let escaped = false;
    for (const char of line.trim().slice(1, -1)) {
        if (escaped) { value += char === 'n' ? '\n' : char; escaped = false; }
        else if (char === '\\') escaped = true;
        else if (char === '|') { result.push(value.trim()); value = ''; }
        else value += char;
    }
    if (escaped) return undefined;
    result.push(value.trim());
    return result;
}

export function readCoverageScenario(source: string, caseId: string): { scenario?: CoverageScenario; count: number; problem?: string } {
    const background: CoverageStep[] = [];
    const scenarios: Array<CoverageScenario & { id?: string; outline: boolean }> = [];
    let current: typeof scenarios[number] | undefined;
    let inBackground = false;
    let inExamples = false;
    let columns: string[] | undefined;
    let unsupported = false;
    for (const line of source.split(/\r?\n/)) {
        if (/^\s*(?:Rule|Regla):/i.test(line)) unsupported = true;
        if (/^\s*(?:Background|Antecedentes):/i.test(line)) { inBackground = true; current = undefined; inExamples = false; continue; }
        const header = line.match(/^\s*(Scenario(?: Outline| Template)?|Escenario|Esquema del escenario):\s*(.+)$/i);
        if (header) {
            current = { id: header[2].match(/\[(TC-\d+)\]/i)?.[1].toUpperCase(), outline: /Outline|Template|Esquema/i.test(header[1]), steps: background.map(step => ({ ...step })), rows: [] };
            scenarios.push(current); inBackground = false; inExamples = false; columns = undefined; continue;
        }
        if (/^\s*(?:Examples|Ejemplos):/i.test(line)) { inExamples = true; columns = undefined; continue; }
        if (inExamples && current && /^\s*\|/.test(line)) {
            const row = cells(line);
            if (!row) { current.problem = 'unsupported-examples'; continue; }
            if (!columns) {
                columns = row;
                if (new Set(columns).size !== columns.length || columns.some(column => !column)) current.problem = 'unsupported-examples';
            } else if (row.length !== columns.length) current.problem = 'unsupported-examples';
            else current.rows.push(Object.fromEntries(columns.map((column, index) => [column, row[index]])));
            continue;
        }
        const step = line.match(/^\s*(?:Given|When|Then|And|But|Dado|Dada|Cuando|Entonces|Y|Pero|\*)\s+(.+)$/i);
        if (step && !inExamples) {
            const target = inBackground ? background : current?.steps;
            if (target) target.push({ text: step[1].trim(), index: target.length + 1 });
        } else if (/^\s*(?:\||"""|```)/.test(line) && !inExamples) {
            const target = inBackground ? background : current?.steps;
            if (target?.length) target[target.length - 1].unsupported = true;
        }
    }
    const matches = scenarios.filter(scenario => scenario.id === caseId.toUpperCase());
    if (matches.length !== 1) return { count: matches.length };
    const scenario = matches[0];
    if (!scenario.rows.length) {
        if (scenario.outline) scenario.problem = 'missing-examples';
        else scenario.rows = [{}];
    }
    if (unsupported) scenario.problem = 'unsupported-feature-scope';
    if (!scenario.steps.length) scenario.problem = 'missing-steps';
    return { scenario, count: 1 };
}

export function expandCoverageStep(step: CoverageStep, row: Record<string, string>): string | undefined {
    if (step.unsupported) return undefined;
    let missing = false;
    const text = step.text.replace(/<([^>]+)>/g, (_, key: string) => {
        if (!Object.prototype.hasOwnProperty.call(row, key)) { missing = true; return ''; }
        return row[key];
    });
    return missing ? undefined : text;
}
