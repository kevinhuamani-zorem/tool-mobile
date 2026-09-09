import type { LayeredAgentResult } from '../../domain/layeredGenerationContracts';
import type { RepairIssue } from './roles';

type AuthorTrace = Pick<LayeredAgentResult, 'actionTrace' | 'files'>;

/**
 * Lorem owns the Gherkin/Steps interface; Zorem owns its locator bindings.
 * Match by sequence and method, never by array position or a similar name.
 * The official validator still checks every selected locator against the plan
 * and the actual Screen. Neither author output is mutated.
 */
export function assembleActionTrace(behavior: AuthorTrace, interaction: AuthorTrace): {
    actionTrace: LayeredAgentResult['actionTrace']; errors: RepairIssue[];
} {
    const errors: RepairIssue[] = [];
    const file = interaction.files.find(item => item.layer === 'screen')?.path;
    const interactionBySequence = new Map<number, LayeredAgentResult['actionTrace']>();
    for (const trace of interaction.actionTrace) {
        const group = interactionBySequence.get(trace.sequence) || [];
        group.push(trace);
        interactionBySequence.set(trace.sequence, group);
    }
    const fail = (sequence: number, reason: string): void => {
        errors.push({ code: 'interaction-trace', file,
            message: `La acción ${sequence}: ${reason}. Zorem debe conservar la secuencia y el screenMethod de Lorem y declarar su locatorName.` });
    };
    for (const [sequence, traces] of interactionBySequence) {
        if (traces.length !== 1) fail(sequence, 'Zorem entregó más de una traza');
        else if (!behavior.actionTrace.some(trace => trace.sequence === sequence)) {
            fail(sequence, 'la traza de Zorem no tiene una acción correspondiente en Lorem');
        }
    }
    const actionTrace = behavior.actionTrace.map(trace => {
        const matches = interactionBySequence.get(trace.sequence) || [];
        if (matches.length !== 1) return { ...trace };
        const binding = matches[0];
        if (binding.screenMethod !== trace.screenMethod) {
            fail(trace.sequence, `el screenMethod de Zorem (${binding.screenMethod || 'ausente'}) no coincide con ${trace.screenMethod || 'el método ausente de Lorem'}`);
            return { ...trace };
        }
        // Older/deterministic interaction outputs may omit the locator field.
        // Keep the existing trace then; never infer a missing action or selector.
        return binding.locatorName?.trim()
            ? { ...trace, locatorName: binding.locatorName }
            : { ...trace };
    });
    return { actionTrace, errors };
}
