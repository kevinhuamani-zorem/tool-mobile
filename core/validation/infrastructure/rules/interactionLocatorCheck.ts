/** Portable author checks: only supplied evidence and the validator's AST readers. */
import type { FrameworkContract } from '../../../workspace';
import { screenLocatorTypes, ScreenLocatorBinding } from './screenLocatorTypes';
import { screenMethodGetterUsage } from './screenMethodUsage';

export interface InteractionLocatorEvidence {
    platform: 'android' | 'ios';
    contract: Pick<FrameworkContract, 'locatorFactoryImport' | 'locatorFactorySymbol' |
        'typeLocatorImport' | 'typeLocatorSymbol' | 'locatorSignature'>;
    actions: Array<{
        sequence: number; action: string; resolution: string; locatorName?: string;
        primary?: { locatorType: string; locatorValue: string; selector: string };
        reuseCandidates?: Array<{ name: string }>;
    }>;
}

interface InteractionResult {
    files: Array<{ layer: string; path: string; content: string }>;
    actionTrace: Array<{ sequence: number; locatorName?: string; screenMethod?: string }>;
    completions?: Array<{ sequence: number }>;
}

/**
 * No filesystem, framework discovery, output correction or other author's layers.
 * Return/expect and text assertions need the final Steps; integration retains that
 * responsibility. These checks still validate their getter's exact recorded pair.
 */
export function interactionLocatorProblems(evidence: InteractionLocatorEvidence, result: InteractionResult) {
    const errors: Array<{ code: string; message: string; file?: string }> = [];
    const notes: string[] = [];
    const screen = result.files.find(file => file.layer === 'screen');
    if (!screen || !evidence.actions.length) return { errors, notes };
    const className = screen.content.match(/\bclass\s+([A-Za-z_$][\w$]*)\s+extends\s+/)?.[1] || '';
    const bindings: ScreenLocatorBinding[] = [];
    const getters = new Set<string>();
    screenLocatorTypes(screen.content, evidence.contract, className, bindings, getters);
    const usage = screenMethodGetterUsage(screen.content, className);
    const documents = new Map<string, Record<string, Record<string, string>>>();
    for (const file of result.files.filter(file => file.layer === 'locators')) {
        try { documents.set(file.path, JSON.parse(file.content)); } catch { /* Main checker reports JSON. */ }
    }
    for (const action of evidence.actions) {
        if (!action.primary || !action.locatorName) continue;
        const traces = result.actionTrace.filter(trace => trace.sequence === action.sequence);
        const trace = traces.length === 1 ? traces[0] : undefined;
        const adopted = trace?.locatorName !== action.locatorName
            && action.reuseCandidates?.some(candidate => candidate.name === trace?.locatorName);
        // Completions and adopted framework candidates use their offered contract;
        // they cannot be judged from the old recording's create pair.
        if (adopted || result.completions?.some(item => item.sequence === action.sequence)) {
            notes.push(`Acción ${action.sequence}: integración verifica el contrato del locator adoptado/completion.`);
            continue;
        }
        const getter = trace?.locatorName;
        const active = bindings.filter(binding => binding.getter === getter && binding.platform === evidence.platform);
        if (action.resolution !== 'create') {
            // Reuse can legitimately adopt a stronger existing selector. The full
            // validator resolves its baseline; local tools do not read the target.
            notes.push(`Acción ${action.sequence}: integración verifica la reutilización contra su baseline.`);
            continue;
        }
        if (!getter || !getters.has(getter) || active.length !== 1) {
            errors.push({ code: 'locator-type-unverified', file: screen.path,
                message: `Acción ${action.sequence}: declara una sola traza y un getter con el par TypeLocator/JSON verificable.` });
        } else {
            const binding = active[0];
            const document = documents.get(binding.file);
            const value = document?.[binding.block]?.[binding.name];
            const matches = binding.block.toLowerCase().endsWith(evidence.platform)
                && binding.type === action.primary.locatorType && value === action.primary.locatorValue;
            if (!matches) errors.push({ code: 'locator-type-mismatch', file: screen.path,
                message: `Acción ${action.sequence}, getter ${getter}: conserva TypeLocator.${action.primary.locatorType} `
                    + 'y locatorValue exactos de generation-plan.json.recordedLocator; el tipo y valor forman una identidad.' });
            // English aliases are valid when they preserve the verified pair.
            if (binding.name !== getter || !document) errors.push({ code: 'create-locator-contract', file: binding.file,
                message: `Acción ${action.sequence}: el create debe usar el getter y clave JSON homónimos ${getter}.` });
            const opposite = evidence.platform === 'android' ? 'ios' : 'android';
            if (document && !Object.entries(document).some(([block, values]) =>
                block.toLowerCase().endsWith(opposite) && values && Object.prototype.hasOwnProperty.call(values, getter))) {
                errors.push({ code: 'platform-coverage', file: binding.file,
                    message: `El locator ${getter} debe declarar también su clave en ${opposite.toUpperCase()}, aunque quede vacía.` });
            }
        }
        const method = trace?.screenMethod ? usage.get(trace.screenMethod) : undefined;
        const resolvesGetter = (used: string): boolean => used === getter || bindings.some(binding =>
            binding.getter === used && binding.platform === evidence.platform && binding.name === getter);
        const needsCrossLayerAssertion = String(action.action || '').startsWith('VERIFICAR_');
        if (!method || method.hardcodedSelector
            || method.literals.has(action.primary.selector) || method.literals.has(action.primary.locatorValue)
            || (!needsCrossLayerAssertion && ![...method.getters].some(resolvesGetter))) {
            errors.push({ code: 'trace-screen-method', file: screen.path,
                message: `La acción ${action.sequence} debe trazar un único screenMethod que consuma el getter ${getter || action.locatorName} sin selectores literales.` });
        }
        if (needsCrossLayerAssertion) notes.push(`Acción ${action.sequence}: integración verifica el enlace entre lectura y aserción de Steps.`);
    }
    return { errors, notes: [...new Set(notes)] };
}
