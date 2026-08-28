import type { AutomationScenario } from './automationContracts';
import type { GenerationRequest } from './fwkMobileGenerator';
import type { RecordedStep } from './models';

const SCENARIO_MISMATCH_ERROR =
    'scenario.json fue modificado o no coincide con la grabación original';

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
 * The resolved request remains authoritative, while verified selector backups
 * travel only in locator-candidates.json and row actions reference sequences.
 */
export function packageAutomationScenario(
    scenario: AutomationScenario
): PackagedAutomationScenario {
    const rows = scenario.request.scenarioRows;
    return {
        ...scenario,
        actions: scenario.actions.map(action => {
            const { selectorCandidates: _selectorCandidates, ...compact } = action;
            return compact;
        }),
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
    if (
        !revisionIsValid
        || JSON.stringify(scenarioIdentity(packagedScenario))
            !== JSON.stringify(scenarioIdentity(expected))
    ) {
        throw new Error(SCENARIO_MISMATCH_ERROR);
    }
    return {
        ...resolvedRecordingScenario,
        revision: packagedScenario.revision,
    };
}
