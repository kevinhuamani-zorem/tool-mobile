/**
 * Contrato comun de las familias de reglas del validador de respuestas del
 * agente.
 *
 * Cada familia es una funcion `(context, report) => void` que solo agrega
 * errores y advertencias al reporte. El orden de las reglas lo fija
 * `AutomationResponseValidator`, y ese orden importa: la deduplicacion final
 * conserva la primera aparicion de cada `(code, message, file)`.
 */
import {
    AutomationAgentResponse,
    AutomationScenario,
    AutomationValidation,
    GenerationPlan,
} from '../../../automation/contracts';
import { GeneratedPreview } from '../../../generation';
import { ReuseAnalyzer } from '../../../indexing';
import { OutputValidator } from '../outputValidator';

/** Acumulador que comparten todas las familias durante una validacion. */
export interface RuleReport {
    errors: AutomationValidation['errors'];
    warnings: string[];
}

/** Lo que toda familia puede leer: la grabacion, el plan y la respuesta. */
export interface ResponseRuleContext {
    scenario: AutomationScenario;
    plan: GenerationPlan;
    response: AutomationAgentResponse;
    /** `RECORDER_AGENT_RELAXED_CONTRACT=1`: modo experimental del QA. */
    relaxedContract: boolean;
}

/**
 * Lo que ademas leen las familias que corren sobre el preview ya construido.
 *
 * `updateBaselines`, `reusesScreenWithoutChanges` y `definitions` se derivan
 * una sola vez porque varias familias los consultan.
 */
export interface PreviewRuleContext extends ResponseRuleContext {
    preview: GeneratedPreview;
    updateBaselines: Map<string, string>;
    reusesScreenWithoutChanges: boolean;
    definitions: string[];
    outputValidator: OutputValidator;
    reuseAnalyzer: ReuseAnalyzer;
}

export type ResponseRule = (context: ResponseRuleContext, report: RuleReport) => void;
export type PreviewRule = (context: PreviewRuleContext, report: RuleReport) => void;

export function unexpectedFields(value: object, allowed: string[]): string[] {
    const accepted = new Set(allowed);
    return Object.keys(value).filter(key => !accepted.has(key));
}

export function groupRepairErrors(
    errors: Array<{ code: string; message: string; file?: string }>,
): NonNullable<AutomationValidation['repairContext']>['groups'] {
    const groups = new Map<string, {
        code: string;
        file?: string;
        count: number;
        messages: string[];
    }>();
    for (const error of errors) {
        const key = `${error.code}\u0000${error.file || ''}`;
        const group = groups.get(key) || {
            code: error.code,
            ...(error.file ? { file: error.file } : {}),
            count: 0,
            messages: [],
        };
        group.count += 1;
        if (!group.messages.includes(error.message) && group.messages.length < 3) {
            group.messages.push(error.message);
        }
        groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) =>
        right.count - left.count || left.code.localeCompare(right.code)
    );
}
