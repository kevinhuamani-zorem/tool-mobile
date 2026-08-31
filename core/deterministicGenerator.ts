import fs from 'fs';
import path from 'path';
import {
    AgentGeneratedFile,
    AutomationAgentResponse,
    AutomationScenario,
    GapResolution,
    GenerationPlan,
    ResolvedContext,
} from './automationContracts';
import { ModuleDeclaration } from './elementDeclaration';
import { declareElement } from './elementDeclaration';
import {
    FwkMobileGenerator,
    GeneratedPreview,
    ReusedLocator,
    scenarioRowMethodName,
} from './fwkMobileGenerator';
import { projectPaths } from './projectPaths';
import { effectiveGenerationPlan } from './effectiveGenerationPlan';
import { ReuseAnalyzer } from './reuseAnalyzer';

function readJson<T>(file: string): T {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

function relative(file: string): string {
    return path.relative(projectPaths.frameworkRoot, file).replace(/\\/g, '/');
}

function reusedLocators(
    plan: Pick<GenerationPlan, 'files' | 'resolutions'>,
    context?: Pick<ResolvedContext, 'elementDeclarations'>,
    scenario?: Pick<AutomationScenario, 'squad' | 'platform' | 'request'>,
): ReusedLocator[] {
    const declarations = (context?.elementDeclarations || []) as ModuleDeclaration[];
    const byName = new Map<string, ReusedLocator>();
    for (const group of declarations) {
        for (const element of group.elements) {
            byName.set(`${group.module}#${element.name}`, {
                name: element.name,
                import: group.import,
                identifier: group.identifier,
                reference: {
                    android: element.locators.android?.reference,
                    ios: element.locators.ios?.reference,
                },
                type: {
                    android: element.locators.android?.type,
                    ios: element.locators.ios?.type,
                },
            });
        }

    }
    const own = plan.files.find(file => file.layer === 'locators')?.path;
    const selected = plan.resolutions
        .filter(resolution => resolution.resolution === 'reuse' && resolution.source && resolution.locatorName)
        .filter(resolution => resolution.source!.file !== own)
        .map(resolution => ({
            resolution,
            declaration: byName.get(`${resolution.source!.module}#${resolution.locatorName}`),
        }));
    if (scenario && selected.some(item => !item.declaration)) {
        const catalog = new ReuseAnalyzer().getCatalog(
            scenario.squad,
            scenario.platform,
            String((scenario.request as any).featureScope || ''),
        );
        for (const item of selected) {
            if (item.declaration) continue;
            const source = item.resolution.source!;
            const locator = catalog.locators.find(candidate =>
                candidate.module === source.module
                && candidate.name === item.resolution.locatorName
                && candidate.file.replace(/\\/g, '/') === source.file.replace(/\\/g, '/')
            );
            if (!locator) continue;
            const declaration = declareElement(locator, new Map());
            item.declaration = {
                name: declaration.name,
                import: declaration.import,
                identifier: declaration.identifier,
                reference: {
                    android: declaration.locators.android?.reference,
                    ios: declaration.locators.ios?.reference,
                },
                type: {
                    android: declaration.locators.android?.type,
                    ios: declaration.locators.ios?.type,
                },
            };
        }
    }
    const missing = selected.filter(item => !item.declaration);
    if (missing.length) {
        throw new Error(
            'No se pudo materializar el locator reutilizado: '
            + missing.map(item => `${item.resolution.source!.module}#${item.resolution.locatorName}`).join(', '),
        );
    }
    return selected.map(item => item.declaration!);
}

function hydrateScenarioRows(
    scenario: AutomationScenario,
    plan: GenerationPlan,
): AutomationScenario['request'] {
    const byResolution = new Map(
        (plan.resolutions || [])
            .filter(item => Number.isInteger(item.sequence))
            .map(item => [item.sequence, item]),
    );
    const bySequence = new Map(
        (scenario.actions || [])
            .filter(action => Number.isInteger(action.sequence))
            .map(action => {
                const resolution = byResolution.get(action.sequence);
                return [action.sequence, {
                    ...action,
                    variableName: resolution?.locatorName || action.variableName || '',
                    selector: action.selector || resolution?.selector || '',
                }];
            }),
    );
    const rows = (scenario.request.scenarioRows || []).map(row => {
        const actions = (row.actions || [])
            .map(entry => bySequence.get(Number((entry as any)?.sequence)))
            .filter(Boolean);
        return {
            ...row,
            actions,
        };
    });
    return {
        ...(scenario.request as any),
        ...(scenario.request.scenarioRows ? { scenarioRows: rows as any } : {}),
    } as AutomationScenario['request'];
}

function responseFromPreview(
    scenario: AutomationScenario,
    plan: GenerationPlan,
    preview: GeneratedPreview,
    resolutions: GapResolution[],
): AutomationAgentResponse {
    const files: AgentGeneratedFile[] = [{
        layer: 'feature' as const,
        path: relative(preview.featurePath),
        content: preview.featureContent,
    }];
    if (preview.stepPath && preview.stepContent) files.push({ layer: 'steps' as const, path: relative(preview.stepPath), content: preview.stepContent });
    if (preview.screenPath && preview.screenContent) files.push({ layer: 'screen' as const, path: relative(preview.screenPath), content: preview.screenContent });
    if (preview.locatorPath && preview.locatorContent) files.push({ layer: 'locators' as const, path: relative(preview.locatorPath), content: preview.locatorContent });

    const actionTrace = scenario.request.scenarioRows?.filter(row => row.status === 'missing')
        .flatMap((row, index) =>
            (row.actions || []).map(action => ({
                sequence: action.sequence!,
                gherkinStep: `${row.keyword} ${row.text}`,
                screenMethod: scenarioRowMethodName(row, index),
                locatorName: plan.resolutions.find(item => item.sequence === action.sequence)?.locatorName,
            }))
        ) || [];
    return {
        recordingId: scenario.recordingId,
        planId: plan.planId,
        resolutions: resolutions.map(item => ({
            gapId: item.gapId,
            decision: item.decision,
            ...(item.reason ? { reason: item.reason } : {}),
            ...(item.needs ? { needs: item.needs } : {}),
        })),
        actionTrace,
        files,
        assumptions: ['Salida materializada por DeterministicGenerator.'],
    };
}

export class DeterministicGenerator {
    constructor(private readonly generator = new FwkMobileGenerator()) {}

    generate(packageDirectory: string, resolutions: GapResolution[]): AutomationAgentResponse {
        const scenario = readJson<AutomationScenario>(path.join(packageDirectory, 'scenario.json'));
        const basePlan = readJson<GenerationPlan>(path.join(packageDirectory, 'generation-plan.json'));
        const plan = effectiveGenerationPlan(packageDirectory, basePlan, resolutions);
        fs.writeFileSync(
            path.join(packageDirectory, 'effective-generation-plan.json'),
            JSON.stringify(plan, null, 2) + '\n',
        );
        const resolvedContext = fs.existsSync(path.join(packageDirectory, 'resolved-context.json'))
            ? readJson<ResolvedContext>(path.join(packageDirectory, 'resolved-context.json'))
            : undefined;
        const preview = this.generator.preview(
            hydrateScenarioRows(scenario, plan),
            scenario.actions,
            reusedLocators(plan, resolvedContext, scenario),
            { preserveDistinctActionLocators: true },
        );
        return responseFromPreview(scenario, plan, preview, resolutions);
    }
}
