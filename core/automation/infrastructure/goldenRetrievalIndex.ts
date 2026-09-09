import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { actionIdentity } from '../domain/memoryFragments';
import type { AutomationScenario } from '../contracts';
import type { GenerationAgentRole } from '../domain/layeredGenerationContracts';
import { ApprovedGoldenStore, goldenHash, goldenPath } from './approvedGoldenStore';
import { GoldenEntry, readGoldenReference } from './goldenReference';

export const GOLDEN_RETRIEVAL_VERSION = 'golden-retrieval/v1';
export const GOLDEN_RETRIEVAL_INDEX = 'retrieval-index.json';
export const GOLDEN_CONTRACT = 'mobile-four-layers/v1';
export const goldenTerms = (value: string) => [...new Set(value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/).filter(word => word.length > 3 && !['usuario', 'para', 'caso', 'realizar', 'debe'].includes(word)))];
export const goldenRoleLayers = (role?: GenerationAgentRole) => role === 'behavior-author' ? ['feature', 'steps']
    : role === 'interaction-author' ? ['screen', 'locators'] : role === 'integration-reviewer' ? [] : ['feature', 'steps', 'screen', 'locators'];

function facets(scenario: any, code = ''): string[] {
    const values = new Set<string>();
    const intent = goldenTerms((scenario.objective || '') + ' ' + (scenario.acceptanceCriteria || '')).join(' ');
    if (/\b(vacio|vacia|ningun|ninguna|ausencia)\b/.test(intent) || /sin ventas|aun no|no tiene|no hay/.test(
        ((scenario.objective || '') + ' ' + (scenario.acceptanceCriteria || '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) values.add('state:empty');
    if ((scenario.actions || []).some((a: any) => a.textAssertion || /TEXTO/.test(a.action)) || /\b(texto|mensaje)\b/.test(intent) || /\btoHaveText\b/.test(code)) values.add('assertion:text');
    if ((scenario.actions || []).some((a: any) => /VERIFICAR/.test(a.action)) || /\btoBeDisplayed\b/.test(code)) values.add('assertion:visible');
    if (Object.keys(scenario.request?.examples || {}).length || scenario.request?.scenarioRows?.some((row: any) => row.dataTable)
        || /Scenario Outline:|Examples:/.test(code)) values.add('data:parameters');
    if ((scenario.actions || []).some((a: any) => /CLICK|TAP|PRESIONAR/.test(a.action)) || /waitForDisplayed|waitForEnabled|waitForExist/.test(code)) values.add('interaction:ready');
    if ((scenario.actions || []).some((a: any) => /ESCRIBIR/.test(a.action))) values.add('interaction:input');
    return [...values].sort();
}
const pattern = (files: Array<{ layer: string; content: string }>) => goldenHash(JSON.stringify(files.map(file => ({
    layer: file.layer, code: file.content.replace(/^\s*#.*$/gm, '').replace(/^\s*(Feature|Scenario(?: Outline)?):.*$/gm, '$1:')
        .replace(/TC-\d+/g, 'TC-ID').replace(/\s+/g, ' ').trim(),
})).sort((a, b) => a.layer.localeCompare(b.layer))));

export interface GoldenMetadata {
    actions: string[]; terms: string[]; facets: string[]; layers: string[]; patterns: Record<string, string>;
    relationsVerified: boolean; relations: any[];
    lessons: Array<{ path: string; layer: string; observedRuleCodes: string[] }>;
    files: Array<{ path: string; layer: string; sha256: string }>;
    frameworkFiles: Array<{ path: string; sha256: string }>;
    exactActions: string[];
}
export interface GoldenCandidate { entry: GoldenEntry; metadata: GoldenMetadata; score: number; coverage: string[]; groupId: string }
export interface GoldenSearchResult {
    fingerprint: string; issues: string[]; candidates: GoldenCandidate[]; needs: string[];
    excluded: Array<{ goldenId: string; reason: string }>;
    metrics: { indexedCases: number; rebuiltCases: number; reusedCases: number; indexMs: number; searchMs: number };
}
type IndexCache = { records: Map<string, { identity: string; value: GoldenMetadata }>; persisted?: string };
const indexes = new Map<string, IndexCache>();

/** Metadata is rebuilt once per changed approval; no serialized cache is trusted as authority. */
export class GoldenRetrievalIndex {
    readonly root: string;
    constructor(root: string) { this.root = path.resolve(root); }
    refresh(rebuildProjection = false) {
        const started = performance.now();
        const store = new ApprovedGoldenStore(this.root);
        const index = store.index();
        const state: IndexCache = indexes.get(this.root) || { records: new Map() }; indexes.set(this.root, state);
        const active = new Set<string>(); let rebuiltCases = 0, reusedCases = 0;
        const records: Array<{ entry: GoldenEntry; metadata: GoldenMetadata }> = [];
        for (const entry of index.entries) {
            if (entry.usage === 'evaluation') continue;
            active.add(entry.goldenId);
            const identity = goldenHash(JSON.stringify([entry.manifestHash, entry.versionHash, entry.approval]));
            let cached = state.records.get(entry.goldenId);
            if (!cached || cached.identity !== identity) {
                try {
                    const { example, scenario, frameworkFiles } = readGoldenReference(entry, store);
                    const files = example.files;
                    cached = { identity, value: {
                        actions: example.actions, terms: goldenTerms(scenario.objective + ' ' + scenario.acceptanceCriteria),
                        facets: facets(scenario, files.map(file => file.content).join('\n')), layers: [...new Set(files.map(file => file.layer))],
                        patterns: Object.fromEntries(['behavior-author', 'interaction-author', 'integration-reviewer', 'all'].map(role =>
                            [role, pattern(files.filter(file => goldenRoleLayers(role === 'all' ? undefined : role as GenerationAgentRole).includes(file.layer)))])),
                        files: files.map(file => ({ path: file.path, layer: file.layer, sha256: goldenHash(file.content) })),
                        lessons: example.lessons.map(({ path, layer, observedRuleCodes }) => ({ path, layer, observedRuleCodes })),
                        relationsVerified: example.relationsVerified, relations: example.relations,
                        frameworkFiles, exactActions: (scenario.actions || []).map((action: any) => JSON.stringify([
                            actionIdentity(action, scenario.platform), action.selectorVerified === true, action.value ?? '', action.textAssertion ?? null,
                        ])),
                    } };
                    state.records.set(entry.goldenId, cached); rebuiltCases++;
                } catch { index.issues.push(entry.goldenId + ': referencia no disponible.'); continue; }
            } else reusedCases++;
            records.push({ entry, metadata: structuredClone(cached.value) });
        }
        for (const key of state.records.keys()) if (!active.has(key)) state.records.delete(key);
        const document = JSON.stringify({ schemaVersion: 1, version: GOLDEN_RETRIEVAL_VERSION, fingerprint: index.fingerprint,
            records: records.map(({ entry, metadata }) => ({ goldenId: entry.goldenId, versionHash: entry.versionHash, manifestHash: entry.manifestHash,
                scope: { squad: entry.squad, platform: entry.platform, environment: entry.environment, featureScope: entry.featureScope }, ...metadata })) }) + '\n';
        try {
            const file = goldenPath(this.root, GOLDEN_RETRIEVAL_INDEX);
            if (rebuildProjection || state.persisted !== goldenHash(document) || !fs.existsSync(file)) {
                fs.mkdirSync(this.root, { recursive: true });
                const temporary = goldenPath(this.root, GOLDEN_RETRIEVAL_INDEX + '.' + crypto.randomUUID() + '.tmp');
                try { fs.writeFileSync(temporary, document, { flag: 'wx' }); fs.renameSync(temporary, file); state.persisted = goldenHash(document); }
                finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
            }
        } catch { /* A read-only checkout still permits verified references in memory. */ }
        return { index, records, metrics: { indexedCases: records.length, rebuiltCases, reusedCases, indexMs: performance.now() - started } };
    }
    search(scenario: AutomationScenario, frameworkRoot: string, role?: GenerationAgentRole, integrationErrors: string[] = []): GoldenSearchResult {
        const started = performance.now();
        const { index, records, metrics } = this.refresh();
        const actions = [...new Set((scenario.actions || []).map(action => action.action))];
        const terms = goldenTerms((scenario.objective || '') + ' ' + (scenario.acceptanceCriteria || ''));
        const rules = [...new Set(integrationErrors.flatMap(error => [...error.matchAll(/\[([a-z0-9-]+)\]/gi)].map(match => match[1])))];
        const needs = [...actions.map(action => 'action:' + action), ...terms.map(term => 'intent:' + term), ...facets(scenario), ...rules.map(rule => 'rule:' + rule)];
        const candidates: GoldenCandidate[] = [], excluded: GoldenSearchResult['excluded'] = [];
        const frameworkHashes = new Map<string, string | null>();
        for (const { entry, metadata } of records) {
            const exclude = (reason: string) => excluded.push({ goldenId: entry.goldenId, reason });
            if (entry.squad !== scenario.squad || entry.platform !== scenario.platform || entry.contract !== GOLDEN_CONTRACT
                || entry.environment !== (scenario.environment || '') || entry.featureScope !== (scenario.request?.featureScope || '')) { exclude('incompatible-framework-or-scope'); continue; }
            if (entry.recordingId === scenario.recordingId || entry.caseId && entry.caseId === scenario.request?.caseId) { exclude('same-case'); continue; }
            const matchedActions = actions.filter(action => metadata.actions.includes(action));
            const matchedTerms = terms.filter(term => metadata.terms.includes(term));
            if (!matchedActions.length || !matchedTerms.length) { exclude('unrelated-intent-or-actions'); continue; }
            if (role && role !== 'integration-reviewer' && !metadata.layers.some(layer => goldenRoleLayers(role).includes(layer))) continue;
            if (role === 'integration-reviewer' && (!integrationErrors.length || !metadata.relationsVerified)) continue;
            const compatible = metadata.frameworkFiles.every(file => {
                if (!frameworkHashes.has(file.path)) {
                    try { frameworkHashes.set(file.path, goldenHash(fs.readFileSync(goldenPath(frameworkRoot, file.path)))); }
                    catch { frameworkHashes.set(file.path, null); }
                }
                return frameworkHashes.get(file.path) === file.sha256;
            });
            if (!compatible) { exclude('incompatible-framework-or-scope'); continue; }
            const matchedRules = rules.filter(rule => metadata.lessons.some(lesson => lesson.observedRuleCodes.includes(rule)));
            const coverage = [...matchedActions.map(action => 'action:' + action), ...matchedTerms.map(term => 'intent:' + term),
                ...facets(scenario).filter(facet => metadata.facets.includes(facet)), ...matchedRules.map(rule => 'rule:' + rule)];
            const score = matchedActions.length / new Set([...actions, ...metadata.actions]).size * 0.65
                + matchedTerms.length / new Set([...terms, ...metadata.terms]).size * 0.35 + matchedRules.length;
            candidates.push({ entry, metadata, score, coverage, groupId: 'pattern-' + goldenHash(JSON.stringify([
                role || 'all', metadata.patterns[role || 'all'], metadata.facets, metadata.lessons.map(lesson => lesson.observedRuleCodes),
            ])) });
        }
        candidates.sort((a, b) => b.score - a.score || b.entry.approval.at.localeCompare(a.entry.approval.at) || a.entry.goldenId.localeCompare(b.entry.goldenId));
        return { fingerprint: index.fingerprint, issues: index.issues, candidates, needs, excluded,
            metrics: { ...metrics, searchMs: performance.now() - started - metrics.indexMs } };
    }
}

/** Select additional examples only when they cover a still-unrepresented need, never by a byte/count cap. */
export function selectGoldenCoverage(candidates: GoldenCandidate[]): GoldenCandidate[] {
    const selected: GoldenCandidate[] = [], covered = new Set<string>(), groups = new Set<string>();
    for (const candidate of candidates) {
        if (groups.has(candidate.groupId) || !candidate.coverage.some(need => !covered.has(need))) continue;
        selected.push(candidate); groups.add(candidate.groupId); candidate.coverage.forEach(need => covered.add(need));
    }
    return selected;
}
