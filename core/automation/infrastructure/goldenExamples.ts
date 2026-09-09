import fs from 'fs';
import path from 'path';
import { GoldenSnapshotReader } from './goldenSnapshot';
import { ReuseAnalyzer } from '../../indexing';
import { matchingStepDefinitions } from '../../shared';
import { actionIdentity, fragmentsFromValidatedCase, recallInteractions, InteractionFragment } from '../domain/memoryFragments';
import type { AutomationScenario } from '../contracts';
import type { GenerationAgentRole } from '../domain/layeredGenerationContracts';
import { ApprovedGoldenStore, goldenHash } from './approvedGoldenStore';
import { goldenDatasetRoot, readGoldenCase } from './goldenDataset';
import { AutomationHistoryStore } from './automationHistoryStore';
import { projectPaths } from '../../workspace';
import { GoldenExample, readGoldenReference } from './goldenReference';
import { GoldenRetrievalIndex, GOLDEN_CONTRACT, GoldenRetrievalPurpose, goldenRetrievalPurpose } from './goldenRetrievalIndex';
import { GoldenReferenceSession, GoldenPreparedContext, GOLDEN_SELECTION_VERSION } from './goldenRetrieval';

export { GOLDEN_SELECTION_VERSION } from './goldenRetrieval';
export type { GoldenExample } from './goldenReference';
export const GOLDEN_EXAMPLE_CONTRACT = GOLDEN_CONTRACT;
const read = (root: string, name: string): any => new GoldenSnapshotReader(root).json(name);
export interface GoldenExamples {
    schemaVersion: 1; selectionVersion: string; contract: string; fingerprint: string; enabled: boolean;
    recordingId: string; examples: GoldenExample[]; excluded: Array<{ goldenId: string; reason: string }>; issues: string[];
}
const empty = (scenario: AutomationScenario, enabled: boolean): GoldenExamples => ({ schemaVersion: 1, selectionVersion: GOLDEN_SELECTION_VERSION,
    contract: GOLDEN_CONTRACT, fingerprint: enabled ? 'unavailable' : 'disabled', enabled, recordingId: scenario.recordingId,
    examples: [], excluded: [], issues: [] });

/** Explicit full reads remain available to deterministic consumers, with no count or byte caps. */
export function selectGoldenExamples(scenario: AutomationScenario, options: { root?: string; frameworkRoot?: string; enabled?: boolean; exactFragments?: boolean; purpose?: GoldenRetrievalPurpose } = {}): GoldenExamples {
    const enabled = options.enabled ?? process.env.RECORDER_GOLDEN_EXAMPLES !== '0', result = empty(scenario, enabled);
    if (!enabled) return result;
    const root = options.root || goldenDatasetRoot(), store = new ApprovedGoldenStore(root);
    const search = new GoldenRetrievalIndex(root).search(scenario, options.frameworkRoot || projectPaths.frameworkRoot, undefined, [], options.exactFragments ? 'evaluation' : options.purpose);
    Object.assign(result, { fingerprint: search.fingerprint, excluded: search.excluded, issues: search.issues });
    const actions = (scenario.actions || []).map(action => JSON.stringify([actionIdentity(action, scenario.platform), action.selectorVerified === true, action.value ?? '', action.textAssertion ?? null]));
    for (const candidate of search.candidates) {
        if (options.exactFragments && (!candidate.metadata.relationsVerified || !candidate.metadata.exactActions.some(action => actions.includes(action)))) continue;
        try { result.examples.push({ ...readGoldenReference(candidate.entry, store).example, score: candidate.score }); }
        catch { result.excluded.push({ goldenId: candidate.entry.goldenId, reason: 'integrity-error' }); }
    }
    return result;
}

/** Package preparation stores discovery metadata; role-specific code is materialized only when needed. */
export function prepareGoldenExamples(packageDirectory: string): GoldenExamples {
    const scenario = read(packageDirectory, 'scenario.json') as AutomationScenario;
    const result = empty(scenario, process.env.RECORDER_GOLDEN_EXAMPLES !== '0');
    let discovery: unknown;
    try {
        if (result.enabled) {
            const search = new GoldenRetrievalIndex(goldenDatasetRoot()).search(scenario, projectPaths.frameworkRoot, undefined, [], goldenRetrievalPurpose());
            Object.assign(result, { fingerprint: search.fingerprint, excluded: search.excluded, issues: search.issues });
            discovery = { candidates: search.candidates.length, needs: search.needs, delivery: 'progressive-by-role', purpose: goldenRetrievalPurpose() };
        }
    } catch (error: any) { result.issues.push(error.message); }
    fs.writeFileSync(path.join(packageDirectory, 'golden-examples.json'), JSON.stringify({ ...result, discovery }, null, 2) + '\n');
    return result;
}

export function writeGoldenRoleExamples(packageDirectory: string, stageDirectory: string, role: GenerationAgentRole, pass: 1 | 2, integrationErrors: string[] = []): GoldenPreparedContext {
    const scenario = read(packageDirectory, 'scenario.json') as AutomationScenario;
    if (role === 'integration-reviewer' && fs.existsSync(path.join(packageDirectory, 'gaps.json'))) {
        const gaps = read(packageDirectory, 'gaps.json').gaps || [];
        integrationErrors = [...integrationErrors, ...gaps.filter((gap: any) => integrationErrors.includes(gap.id)).map((gap: any) => JSON.stringify(gap))];
    }
    let session: GoldenReferenceSession | undefined;
    let payload: any;
    try {
        session = new GoldenReferenceSession({ root: goldenDatasetRoot(), frameworkRoot: projectPaths.frameworkRoot,
            scenario, role, pass, integrationErrors, purpose: goldenRetrievalPurpose(), enabled: process.env.RECORDER_GOLDEN_EXAMPLES !== '0' });
        payload = session.initialPayload();
    } catch (error: any) {
        payload = { ...empty(scenario, process.env.RECORDER_GOLDEN_EXAMPLES !== '0'), role, pass, issues: [error.message] };
    }
    const content = JSON.stringify(payload, null, 2) + '\n';
    const file = path.join(stageDirectory, 'golden-examples.json'); fs.writeFileSync(file, content);
    new AutomationHistoryStore(packageDirectory).capture('golden-examples/' + role + '.json', content, 'recorder', 'golden-context:' + role, pass);
    return { file, sha256: goldenHash(content), fingerprint: payload.fingerprint, session,
        references: payload.examples.map((example: GoldenExample) => ({ goldenId: example.goldenId, revisionId: example.revisionId, versionHash: example.versionHash })),
        initial: { candidates: payload.retrieval?.candidateCases || 0, groups: payload.retrieval?.patternGroups || 0, examples: payload.examples.length,
            bytes: Buffer.byteLength(content), indexMs: session?.search.metrics.indexMs || 0, rebuiltCases: session?.search.metrics.rebuiltCases || 0,
            reusedCases: session?.search.metrics.reusedCases || 0 } };
}


/** Exact fragments need both recovered trace proof and a unique current framework definition. */
export function goldenFragmentMemory(scenario: AutomationScenario, options: { root?: string; frameworkRoot?: string } = {}) {
    // ReuseAnalyzer reads the selected workspace; never combine it with another root.
    if (path.resolve(options.frameworkRoot || projectPaths.frameworkRoot) !== path.resolve(projectPaths.frameworkRoot)) return undefined;
    const selected = selectGoldenExamples(scenario, { ...options, exactFragments: true });
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
            if (squad !== scenario.squad || store.index().fingerprint !== selected.fingerprint) return undefined;
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
