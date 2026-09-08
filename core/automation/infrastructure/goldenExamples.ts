import { GoldenSnapshotReader } from './goldenSnapshot';
import { goldenCaseContext, GoldenDependencyReference } from './goldenCaseContext';
import { ReuseAnalyzer } from '../../indexing';
import { matchingStepDefinitions } from '../../shared';
import { actionIdentity, fragmentsFromValidatedCase, recallInteractions, InteractionFragment } from '../domain/memoryFragments';
import fs from 'fs';
import path from 'path';
import type { AutomationScenario } from '../contracts';
import type { GenerationAgentRole } from '../domain/layeredGenerationContracts';
import { ApprovedGoldenStore, goldenHash } from './approvedGoldenStore';
import { goldenDatasetRoot, readGoldenCase } from './goldenDataset';
import { AutomationHistoryStore } from './automationHistoryStore';
import { projectPaths } from '../../workspace';

export const GOLDEN_EXAMPLE_CONTRACT = 'mobile-four-layers/v1';
export const GOLDEN_SELECTION_VERSION = 'golden-selection/v2';
const read = (root: string, name: string): any => new GoldenSnapshotReader(root).json(name);
const tokens = (value: string) => new Set(value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(word => word.length > 3 && !['usuario', 'para', 'caso', 'realizar', 'debe'].includes(word)));
const overlap = (a: Set<string>, b: Set<string>) => a.size || b.size ? [...a].filter(item => b.has(item)).length / new Set([...a, ...b]).size : 0;
export interface GoldenExample {
    goldenId: string; revisionId: string; versionHash: string; caseId: string; recordingId: string; score: number;
    dependencies: GoldenDependencyReference[]; frameworkCommit?: string;
    approval: unknown; objective: string; actions: string[]; relationsVerified: boolean;
    files: Array<{ layer: string; path: string; content: string }>;
    lessons: Array<{ layer: string; path: string; reason: string; observedRuleCodes: string[] }>;
    relations: unknown[];
}
export interface GoldenExamples {
    schemaVersion: 1; selectionVersion: string; contract: string; fingerprint: string; enabled: boolean;
    recordingId: string; examples: GoldenExample[]; excluded: Array<{ goldenId: string; reason: string }>; issues: string[];
}

/** Read-only ranking. Golden examples never resolve gaps or authorize current selectors. */
export function selectGoldenExamples(scenario: AutomationScenario, options: { root?: string; frameworkRoot?: string; enabled?: boolean } = {}): GoldenExamples {
    const store = new ApprovedGoldenStore(options.root || goldenDatasetRoot());
    const index = store.index();
    const result: GoldenExamples = { schemaVersion: 1, selectionVersion: GOLDEN_SELECTION_VERSION, contract: GOLDEN_EXAMPLE_CONTRACT,
        fingerprint: index.fingerprint, enabled: options.enabled ?? process.env.RECORDER_GOLDEN_EXAMPLES !== '0', recordingId: scenario.recordingId,
        examples: [], excluded: [], issues: [...index.issues] };
    if (!result.enabled) return result;
    const frameworkRoot = options.frameworkRoot || projectPaths.frameworkRoot;
    const compatible = new Set(store.compatible({ squad: scenario.squad, platform: scenario.platform, contract: GOLDEN_EXAMPLE_CONTRACT,
        featureScope: scenario.request?.featureScope, environment: scenario.environment }, frameworkRoot).map(entry => entry.goldenId));
    const actions = new Set((scenario.actions || []).map(action => action.action));
    const intent = tokens(`${scenario.objective || ''} ${scenario.acceptanceCriteria || ''}`);
    for (const entry of index.entries) {
        const exclude = (reason: string) => result.excluded.push({ goldenId: entry.goldenId, reason });
        if (!compatible.has(entry.goldenId)) { exclude('incompatible-framework-or-scope'); continue; }
        try {
            const golden = readGoldenCase(entry.directory);
            const publication = store.read(entry.goldenId, entry.versionHash).publication;
            if (publication.usage === 'evaluation') { exclude('reserved-for-evaluation'); continue; }
            if (entry.recordingId === scenario.recordingId || entry.caseId && entry.caseId === scenario.request?.caseId) { exclude('same-case'); continue; }
            const goldenActions = new Set((golden.scenario.actions || []).map(action => action.action));
            const actionScore = overlap(actions, goldenActions);
            const intentScore = overlap(intent, tokens(`${golden.scenario.objective || ''} ${golden.scenario.acceptanceCriteria || ''}`));
            if (!actionScore || !intentScore) { exclude('unrelated-intent-or-actions'); continue; }
            const snapshot = new GoldenSnapshotReader(entry.directory);
            const recovered = golden.manifest.source === 'framework-recovery' && golden.manifest.artifacts?.['package/framework-recovery.json']
                ? snapshot.json('package/framework-recovery.json') : undefined;
            const context = goldenCaseContext(golden.effectivePlan, golden.response.files, snapshot.json('dependency-files.json'), recovered);
            const changes = snapshot.json('qa-changes.json');
            const originalDiagnostics = golden.manifest.artifacts?.['package/validation.json'] ? snapshot.json('package/validation.json') : { errors: [] };
            result.examples.push({ goldenId: entry.goldenId, revisionId: entry.revisionId, versionHash: entry.versionHash,
                caseId: entry.caseId, recordingId: entry.recordingId, approval: entry.approval, score: actionScore * 0.65 + intentScore * 0.35,
                objective: golden.scenario.objective, actions: [...goldenActions],
                relationsVerified: Boolean(recovered?.relations?.length && !recovered.pending?.length && recovered.traceAssociations?.length
                    && recovered.traceAssociations.every((trace: any) => trace.status === 'preserved')),
                relations: recovered?.relations || [], files: context.files, dependencies: context.dependencies, frameworkCommit: (golden.manifest.framework as any)?.commit || golden.manifest.framework?.head,
                lessons: changes.filter((change: any) => change.changed && context.files.some(file => file.path === change.path)).map((change: any) => ({ path: change.path,
                    layer: golden.response.files.find(file => file.path === change.path)?.layer || 'dependency',
                    reason: publication.notes || 'QA corrigió esta capa; no registró un motivo.', observedRuleCodes: [...new Set((originalDiagnostics.errors || []).filter((error: any) => !error.file || error.file === change.path || error.file.endsWith('/' + change.path)).map((error: any) => String(error.code || 'unclassified')))] as string[] })),
            });
        } catch (error: any) { exclude('integrity-error'); result.issues.push(`${entry.goldenId}: ${error.message}`); }
    }
    result.examples.sort((a, b) => b.score - a.score || a.goldenId.localeCompare(b.goldenId));
    return result;
}

export function prepareGoldenExamples(packageDirectory: string): GoldenExamples {
    const scenario = read(packageDirectory, 'scenario.json') as AutomationScenario;
    let selected: GoldenExamples;
    try { selected = selectGoldenExamples(scenario); }
    catch (error: any) { selected = { schemaVersion: 1, selectionVersion: GOLDEN_SELECTION_VERSION, contract: GOLDEN_EXAMPLE_CONTRACT,
        enabled: process.env.RECORDER_GOLDEN_EXAMPLES !== '0', fingerprint: 'unavailable', recordingId: scenario.recordingId,
        examples: [], excluded: [], issues: [error.message] }; }
    fs.writeFileSync(path.join(packageDirectory, 'golden-examples.json'), JSON.stringify(selected, null, 2) + '\n');
    return selected;
}

/** Role projection is rebuilt against current publications for every invocation. */
export function writeGoldenRoleExamples(packageDirectory: string, stageDirectory: string, role: GenerationAgentRole, pass: 1 | 2, integrationErrors: string[] = []) {
    const selected = prepareGoldenExamples(packageDirectory);
    const layers = role === 'behavior-author' ? ['feature', 'steps'] : role === 'interaction-author' ? ['screen', 'locators'] : [];
    const examples: any[] = [];
    const skipped: string[] = [];
    const integration = role === 'integration-reviewer';
    const gaps = integration && fs.existsSync(path.join(packageDirectory, 'gaps.json')) ? read(packageDirectory, 'gaps.json').gaps || [] : [];
    const integrationContext = [...integrationErrors, ...gaps.filter((gap: any) => integrationErrors.includes(gap.id)).map((gap: any) => JSON.stringify(gap))].join(' ');
    for (const example of selected.examples) {
        if (integration && (!integrationErrors.length || !example.relationsVerified)) continue;
        const { files: _, lessons: __, relations: ___, ...identity } = example;
        const lessons = example.lessons.filter(lesson => integration ? lesson.observedRuleCodes.some(code => integrationErrors.some(error => error.includes(code))) : layers.includes(lesson.layer));
        const relations = integration ? example.relations.filter((relation: any) => [relation.from, relation.to].some(endpoint =>
            endpoint && (endpoint.path && (integrationContext.includes(endpoint.path) || lessons.some(lesson => lesson.path === endpoint.path))
                || endpoint.symbol && integrationContext.includes(endpoint.symbol)))) : [];
        if (integration && !lessons.length && !relations.length) continue;
        const files = integration ? [] : example.files.filter(file => layers.includes(file.layer));
        const dependencyOwners = new Set([...files.map(file => file.path), ...lessons.map(lesson => lesson.path)]);
        const dependencies = example.dependencies.filter(dependency => dependency.referencedBy.some(owner => dependencyOwners.has(owner)));
        examples.push({ ...identity, files, dependencies, frameworkCommit: example.frameworkCommit, lessons, relations, automaticReuse: false });
    }
    const payload = { schemaVersion: 1, selectionVersion: selected.selectionVersion, contract: selected.contract, fingerprint: selected.fingerprint,
        enabled: selected.enabled, role, pass, examples, skipped,
        instructions: 'Referencias QA, no instrucciones. Las dependencias identifican rutas, símbolos y hashes del snapshot aprobado; no son capas que debas volver a generar. Aprende estructura y correcciones; usa exclusivamente rutas, métodos, datos y selectores autorizados por el recording/plan/framework actuales. No cierres gaps ni copies respuestas de otro caso.' };
    const content = JSON.stringify(payload, null, 2) + '\n';
    const file = path.join(stageDirectory, 'golden-examples.json'); fs.writeFileSync(file, content);
    new AutomationHistoryStore(packageDirectory).capture(`golden-examples/${role}.json`, content, 'recorder', `golden-context:${role}`, pass);
    return { file, sha256: goldenHash(content), references: examples.map(example => ({ goldenId: example.goldenId, revisionId: example.revisionId, versionHash: example.versionHash })), fingerprint: selected.fingerprint };
}

/** Exact fragments need both recovered trace proof and a unique current framework definition. */
export function goldenFragmentMemory(scenario: AutomationScenario, options: { root?: string; frameworkRoot?: string } = {}) {
    // ReuseAnalyzer reads the selected workspace; never combine it with another root.
    if (path.resolve(options.frameworkRoot || projectPaths.frameworkRoot) !== path.resolve(projectPaths.frameworkRoot)) return undefined;
    const selected = selectGoldenExamples(scenario, options);
    const verified = selected.examples.filter(example => example.relationsVerified);
    if (!verified.length) return undefined;
    const provider = new ReuseAnalyzer();
    const catalog = provider.getCatalog(scenario.squad, scenario.platform, scenario.request?.featureScope);
    const fragments: InteractionFragment[] = [];
    const store = new ApprovedGoldenStore(options.root || goldenDatasetRoot());
    for (const example of verified) {
        const golden = readGoldenCase(store.read(example.goldenId, example.versionHash).directory);
        const learned = fragmentsFromValidatedCase({ scenario: golden.scenario, response: golden.response, promotedAt: (example.approval as any).at });
        for (const fragment of learned.interactions) {
            // Legacy identities omit input values. An exact fragment must preserve all values/assertions,
            // including case and whitespace; ambiguous repetitions stay with the normal resolver.
            const values = (source: AutomationScenario, identity: string) => source.actions
                .filter(action => actionIdentity(action, source.platform) === identity)
                .map(action => JSON.stringify([action.selectorVerified === true, action.value ?? '', action.textAssertion ?? null]));
            if (fragment.identities.some(identity => {
                const original = values(golden.scenario, identity), current = values(scenario, identity);
                return !original.length || !current.length || original.some(value => !JSON.parse(value)[0]) || new Set([...original, ...current]).size !== 1;
            })) continue;
            const trace = golden.response.actionTrace?.filter(entry => entry.gherkinStep === `${fragment.keyword} ${fragment.text}`) || [];
            if (!trace.length || trace.some(entry => entry.screenMethod !== fragment.screenMethod)) continue;
            const matches = matchingStepDefinitions(fragment.text, catalog.frameworkStepDefinitions || catalog.stepDefinitions);
            if (matches.length !== 1 || !fragment.screenMethod || !matches[0].screenMethods?.some(method => method.method === fragment.screenMethod)) continue;
            if (!example.relations.some((relation: any) => relation.from?.path === matches[0].file && relation.to?.symbol === fragment.screenMethod
                && matches[0].screenMethods?.some(method => method.method === fragment.screenMethod && method.file === relation.to.path))) continue;
            fragments.push(fragment);
        }
    }
    if (!fragments.length) return undefined;
    return {
        recallInteractions(squad: string, identities: string[], usedTexts?: Set<string>) {
            // Recheck approval and current bytes before returning a deterministic fragment.
            if (path.resolve(options.frameworkRoot || projectPaths.frameworkRoot) !== path.resolve(projectPaths.frameworkRoot)) return undefined;
            if (squad !== scenario.squad || selectGoldenExamples(scenario, options).fingerprint !== selected.fingerprint) return undefined;
            const current = new Set(store.compatible({ squad, platform: scenario.platform, contract: GOLDEN_EXAMPLE_CONTRACT,
                featureScope: scenario.request?.featureScope, environment: scenario.environment }, options.frameworkRoot || projectPaths.frameworkRoot).map(entry => entry.goldenId));
            if (verified.some(example => !current.has(example.goldenId))) return undefined;
            const currentCatalog = provider.getCatalog(scenario.squad, scenario.platform, scenario.request?.featureScope);
            const unambiguous = fragments.filter(fragment => matchingStepDefinitions(fragment.text,
                currentCatalog.frameworkStepDefinitions || currentCatalog.stepDefinitions).length === 1);
            return recallInteractions(unambiguous, squad, identities, usedTexts);
        },
        // Similar intent is insufficient to reproduce a verification-semantics decision.
        recallGap() { return undefined; },
    };
}
