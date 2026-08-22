import fs from 'fs';
import path from 'path';
import {
    AutomationAgentResponse,
    AutomationScenario,
    GenerationPlan,
} from './automationContracts';
import { recordedStepContext } from './models';
import {
    ExistingScenarioInfo,
    ScenarioCoverageResult,
    ScenarioLocatorCoverage,
    ScenarioStepResolution,
} from './scenarioCoverageAnalyzer';
import { projectPaths } from './projectPaths';

export interface RecordingScenarioInfo extends ExistingScenarioInfo {
    recordingId: string;
    recordedAt: string;
    environment: string;
    platform: string;
    actionCount: number;
    automationState: string;
    /**
     * [visual-recorder] El paquete del agente ya existe: sin esto no hay
     * resoluciones y por tanto no hay cobertura de locators que completar.
     */
    hasPlan: boolean;
    /**
     * [visual-recorder] La grabacion tiene al menos una verificacion. Sin Then
     * no es un caso de prueba (ISTQB) y el builder la rechaza, asi que lo unico
     * que se puede hacer con ella es seguir grabando.
     */
    hasAssertion: boolean;
    generated: boolean;
    canRegenerate: boolean;
    regenerationIteration: number;
}

interface RecordingEntry {
    directory: string;
    scenario: AutomationScenario;
    info: RecordingScenarioInfo;
}

function readJson<T>(file: string): T | undefined {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
    } catch {
        return undefined;
    }
}

function scenarioSteps(scenario: AutomationScenario): ExistingScenarioInfo['steps'] {
    const rows = Array.isArray(scenario.request.scenarioRows)
        ? scenario.request.scenarioRows
        : [];
    if (rows.length) return rows.map(row => ({ keyword: row.keyword, text: row.text }));
    return scenario.actions.map(action => ({
        keyword: action.action.startsWith('VERIFICAR') ? 'Then' : 'When',
        text: recordedStepContext(action) || action.action,
    }));
}

export class RecordingCoverageAnalyzer {
    constructor(
        private readonly recordingsRoot = projectPaths.recordings,
        private readonly frameworkRoot = projectPaths.frameworkRoot,
        private readonly locatorsRoot = projectPaths.locators
    ) {}

    listRecordings(squad: string, environment = ''): RecordingScenarioInfo[] {
        return this.entries(squad, environment)
            .map(entry => entry.info)
            .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    }

    findRecordingDirectory(squad: string, recordingId: string, environment = ''): string {
        const entry = this.entries(squad, environment)
            .find(candidate => candidate.scenario.recordingId === recordingId);
        if (!entry) throw new Error(`No se encontró la grabación: ${recordingId}`);
        return entry.directory;
    }

    getRecordingInfo(squad: string, recordingId: string, environment = ''): RecordingScenarioInfo {
        const entry = this.entries(squad, environment)
            .find(candidate => candidate.scenario.recordingId === recordingId);
        if (!entry) throw new Error(`No se encontró la grabación: ${recordingId}`);
        return entry.info;
    }

    analyze(squad: string, recordingId: string, environment = ''): ScenarioCoverageResult {
        const entry = this.entries(squad, environment)
            .find(candidate => candidate.scenario.recordingId === recordingId);
        if (!entry) throw new Error(`No se encontró la grabación: ${recordingId}`);

        const packageDirectory = path.join(entry.directory, 'generation', 'automation');
        const plan = readJson<GenerationPlan>(path.join(packageDirectory, 'generation-plan.json'));
        if (!plan) throw new Error('La grabación todavía no tiene un plan de generación');
        const response = readJson<AutomationAgentResponse>(path.join(packageDirectory, 'agent-response.json'));
        const locatorFile = plan.files.find(file => file.layer === 'locators')?.path || '';
        const resolutionBySequence = new Map(plan.resolutions.map(item => [item.sequence, item]));
        const documents = new Map<string, Record<string, any>>();

        const locatorDocument = (relativeFile: string): Record<string, any> => {
            if (documents.has(relativeFile)) return documents.get(relativeFile)!;
            const absolute = path.resolve(this.frameworkRoot, relativeFile);
            let document = readJson<Record<string, any>>(absolute);
            if (!document && response) {
                const proposed = response.files.find(file =>
                    file.layer === 'locators' && file.path === relativeFile
                );
                if (proposed) {
                    try { document = JSON.parse(proposed.content); } catch { document = undefined; }
                }
            }
            const result = document || {};
            documents.set(relativeFile, result);
            return result;
        };

        const coverageFor = (sequence: number, stepText: string): ScenarioLocatorCoverage | undefined => {
            const resolution = resolutionBySequence.get(sequence);
            if (!resolution?.locatorName || resolution.resolution === 'builtin') return undefined;
            const relativeFile = resolution.source?.file || locatorFile;
            if (!relativeFile) return undefined;
            const document = locatorDocument(relativeFile);
            const androidBlock = Object.keys(document).find(key => key.toLowerCase().endsWith('android'));
            const iosBlock = Object.keys(document).find(key => key.toLowerCase().endsWith('ios'));
            const androidSelector = typeof document[androidBlock || '']?.[resolution.locatorName] === 'string'
                ? document[androidBlock!][resolution.locatorName].trim()
                : '';
            const iosSelector = typeof document[iosBlock || '']?.[resolution.locatorName] === 'string'
                ? document[iosBlock!][resolution.locatorName].trim()
                : '';
            return {
                name: resolution.locatorName,
                file: relativeFile,
                module: resolution.source?.module || relativeFile
                    .replace(/^resources\/locators\//, '')
                    .replace(/\.locator\.json$/i, ''),
                steps: [stepText],
                androidSelector,
                iosSelector,
                androidBlock,
                iosBlock,
            };
        };

        const rows = Array.isArray(entry.scenario.request.scenarioRows)
            ? entry.scenario.request.scenarioRows
            : [];
        const steps: ScenarioStepResolution[] = (rows.length ? rows : entry.scenario.actions.map(action => ({
            keyword: action.action.startsWith('VERIFICAR') ? 'Then' : 'When',
            text: recordedStepContext(action) || action.action,
            actions: [action],
        }))).map((row, index) => {
            const locators = (row.actions || [])
                .map(action => coverageFor(Number(action.sequence), row.text))
                .filter((item): item is ScenarioLocatorCoverage => Boolean(item))
                .filter((item, locatorIndex, items) =>
                    items.findIndex(candidate =>
                        candidate.file === item.file && candidate.name === item.name
                    ) === locatorIndex
                );
            return {
                index,
                keyword: row.keyword,
                text: row.text,
                definition: 'runtime/recording',
                screenCalls: [],
                locators,
            };
        });
        const locators = steps.flatMap(step => step.locators)
            .filter((item, index, items) =>
                items.findIndex(candidate =>
                    candidate.file === item.file && candidate.name === item.name
                ) === index
            );

        return {
            scenario: entry.info,
            steps,
            locators,
            unresolvedSteps: [],
            totals: {
                locators: locators.length,
                android: locators.filter(locator => Boolean(locator.androidSelector)).length,
                ios: locators.filter(locator => Boolean(locator.iosSelector)).length,
            },
        };
    }

    private entries(squad: string, environment: string): RecordingEntry[] {
        if (!fs.existsSync(this.recordingsRoot)) return [];
        return fs.readdirSync(this.recordingsRoot, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .flatMap(directoryEntry => {
                const directory = path.join(this.recordingsRoot, directoryEntry.name);
                const rawScenario = readJson<AutomationScenario>(path.join(directory, 'scenario.json'));
                const preparedScenario = readJson<AutomationScenario>(path.join(
                    directory,
                    'generation',
                    'automation',
                    'scenario.json'
                ));
                const scenario = preparedScenario?.recordingId === rawScenario?.recordingId
                    ? preparedScenario
                    : rawScenario;
                if (!scenario || scenario.squad !== squad) return [];
                if (environment && scenario.environment !== environment) return [];
                const packageDirectory = path.join(directory, 'generation', 'automation');
                const plan = readJson<GenerationPlan>(path.join(packageDirectory, 'generation-plan.json'));
                const response = readJson<AutomationAgentResponse>(path.join(packageDirectory, 'agent-response.json'));
                const validation = readJson<any>(path.join(packageDirectory, 'validation.json'));
                const status = readJson<any>(path.join(packageDirectory, 'status.json')) || {};
                const generated = Boolean(plan && plan.files.length === 4 && plan.files.every(file =>
                    fs.existsSync(path.join(this.frameworkRoot, file.path))
                ));
                const canRegenerate = Boolean(
                    generated && response && validation?.valid && validation?.qualityScore === 100
                );
                const name = scenario.request.scenarioName || scenario.objective || 'Grabación sin nombre';
                const info: RecordingScenarioInfo = {
                    id: scenario.recordingId,
                    recordingId: scenario.recordingId,
                    feature: scenario.request.featureName || scenario.objective || 'Grabación',
                    name,
                    caseId: scenario.request.caseId || '',
                    tags: scenario.request.tag ? [`@${scenario.request.tag.replace(/^@/, '')}`] : [],
                    file: path.relative(projectPaths.toolRoot, path.join(directory, 'scenario.json')).replace(/\\/g, '/'),
                    line: 1,
                    steps: scenarioSteps(scenario),
                    recordedAt: scenario.createdAt,
                    environment: scenario.environment,
                    platform: scenario.platform,
                    actionCount: scenario.actions.length,
                    automationState: String(status.state || 'recorded'),
                    hasPlan: Boolean(plan),
                    hasAssertion: scenario.actions.some(action => /^VERIFICAR_/.test(action.action)),
                    generated,
                    canRegenerate,
                    regenerationIteration: Number(status.regenerationIteration || 0),
                };
                return [{ directory, scenario, info }];
            });
    }
}
