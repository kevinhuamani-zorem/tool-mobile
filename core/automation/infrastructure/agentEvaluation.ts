import fs from 'fs';
import path from 'path';
import { AutomationHistoryStore } from './automationHistoryStore';
import { acceptanceArtifactHash } from '../contracts/acceptanceCriteria';
import { readGoldenCase } from './goldenDataset';
import { ApprovedGoldenStore, goldenPath } from './approvedGoldenStore';
import { evaluationFraction } from '../domain/evaluationMetrics';
import type { LayeredGenerationStageReport } from '../domain/layeredGenerationContracts';

export function recordEvaluationPass(packageDirectory: string, pass: 1 | 2, passed: boolean, errors: { all: string[]; behavior: string[]; interaction: string[]; integration: string[] }) {
    new AutomationHistoryStore(packageDirectory).capture('evaluation-pass.json', JSON.stringify({ schemaVersion: 1, pass,
        result: passed ? 'passed' : 'failed', errors, evaluatedAt: new Date().toISOString(), scope: 'static-generation' }), 'recorder', 'evaluation:pass', pass);
}
const fraction = evaluationFraction;

/** Reads immutable attempts. QA changes are associated with their original attempt, never relabel it. */
export function evaluateAutomationPackages(packageDirectories: string[], goldenRoot: string) {
    const attempts: any[] = []; const issues: string[] = [];
    const store = new ApprovedGoldenStore(goldenRoot);
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
                const artifact = own.flatMap(event => event.artifacts).filter(item => item.name === 'layered-generation-run.json').at(-1);
                const run = artifact ? JSON.parse(history.readArtifact(artifact).toString('utf8')) : undefined;
                const stages: LayeredGenerationStageReport[] = run?.stages || [];
                const states = own.filter(event => event.stage?.startsWith('run-state:')).flatMap(event => event.artifacts.filter(item => item.name === 'agent-run.json').map(item => JSON.parse(history.readArtifact(item).toString('utf8'))));
                const terminal = states.filter(state => state.finishedAt).at(-1);
                const interrupted = terminal?.agentCancelled === true || ['cancelled', 'interrupted', 'agent-cancelled'].includes(terminal?.result);
                const qaBoundary = own.find(event => event.kind === 'qa-validation-result' || event.origin === 'qa')?.sequence ?? Infinity;
                const originalEvents = own.filter(event => event.sequence < qaBoundary);
                const finalResponseArtifact = end?.stage === 'import-validation' ? end.artifacts.find(item => item.name === 'prepared-response.json')
                    : originalEvents.flatMap(event => event.artifacts).filter(item => item.name === 'agent-response.json').at(-1);
                const finalResponse = finalResponseArtifact ? JSON.parse(history.readArtifact(finalResponseArtifact).toString('utf8')) : undefined;
                const finalHash = Array.isArray(finalResponse?.files) ? acceptanceArtifactHash(finalResponse.files) : undefined;
                const passes = own.filter(event => event.stage === 'evaluation:pass').map(event => {
                    const file = event.artifacts.find(item => item.name === 'evaluation-pass.json');
                    return file ? JSON.parse(history.readArtifact(file).toString('utf8')) : undefined;
                }).filter(Boolean);
                const validation = own.filter(event => event.stage === 'evaluation:validation').flatMap(event => event.artifacts.map(item => JSON.parse(history.readArtifact(item).toString('utf8'))));
                const assessments = originalEvents.filter(event => event.origin === 'recorder' && (['evaluation:validation', 'evaluation:assessment'].includes(event.stage || '') || event.kind === 'generation-result' && event.stage === 'import-validation')).flatMap(event => event.artifacts.filter(item => !item.name.includes('response')).map(item => JSON.parse(history.readArtifact(item).toString('utf8')).assessment)).filter(Boolean);
                const assessment = finalHash ? assessments.filter(value => value.artifactHash === finalHash).at(-1) : undefined;
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
                const locatorFidelity = own.filter(event => event.stage === 'locator-fidelity').flatMap(event => event.artifacts
                    .filter(item => item.name === 'locator-fidelity.json' || item.name.endsWith('/locator-fidelity.json')).map(item => JSON.parse(history.readArtifact(item).toString('utf8'))));
                const qaFunctionalVerifications = events.filter(event => event.kind === 'qa-verification' && event.origin === 'qa' && (event.attemptId === attemptId || revisedIds.has(event.revisionId))).flatMap(event => {
                    const publication = event.artifacts.find(item => item.name === 'golden-publication.json');
                    if (!publication) return [];
                    const reference = JSON.parse(history.readArtifact(publication).toString('utf8'));
                    try {
                        const approved = store.read(reference.goldenId, reference.versionHash);
                        if (reference.revisionId && reference.revisionId !== event.revisionId || approved.manifest.revisionId !== event.revisionId || !['passed', 'failed'].includes(approved.manifest.executed || '')) return [];
                        const accepted = readGoldenCase(approved.directory);
                        const artifactHash = acceptanceArtifactHash(accepted.response.files);
                        if (reference.artifactHash && reference.artifactHash !== artifactHash) return [];
                        return [{ goldenId: reference.goldenId, versionHash: reference.versionHash, revisionId: event.revisionId,
                            result: approved.manifest.executed, artifactHash, source: 'qa-declaration',
                            matchesAutonomousArtifacts: artifactHash === finalHash && event.revisionId === start.revisionId && !corrections.length && reference.qaCorrected !== true }];
                    } catch { return []; } // Removed/revoked or unverifiable publications do not count as execution evidence.
                });
                const duration = run ? Date.parse(run.completedAt) - Date.parse(run.startedAt) : null;
                attempts.push({ attemptId, recordingId: start.recordingId, revisionId: start.revisionId, caseId: start.caseId,
                    status: interrupted ? 'interrupted' : end?.result || (terminal ? 'failed' : 'not-evaluated'), terminal: !!end || !!terminal, agentInvoked: invoked.length > 0 || (terminal?.agentInvocationCount || 0) > 0, invocations: artifact ? invoked.length : null,
                    firstPass: first?.result || 'not-evaluated', passes, validation, timedOut: invoked.some(stage => stage.timedOut) || terminal?.agentTimedOut === true,
                    wallTimeMs: duration !== null && Number.isFinite(duration) ? Math.max(0, duration) : null,
                    qaInterventions: corrections.length + own.filter(event => event.kind === 'qa-validation-result').length, qaApproved: approved,
                    functionalVerification: 'not-evaluated', qaFunctionalVerifications, assessment, finalArtifactHash: finalHash, contexts, retrieval, locatorFidelity,
                    models: [...new Set(stages.flatMap(stage => stage.actualModels || []))],
                });
            }
        } catch (error: any) { issues.push(`${directory}: ${error.message}`); }
    }
    const started = attempts.filter(attempt => attempt.reason !== 'legacy-without-immutable-attempt-evidence');
    const completed = attempts.filter(attempt => attempt.agentInvoked && ['passed', 'failed'].includes(attempt.status));
    const firstKnown = started.filter(attempt => ['passed', 'failed'].includes(attempt.firstPass));
    const errors: Record<string, { occurrences: number; attempts: Set<string>; roles: Set<string> }> = {};
    for (const attempt of completed) for (const pass of attempt.passes) for (const [role, messages] of Object.entries(pass.errors) as [string, string[]][]) {
        if (role === 'all') continue;
        for (const message of messages) {
            const code = /\[([a-z0-9-]+)\]/i.exec(message)?.[1] || 'unclassified';
            const item = errors[code] ||= { occurrences: 0, attempts: new Set(), roles: new Set() };
            item.occurrences++; item.attempts.add(attempt.attemptId); item.roles.add(role);
        }
    }
    const index = store.index();
    const qaFunctional = [...new Map(attempts.flatMap(attempt => attempt.qaFunctionalVerifications || []).map((value: any) => [`${value.goldenId}:${value.versionHash}:${value.revisionId}`, value])).values()] as any[];
    const reserved = index.entries.filter(entry => store.read(entry.goldenId, entry.versionHash).publication.usage === 'evaluation');
    const groups = (enabled: boolean) => completed.filter(attempt => attempt.contexts.length && attempt.contexts.every((context: any) => context.enabled === enabled));
    const comparison = (group: any[]) => ({ autonomousFinal: fraction(group.filter(attempt => attempt.status === 'passed').length, group.length),
        sampleSize: group.length, actuallyReceivedExamples: group.filter(attempt => attempt.contexts.some((context: any) => context.references.length)).length });
    const retrieval = completed.flatMap(attempt => attempt.retrieval || []);
    const sum = (field: string) => retrieval.reduce((total: number, item: any) => total + (Number(item[field]) || 0), 0);
    const locatorReports = completed.flatMap(attempt => attempt.locatorFidelity || []);
    const locatorTotal = (key: string) => locatorReports.reduce((total: number, report: any) => total + (Number(report[key]) || 0), 0);
    return { schemaVersion: 1, evaluationVersion: 'agent-evaluation/v3', generatedAt: new Date().toISOString(),
        status: index.entries.length && reserved.length && completed.length ? 'observational' : 'not-evaluated',
        ruleObservations: completed.flatMap(attempt => attempt.validation.flatMap((validation: any) => (validation.issues || []).map((issue: any) => ({ attemptId: attempt.attemptId, pass: validation.pass, code: issue.code, layer: issue.layer, file: issue.file })))),
        corpus: { active: index.entries.length, references: index.entries.length - reserved.length, reserved: reserved.length, fingerprint: index.fingerprint,
            issues: index.issues, curatedTarget: '5–8 QA-approved cases; separate evaluation cases' },
        metrics: {
            termination: fraction(started.filter(attempt => attempt.terminal && attempt.status !== 'interrupted').length, started.length, started.filter(attempt => !attempt.terminal).length),
            interrupted: fraction(started.filter(attempt => attempt.status === 'interrupted').length, started.length),
            staticFinal: fraction(completed.filter(attempt => attempt.status === 'passed').length, started.length, started.length - completed.length),
            acceptanceImplementation: fraction(started.filter(attempt => attempt.assessment?.acceptance?.status === 'passed').length,
                started.filter(attempt => ['passed', 'failed'].includes(attempt.assessment?.acceptance?.status)).length,
                started.filter(attempt => !['passed', 'failed'].includes(attempt.assessment?.acceptance?.status)).length),
            functionalTaskSuccess: fraction(0, 0, started.length),
            qaDeclaredFunctional: { ...fraction(qaFunctional.filter(value => value.result === 'passed').length, qaFunctional.length,
                started.filter(attempt => !attempt.qaFunctionalVerifications?.length).length), source: 'qa-declaration', scope: 'Verified approved revision, including QA corrections; not autonomous success.' },
            qaDeclaredAutonomousFunctional: { ...fraction(qaFunctional.filter(value => value.matchesAutonomousArtifacts && value.result === 'passed').length,
                qaFunctional.filter(value => value.matchesAutonomousArtifacts).length, started.filter(attempt => !attempt.qaFunctionalVerifications?.some((value: any) => value.matchesAutonomousArtifacts)).length), source: 'qa-declaration' },
            autonomousTaskSuccess: fraction(started.filter(attempt => attempt.agentInvoked === true && attempt.status === 'passed' && attempt.assessment?.acceptance?.status === 'passed').length,
                started.length, started.filter(attempt => attempt.agentInvoked !== true || !attempt.assessment || attempt.assessment.acceptance?.status === 'not-evaluated').length),
            locatorFidelity: {
                measuredStages: locatorReports.length,
                beforeRecorderCorrection: fraction(locatorTotal('matched'), locatorTotal('checked'), completed.filter(attempt => !attempt.locatorFidelity?.length).length),
                correctedGetters: locatorReports.reduce((total: number, report: any) => total + (report.corrected ? new Set((report.corrections || []).map((item: any) => `${item.file}:${item.typeStart}`)).size : 0), 0),
                unverified: locatorReports.reduce((total: number, report: any) => total + (report.unverified?.length || 0) + (report.invalidEvidence?.length || 0), 0),
                scope: 'static bindings per author pass; functional failures are not inferred',
            }, goldenRetrieval: { measuredStages: retrieval.length, notEvaluatedAttempts: completed.filter(attempt => !attempt.retrieval?.length).length,
                candidateCases: sum('candidates'), initialExamples: sum('examples'), initialBytes: sum('bytes'), requests: sum('requests'), rejected: sum('rejected'),
                responseBytes: sum('responseBytes'), indexMs: sum('indexMs'), retrievalMs: sum('retrievalMs'), rebuiltCases: sum('rebuiltCases'), reusedCases: sum('reusedCases'),
                observation: 'Context made available; actual model reads are not measured.' }, autonomousFirstPass: fraction(firstKnown.filter(attempt => attempt.firstPass === 'passed').length, firstKnown.length, attempts.length - firstKnown.length),
            autonomousFinal: fraction(completed.filter(attempt => attempt.status === 'passed').length, started.length, attempts.length - completed.length),
            qaIntervention: fraction(completed.filter(attempt => attempt.qaInterventions > 0).length, completed.length),
            qaApprovalAfterFailure: fraction(completed.filter(attempt => attempt.status === 'failed' && attempt.qaApproved).length, completed.filter(attempt => attempt.status === 'failed').length),
            timeouts: fraction(started.filter(attempt => attempt.timedOut).length, started.length),
            errors: Object.entries(errors).map(([code, value]) => ({ code, occurrences: value.occurrences, attempts: value.attempts.size, denominator: completed.length,
                recurrentAcrossAttempts: value.attempts.size > 1, roles: [...value.roles].sort() })),
            withExamplesEnabled: comparison(groups(true)), withoutExamples: comparison(groups(false)) },
        limitations: ['Static generation results are separate from QA declarations and device execution.', 'autonomousFinal is a legacy static metric; autonomousTaskSuccess also requires artifact-bound acceptance evidence. Missing/unfinished attempts stay in the scheduled denominator.', 'Observational groups are not a controlled comparison; do not infer a general success rate.',
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
