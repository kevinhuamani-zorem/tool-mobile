import type { AutomationScenario, GenerationRequest, RecordedStep } from '../contracts';

/**
 * Primer campo en el que divergen dos objetos, en notacion de ruta.
 *
 * Sin esto el fallo era opaco: el mensaje insinuaba manipulacion y el QA no
 * tenia forma de saber que habia cambiado ni que hacer al respecto.
 */
function firstDivergence(expected: unknown, actual: unknown, at = ''): string | undefined {
    if (JSON.stringify(expected) === JSON.stringify(actual)) return undefined;
    const bothObjects = expected && actual
        && typeof expected === 'object' && typeof actual === 'object'
        && Array.isArray(expected) === Array.isArray(actual);
    if (!bothObjects) return at || '(raiz)';
    const left = expected as Record<string, unknown>;
    const right = actual as Record<string, unknown>;
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
        const found = firstDivergence(left[key], right[key], at ? `${at}.${key}` : key);
        if (found) return found;
    }
    return at || '(raiz)';
}

function mismatchError(detail: string): Error {
    return new Error(
        `El scenario.json del paquete ya no corresponde a la grabación: ${detail}. ` +
        'Normalmente no es una manipulación del archivo, sino que el paquete quedó viejo: ' +
        'la grabación continuó, o el framework cambió (un locator nuevo, una actualización ' +
        'del recorder) y el plan se resuelve distinto. Vuelve a preparar el paquete y a ' +
        'lanzar el agente. Si nadie tocó nada de eso, entonces sí revisa el archivo.'
    );
}

type ScenarioRow = NonNullable<GenerationRequest['scenarioRows']>[number];

export type PackagedAutomationScenario = Omit<AutomationScenario, 'request'> & {
    request: Omit<GenerationRequest, 'scenarioRows'> & {
        scenarioRows?: Array<Omit<ScenarioRow, 'actions'> & {
            actions: Array<Pick<RecordedStep, 'sequence'>>;
        }>;
    };
};

/**
 * Builds the exact scenario representation exposed to the automation agent.
 *
 * The resolved request remains authoritative, while row actions reference
 * sequences only.
 */
export function packageAutomationScenario(
    scenario: AutomationScenario
): PackagedAutomationScenario {
    const rows = scenario.request.scenarioRows;
    const actions = scenario.actions.map(action => {
        const { selectorCandidates: _selectorCandidates, ...rest } = action as typeof action & {
            selectorCandidates?: unknown;
        };
        return rest;
    });
    return {
        ...scenario,
        actions,
        request: {
            ...scenario.request,
            scenarioRows: rows?.map(row => ({
                ...row,
                actions: (row.actions || []).map(action => ({ sequence: action.sequence })),
            })),
        },
    };
}

function scenarioIdentity(
    scenario: AutomationScenario | PackagedAutomationScenario
): unknown {
    const { revision: _revision, ...identity } = scenario;
    return identity;
}

/**
 * Accepts only the deterministic package produced from the authoritative
 * recording. Revision may advance during refinement, but cannot move backward.
 */
export function requireTrustedAutomationScenarioPackage(
    resolvedRecordingScenario: AutomationScenario,
    packagedScenario: PackagedAutomationScenario
): AutomationScenario {
    const expected = packageAutomationScenario(resolvedRecordingScenario);
    const revisionIsValid = Number.isInteger(packagedScenario.revision)
        && packagedScenario.revision >= expected.revision;
    if (!revisionIsValid) {
        throw mismatchError(
            `su revisión es ${JSON.stringify(packagedScenario.revision)} y la grabación va por ` +
            `${expected.revision}`
        );
    }
    const divergence = firstDivergence(scenarioIdentity(expected), scenarioIdentity(packagedScenario));
    if (divergence) {
        throw mismatchError(`difiere en ${divergence}`);
    }
    return {
        ...resolvedRecordingScenario,
        revision: packagedScenario.revision,
    };
}
