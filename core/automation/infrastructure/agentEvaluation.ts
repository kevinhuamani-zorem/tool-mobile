import fs from 'fs';
import path from 'path';
import { AutomationHistoryStore } from './automationHistoryStore';
import { ApprovedGoldenStore, goldenHash, goldenPath } from './approvedGoldenStore';
import type { LayeredGenerationStageReport } from '../domain/layeredGenerationContracts';

export function recordEvaluationPass(packageDirectory: string, pass: 1 | 2, passed: boolean, errors: { all: string[]; behavior: string[]; interaction: string[]; integration: string[] }) {
    new AutomationHistoryStore(packageDirectory).capture('evaluation-pass.json', JSON.stringify({ schemaVersion: 1, pass,
        result: passed ? 'passed' : 'failed', errors, evaluatedAt: new Date().toISOString(), scope: 'static-generation' }), 'recorder', 'evaluation:pass', pass);
}
const fraction = (numerator: number, denominator: number, unknown = 0) => ({ numerator, denominator, rate: denominator ? numerator / denominator : null, notEvaluated: unknown });

/** Reads immutable attempts. QA changes are associated with their original attempt, never relabel it. */
export function evaluateAutomationPackages(packageDirectories: string[], goldenRoot: string) {
    const attempts: any[] = []; const issues: string[] = [];
    for (const directory of packageDirectories) {
        try {
            const history = new AutomationHistoryStore(directory); const events = history.events();
            const ids = [...new Set(events.filter(event => event.kind === 'attempt-started').map(event => event.attemptId).filter(Boolean))];
            if (!ids.length && fs.existsSync(path.join(directory, 'agent-run.json'))) {
                const legacy = JSON.parse(fs.readFileSync(goldenPath(directory, 'agent-run.json'), 'utf8'));
                attempts.push({ attemptId: legacy.runId || 'legacy', recordingId: legacy.recordingId, status: 'not-evaluated',
                    agentInvoked: false, invocations: null, firstPass: 'not-evaluated', passes: [], validation: [], qaInterventions: 0,
                    functionalVerification: 'not-evaluated', contexts: [], reason: 'legacy-without-immutable-attempt-evidence' });
            }
            for (const attemptId of ids) {
                const own = events.filter(event => event.attemptId === attemptId);
                const start = own.find(event => event.kind === 'attempt-started')!;
                const end = own.filter(event => event.kind === 'generation-result').at(-1);
                const artifact = end?.artifacts.find(item => item.name === 'layered-generation-run.json');
                const run = artifact ? JSON.parse(history.readArtifact(artifact).toString('utf8')) : undefined;
                const stages: LayeredGenerationStageReport[] = run?.stages || [];
                const passes = own.filter(event => event.stage === 'evaluation:pass').map(event => {
                    const file = event.artifacts.find(item => item.name === 'evaluation-pass.json');
                    return file ? JSON.parse(history.readArtifact(file).toString('utf8')) : undefined;
                }).filter(Boolean);
                const validation = own.filter(event => event.stage === 'evaluation:validation').flatMap(event => event.artifacts.map(item => JSON.parse(history.readArtifact(item).toString('utf8'))));
                const first = passes.filter(pass => pass.pass === 1).at(-1);
                const invoked = stages.filter(stage => stage.invoked === true || stage.invoked === undefined && ['agent', 'design-review'].includes(stage.execution || ''));
                const corrections = events.filter(event => event.basedOnAttemptId === attemptId && event.kind === 'revision-created' && ['qa-edit', 'framework-import'].includes(event.source || ''));
                const revisedIds = new Set(corrections.map(event => event.revisionId));
                const approved = events.some(event => (revisedIds.has(event.revisionId) || event.attemptId === attemptId) && event.kind === 'qa-verification' && event.result === 'approved');
                const contexts = own.filter(event => event.stage?.startsWith('golden-context:')).flatMap(event => event.artifacts.map(item => {
                    const value = JSON.parse(history.readArtifact(item).toString('utf8'));
                    return { role: value.role, pass: value.pass, contract: value.contract, selectionVersion: value.selectionVersion, sha256: item.sha256, fingerprint: value.fingerprint, enabled: value.enabled,
                        initialBytes: item.bytes, retrievalVersion: value.retrieval?.version, candidateCases: value.retrieval?.candidateCases,
                        references: (value.examples || []).map((example: any) => ({ goldenId: example.goldenId, revisionId: example.revisionId, versionHash: example.versionHash })) };
                }));
                const retrieval = own.filter(event => event.stage?.startsWith('golden-retrieval:')).flatMap(event => event.artifacts.map(item => JSON.parse(history.readArtifact(item).toString('utf8'))));
                const duration = run ? Date.parse(run.completedAt) - Date.parse(run.startedAt) : null;
                attempts.push({ attemptId, recordingId: start.recordingId, revisionId: start.revisionId, caseId: start.caseId,
                    status: end?.result || 'not-evaluated', agentInvoked: invoked.length > 0, invocations: artifact ? invoked.length : null,
                    firstPass: first?.result || 'not-evaluated', passes, validation, timedOut: invoked.some(stage => stage.timedOut),
                    wallTimeMs: duration !== null && Number.isFinite(duration) ? Math.max(0, duration) : null,
                    qaInterventions: corrections.length + own.filter(event => event.kind === 'qa-validation-result').length, qaApproved: approved,
                    functionalVerification: 'not-evaluated', contexts, retrieval,
                    models: [...new Set(stages.flatMap(stage => stage.actualModels || []))],
                });
            }
        } catch (error: any) { issues.push(`${directory}: ${error.message}`); }
    }
    const completed = attempts.filter(attempt => attempt.agentInvoked && ['passed', 'failed'].includes(attempt.status));
    const firstKnown = completed.filter(attempt => ['passed', 'failed'].includes(attempt.firstPass));
    const errors: Record<string, { occurrences: number; attempts: Set<string>; roles: Set<string> }> = {};
    for (const attempt of completed) for (const pass of attempt.passes) for (const [role, messages] of Object.entries(pass.errors) as [string, string[]][]) {
        if (role === 'all') continue;
        for (const message of messages) {
            const code = /\[([a-z0-9-]+)\]/i.exec(message)?.[1] || 'unclassified';
            const item = errors[code] ||= { occurrences: 0, attempts: new Set(), roles: new Set() };
            item.occurrences++; item.attempts.add(attempt.attemptId); item.roles.add(role);
        }
    }
    const store = new ApprovedGoldenStore(goldenRoot); const index = store.index();
    const reserved = index.entries.filter(entry => store.read(entry.goldenId, entry.versionHash).publication.usage === 'evaluation');
    const groups = (enabled: boolean) => completed.filter(attempt => attempt.contexts.length && attempt.contexts.every((context: any) => context.enabled === enabled));
    const comparison = (group: any[]) => ({ autonomousFinal: fraction(group.filter(attempt => attempt.status === 'passed').length, group.length),
        sampleSize: group.length, actuallyReceivedExamples: group.filter(attempt => attempt.contexts.some((context: any) => context.references.length)).length });
    const retrieval = completed.flatMap(attempt => attempt.retrieval || []);
    const sum = (field: string) => retrieval.reduce((total: number, item: any) => total + (Number(item[field]) || 0), 0);
    return { schemaVersion: 1, evaluationVersion: 'agent-evaluation/v2', generatedAt: new Date().toISOString(),
        status: index.entries.length && reserved.length && completed.length ? 'observational' : 'not-evaluated',
        ruleObservations: completed.flatMap(attempt => attempt.validation.flatMap((validation: any) => validation.issues.map((issue: any) => ({ attemptId: attempt.attemptId, pass: validation.pass, code: issue.code, layer: issue.layer, file: issue.file })))),
        corpus: { active: index.entries.length, references: index.entries.length - reserved.length, reserved: reserved.length, fingerprint: index.fingerprint,
            issues: index.issues, curatedTarget: '5–8 QA-approved cases; separate evaluation cases' },
        metrics: { goldenRetrieval: { measuredStages: retrieval.length, notEvaluatedAttempts: completed.filter(attempt => !attempt.retrieval?.length).length,
                candidateCases: sum('candidates'), initialExamples: sum('examples'), initialBytes: sum('bytes'), requests: sum('requests'), rejected: sum('rejected'),
                responseBytes: sum('responseBytes'), indexMs: sum('indexMs'), retrievalMs: sum('retrievalMs'), rebuiltCases: sum('rebuiltCases'), reusedCases: sum('reusedCases'),
                observation: 'Context made available; actual model reads are not measured.' }, autonomousFirstPass: fraction(firstKnown.filter(attempt => attempt.firstPass === 'passed').length, firstKnown.length, attempts.length - firstKnown.length),
            autonomousFinal: fraction(completed.filter(attempt => attempt.status === 'passed').length, completed.length, attempts.length - completed.length),
            qaIntervention: fraction(completed.filter(attempt => attempt.qaInterventions > 0).length, completed.length),
            qaApprovalAfterFailure: fraction(completed.filter(attempt => attempt.status === 'failed' && attempt.qaApproved).length, completed.filter(attempt => attempt.status === 'failed').length),
            timeouts: fraction(completed.filter(attempt => attempt.timedOut).length, completed.length),
            errors: Object.entries(errors).map(([code, value]) => ({ code, occurrences: value.occurrences, attempts: value.attempts.size, denominator: completed.length,
                recurrentAcrossAttempts: value.attempts.size > 1, roles: [...value.roles].sort() })),
            withExamplesEnabled: comparison(groups(true)), withoutExamples: comparison(groups(false)) },
        limitations: ['Static generation results are separate from QA declarations and device execution.', 'Observational groups are not a controlled comparison; do not infer a general success rate.',
            ...(!index.entries.length ? ['No QA-approved golden corpus.'] : []), ...(!reserved.length ? ['No reserved evaluation cases.'] : [])], attempts, issues };
}

export function findAutomationPackages(root: string): string[] {
    const packages: string[] = [];
    const walk = (directory: string) => {
        if (!fs.existsSync(directory)) return;
        if (fs.existsSync(goldenPath(directory, 'history/v1/events')) || fs.existsSync(goldenPath(directory, 'agent-run.json'))) { packages.push(directory); return; }
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name.startsWith('.') || ['agents', 'node_modules', 'dist'].includes(entry.name)) continue;
            walk(goldenPath(directory, entry.name));
        }
    };
    walk(root); return packages.sort();
}
