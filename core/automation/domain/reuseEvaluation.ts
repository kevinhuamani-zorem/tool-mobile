import { BehaviorReuseReport } from '../contracts';

export interface ReuseEvaluationLabels {
    groups: Array<{ sequences: number[]; expected: 'reuse' | 'create'; method?: string }>;
    qaMinutes?: number;
    qaCorrections?: number;
}

/** Independent expected groups are the denominator, never the resolver's own choices. */
export function evaluateBehaviorReuse(report: BehaviorReuseReport, labels: ReuseEvaluationLabels) {
    if (!labels.groups.length) throw new Error('Se requieren grupos esperados independientes para evaluar reutilización.');
    const seen = new Set<number>();
    for (const group of labels.groups) {
        if (!group.sequences.length || !['reuse', 'create'].includes(group.expected)) throw new Error('Grupo de evaluación inválido.');
        for (const n of group.sequences) {
            if (!Number.isInteger(n) || n < 1 || seen.has(n)) throw new Error('Las secuencias esperadas deben ser positivas y no solaparse.');
            seen.add(n);
        }
    }
    const key = (sequences: number[]) => sequences.join(',');
    let correct = 0, incorrect = 0, missed = 0;
    const eligible = labels.groups.filter(g => g.expected === 'reuse').length;
    for (const group of labels.groups) {
        const decisions = report.decisions.filter(d => d.sequences.some(n => group.sequences.includes(n)));
        const exact = decisions.length === 1 && key(decisions[0].sequences) === key(group.sequences) ? decisions[0] : undefined;
        const reused = decisions.some(d => d.kind !== 'create');
        const valid = exact && exact.kind !== 'create' && (!group.method || exact.method === group.method);
        if (group.expected === 'reuse' && valid) correct++;
        else if (reused) incorrect++;
        if (group.expected === 'reuse' && !valid) missed++;
    }
    const unlabelled = report.decisions.filter(d => d.sequences.some(n => !seen.has(n))).length;
    return { eligibleGroups: eligible, correctlyReused: correct, incorrectlyReused: incorrect,
        missedReuse: missed, unlabelledDecisions: unlabelled,
        reuseRate: eligible ? correct / eligible : null,
        qaMinutes: labels.qaMinutes ?? null, qaCorrections: labels.qaCorrections ?? null,
        deviceExecution: 'not-evaluated', goldenApproval: 'not-granted' };
}
