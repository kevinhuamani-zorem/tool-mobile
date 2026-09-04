/**
 * Familia gaps: cada gap abierto por el preprocesador tiene que volver con una
 * decision, y un gap que quedo sin resolver tiene que declarar su causa.
 * Cierra con la trazabilidad: ninguna accion grabada puede quedar sin trace.
 */
import { ResponseRuleContext, RuleReport } from './ruleContext';

export function gapRules(context: ResponseRuleContext, report: RuleReport): void {
    const { scenario, plan, response } = context;
    const { errors, warnings } = report;
    const resolutionByGap = new Map<string, { gapId: string; decision: string; reason?: string }>();
    for (const resolution of response.resolutions) {
        if (!resolutionByGap.has(resolution.gapId)) resolutionByGap.set(resolution.gapId, resolution);
    }
    for (const gapId of plan.unresolvedGapIds) {
        const resolution = resolutionByGap.get(gapId);
        if (!resolution) {
            errors.push({
                code: 'missing-gap-resolution',
                message: `Falta resolución para gap abierto: ${gapId}`,
            });
            continue;
        }
        if (!String(resolution.decision || '').trim()) {
            errors.push({
                code: 'gap-resolution-decision',
                message: `La resolución de ${gapId} no declara decisión.`,
            });
            continue;
        }
        const unresolvedDecision = /^(unresolved|failed|error|blocked|not-resolved)$/i
            .test(String(resolution.decision || '').trim());
        if (unresolvedDecision && !String(resolution.reason || '').trim()) {
            errors.push({
                code: 'unresolved-gap-without-reason',
                message: `El gap ${gapId} quedó no resuelto sin causa explícita.`,
            });
        }
    }
    const traced = new Set(response.actionTrace.map(item => item.sequence));
    for (const action of scenario.actions) {
        if (!traced.has(action.sequence)) errors.push({ code: 'trace', message: `Acción ${action.sequence} sin trazabilidad` });
    }
}
