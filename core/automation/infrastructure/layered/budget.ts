/**
 * Presupuesto por etapa: objetivo de coste que se reporta, nunca recorta; la sesion solo la corta el hang stop.
 */
import fs from 'fs';
import {
    normalizeAgentOperationalBudgets,
    GenerationPlan,
} from '../../contracts';
import {
    resolveAgentHangStopMs,
} from '../agentRuntimeGuards';
import {
    LayeredGenerationOptions,
} from './roles';
import {
    filesInside,
} from './artifacts';

/**
 * Presupuesto de una etapa: referencia de coste, nunca recorte.
 *
 * La reutilizacion completa la garantiza el resolver, que indexa todo el
 * framework antes de que exista un agente. Lo que llega a cada rol es la
 * decision ya tomada mas la evidencia para escribir codigo; quitar evidencia
 * para cumplir un numero produciria una automatizacion incompleta. Por eso el
 * presupuesto se mide y se reporta, y la sesion solo la corta el hang stop.
 */
export function stageBudget(plan: GenerationPlan, options: LayeredGenerationOptions) {
    const budgets = normalizeAgentOperationalBudgets(plan.budgets);
    return {
        maxDurationMs: budgets.maxDurationMs,
        maxContextBytes: budgets.maxContextBytes,
        hangStopMs: options.timeoutMs || resolveAgentHangStopMs(),
    };
}

export function budgetWarnings(
    agentName: string,
    budget: ReturnType<typeof stageBudget>,
    contextBytes: number,
    durationMs?: number,
): string[] {
    const warnings: string[] = [];
    if (contextBytes > budget.maxContextBytes) {
        warnings.push(
            `${agentName} recibió ${contextBytes} bytes de contexto; el objetivo es ${budget.maxContextBytes}. `
            + 'No se recortó evidencia: costará más tokens.',
        );
    }
    if (durationMs !== undefined && durationMs > budget.maxDurationMs) {
        warnings.push(
            `${agentName} tardó ${Math.round(durationMs)} ms; el objetivo es ${budget.maxDurationMs} ms. `
            + `La sesión solo se corta al hang stop de ${budget.hangStopMs} ms.`,
        );
    }
    return warnings;
}

/** Todo lo que el agente puede leer en su carpeta al arrancar, protocolo incluido. */
export function stageContextBytes(stageDirectory: string): number {
    return filesInside(stageDirectory).reduce((total, file) => total + fs.statSync(file).size, 0);
}
