/**
 * Lecturas del modulo de locators propuesto: valores por bloque, diferencia
 * contra el baseline y los predicados que responden si una clave existe, si el
 * modulo quedo vacio y si el caso reutiliza todo lo grabado.
 *
 * Son consultas puras sobre el JSON de la respuesta; las reglas que las usan
 * viven en `locatorContractRules`, `updateSafetyRules` y
 * `frameworkCollisionRules`.
 */
import {
    AutomationAgentResponse,
    AutomationScenario,
    GenerationPlan,
} from '../../../automation/contracts';

export function responseLocatorValues(content: string): Array<{ blockName: string; name: string; selector: string }> {
    try {
        const document = JSON.parse(content) as Record<string, unknown>;
        return Object.entries(document).flatMap(([blockName, block]) =>
            blockName !== '_metadata' &&
            block && typeof block === 'object' && !Array.isArray(block)
                ? Object.entries(block as Record<string, unknown>)
                    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1].trim()))
                    .map(([name, selector]) => ({ blockName, name, selector }))
                : []
        );
    } catch {
        return [];
    }
}

export function changedLocatorValues(
    content: string,
    baseline?: string,
): Array<{ blockName: string; name: string; selector: string }> {
    const current = responseLocatorValues(content);
    if (!baseline) return current;
    const inherited = new Map(responseLocatorValues(baseline)
        .map(entry => [`${entry.blockName}\u0000${entry.name}`, entry.selector]));
    return current.filter(entry =>
        inherited.get(`${entry.blockName}\u0000${entry.name}`) !== entry.selector
    );
}

export function hasLocatorKeyForPlatform(content: string, name: string, platform: 'android' | 'ios'): boolean {
    try {
        const document = JSON.parse(content) as Record<string, unknown>;
        const suffix = platform.toLowerCase();
        return Object.entries(document).some(([blockName, block]) =>
            blockName !== '_metadata'
            && blockName.toLowerCase().endsWith(suffix)
            && block
            && typeof block === 'object'
            && !Array.isArray(block)
            && Object.prototype.hasOwnProperty.call(block as Record<string, unknown>, name)
        );
    } catch {
        return false;
    }
}

export function completionTarget(
    plan: GenerationPlan,
    completion: { file: string; name: string; platform: 'android' | 'ios'; sequence: number },
) {
    const targets = plan.resolutions
        .find(resolution => resolution.sequence === completion.sequence)
        ?.completionTargets?.filter(target =>
            target.file === completion.file
            && target.name === completion.name
            && target.platform === completion.platform
            && target.block.toLowerCase().endsWith(completion.platform)
        ) || [];
    return targets.length === 1 ? targets[0] : undefined;
}

export function hasNoLocatorEntries(content: string): boolean {
    try {
        const document = JSON.parse(content) as Record<string, unknown>;
        return Object.entries(document)
            .filter(([name]) => name !== '_metadata')
            .every(([, block]) =>
                Boolean(block) &&
                typeof block === 'object' &&
                !Array.isArray(block) &&
                Object.keys(block as Record<string, unknown>).length === 0
            );
    } catch {
        return false;
    }
}

export function reusesEveryRecordedLocator(
    scenario: AutomationScenario,
    plan: GenerationPlan,
    response: AutomationAgentResponse
): boolean {
    if ((response.completions || []).length > 0) return false;
    const locatorSequences = scenario.actions
        .filter(action => Boolean(action.selector?.trim()))
        .map(action => action.sequence);
    if (locatorSequences.length === 0) return false;
    const resolutions = new Map(plan.resolutions.map(item => [item.sequence, item.resolution]));
    return locatorSequences.every(sequence => resolutions.get(sequence) === 'reuse');
}
