const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isolatedFramework } = require('./helpers/isolatedFramework');
const {
    AutomationPackageBuilder,
    AutomationMemory,
    actionIdentity,
    fragmentsFromValidatedCase,
    mergeMemoryFragments,
    recallInteractions,
    recallGap,
} = require('../dist/core/automation');
const { DeterministicGenerator } = require('../dist/core/generation');
const { AutomationResponseValidator } = require('../dist/core/validation');
const { projectPaths } = require('../dist/core/workspace');

// La memoria de casos solo sirve para regenerar la misma grabacion. Lo que un
// QA repite entre recordings son interacciones y verificaciones sobre los
// mismos elementos: eso es lo que la memoria de fragmentos conserva y lo que
// otro recording debe poder reutilizar sin volver a pagar al agente.

function step(sequence, action, selector, extra = {}) {
    return {
        action, sequence, platform: 'android', variableName: '', contextHint: `hint ${sequence}`, elementIntent: '',
        selector, value: '', description: '', locatorType: 'ID', locatorValue: selector.replace(/^~/, ''),
        selectorVerified: true, ...extra,
    };
}

function scenario(actions, overrides = {}) {
    return {
        schemaVersion: 1, pipelineVersion: '1.0.0', recordingId: 'rec-memory-a', revision: 1,
        fingerprint: 'fp-a', createdAt: new Date(0).toISOString(),
        squad: 'payment', platform: 'android', environment: 'qa',
        objective: 'el usuario consulta el historial', acceptanceCriteria: 'se muestra el historial',
        request: {
            squad: 'payment', featureScope: '', featureName: 'F', scenarioName: 'S', fileName: 'f',
            locatorModule: 'm', caseId: 'TC-1', pathType: 'Happy Path', tag: 't', dataName: 'QA', platform: 'android',
        },
        actions,
        ...overrides,
    };
}

test('un caso validado deja fragmentos por step contiguo y por gap de elemento', () => {
    const recorded = scenario([
        step(1, 'CLICK', '~Historial'),
        step(2, 'SCROLL_DOWN', ''),
        step(3, 'CLICK', '~Ver todo'),
        step(4, 'VERIFICAR_TEXTO', 'android=new UiSelector().text("Historial")', { value: 'Historial' }),
    ]);
    const response = {
        resolutions: [{ gapId: 'gap-verification-4', decision: 'reuse', reason: 'El titulo es estable.' }],
        actionTrace: [
            { sequence: 1, gherkinStep: 'When el usuario abre el historial completo', screenMethod: 'openFullHistory', locatorName: 'historyButton' },
            { sequence: 2, gherkinStep: 'When el usuario abre el historial completo', screenMethod: 'openFullHistory' },
            { sequence: 3, gherkinStep: 'When el usuario abre el historial completo', screenMethod: 'openFullHistory', locatorName: 'seeAllButton' },
            { sequence: 4, gherkinStep: 'Then se muestra el titulo del historial', screenMethod: 'validateHistoryTitle', locatorName: 'historyTitle' },
        ],
        files: [],
    };
    const gaps = [{ id: 'gap-verification-4', sequence: 4, type: 'verification-semantics', description: '', requiredOutput: '' }];
    const learned = fragmentsFromValidatedCase({ scenario: recorded, response, gaps, promotedAt: '2026-09-04T00:00:00Z' });

    assert.equal(learned.interactions.length, 2);
    assert.deepEqual(learned.interactions[0].identities, recorded.actions.slice(0, 3).map(item => actionIdentity(item, 'android')));
    assert.equal(learned.interactions[0].keyword, 'When');
    assert.equal(learned.interactions[0].text, 'el usuario abre el historial completo');
    assert.equal(learned.interactions[0].screenMethod, 'openFullHistory');
    assert.deepEqual(learned.interactions[0].locatorNames, ['historyButton', 'seeAllButton']);
    assert.equal(learned.interactions[1].text, 'se muestra el titulo del historial');
    assert.equal(learned.gaps.length, 1);
    assert.equal(learned.gaps[0].decision, 'reuse');
    assert.equal(learned.gaps[0].identity, actionIdentity(recorded.actions[3], 'android'));

    // El contextHint no forma parte de la identidad: el QA describe el mismo
    // boton con otras palabras y el selector es la evidencia.
    const other = step(9, 'CLICK', '~Historial', { contextHint: 'boton de historial de pagos' });
    assert.equal(actionIdentity(other, 'android'), actionIdentity(recorded.actions[0], 'android'));
    // Pero el texto verificado si: VERIFICAR_TEXTO "A" y "B" son verificaciones distintas.
    assert.notEqual(
        actionIdentity(step(4, 'VERIFICAR_TEXTO', '~x', { value: 'A' }), 'android'),
        actionIdentity(step(4, 'VERIFICAR_TEXTO', '~x', { value: 'B' }), 'android'),
    );
});

test('recall parte el bloque en tramos memorizados (los mas largos) y tramos nuevos', () => {
    const fragments = [
        { identities: ['a', 'b', 'c'], keyword: 'When', text: 'abc', locatorNames: [], squad: 'payment', platform: 'android', caseId: 'TC-1', fingerprint: 'f', promotedAt: '' },
        { identities: ['a'], keyword: 'When', text: 'a', locatorNames: [], squad: 'payment', platform: 'android', caseId: 'TC-1', fingerprint: 'f', promotedAt: '' },
        { identities: ['d'], keyword: 'And', text: 'd', locatorNames: [], squad: 'payment', platform: 'android', caseId: 'TC-2', fingerprint: 'g', promotedAt: '' },
        { identities: ['z'], keyword: 'When', text: 'otro squad', locatorNames: [], squad: 'core', platform: 'android', caseId: 'TC-3', fingerprint: 'h', promotedAt: '' },
    ];
    const covered = recallInteractions(fragments, 'payment', ['a', 'b', 'c', 'd']);
    assert.deepEqual(covered.map(item => [item.fragment.text, item.from, item.to]), [['abc', 0, 2], ['d', 3, 3]]);
    assert.deepEqual(recallInteractions(fragments, 'payment', ['a']).map(item => item.fragment.text), ['a']);
    // Tramos sin memoria quedan como segmentos propios, contiguos y sin fragmento.
    assert.deepEqual(
        recallInteractions(fragments, 'payment', ['a', 'b', 'x', 'y', 'd']).map(item => [item.fragment?.text, item.from, item.to]),
        [['a', 0, 0], [undefined, 1, 3], ['d', 4, 4]],
    );
    assert.equal(recallInteractions(fragments, 'payment', ['x', 'y']), undefined, 'sin ningun tramo memorizado no hay nada que devolver');
    assert.equal(recallInteractions(fragments, 'payment', ['z']), undefined, 'otro squad no se mezcla');
    assert.equal(recallInteractions(fragments, 'payment', []), undefined);

    // La segunda pulsacion del mismo boton usa el wording que este caso aun
    // no gasto ("vuelve a filtrar"); agotados, se repite.
    const twice = [
        { ...fragments[1], text: 'el usuario filtra' },
        { ...fragments[1], text: 'el usuario vuelve a filtrar', caseId: 'TC-1' },
    ];
    const used = new Set();
    assert.equal(recallInteractions(twice, 'payment', ['a'], used)[0].fragment.text, 'el usuario filtra');
    assert.equal(recallInteractions(twice, 'payment', ['a'], used)[0].fragment.text, 'el usuario vuelve a filtrar');
    assert.equal(recallInteractions(twice, 'payment', ['a'], used)[0].fragment.text, 'el usuario filtra');

    const merged = mergeMemoryFragments(
        { schemaVersion: 1, interactions: [fragments[1], twice[1]], gaps: [{ identity: 'x', type: 'verification-semantics', decision: 'reuse', reason: 'v1', squad: 'payment', caseId: 'TC-1', fingerprint: 'f', promotedAt: '1' }] },
        { schemaVersion: 1, interactions: [{ ...fragments[1], screenMethod: 'corregido' }], gaps: [{ identity: 'x', type: 'verification-semantics', decision: 'create', reason: 'v2', squad: 'payment', caseId: 'TC-9', fingerprint: 'k', promotedAt: '2' }] },
    );
    assert.equal(merged.interactions.length, 2, 'wordings distintos de la misma secuencia conviven');
    assert.equal(merged.interactions.find(item => item.text === 'a').screenMethod, 'corregido', 'el mismo texto se sustituye por la version mas reciente');
    assert.equal(recallGap(merged.gaps, 'payment', 'verification-semantics', 'x').reason, 'v2');
});

const HISTORY = ['CLICK', '~Historial memoria'];
const SEE_ALL = ['CLICK', '~Ver todo memoria'];
const DOWNLOAD = ['CLICK', '~Descargar memoria'];
const TITLE = ['VERIFICAR_TEXTO', 'android=new UiSelector().text("Historial memoria")', { value: 'Historial memoria', locatorType: 'ANDROID', locatorValue: 'new UiSelector().text("Historial memoria")' }];

function recording(recordingId, objective, acceptance, steps, caseId) {
    return scenario(steps.map((item, index) => step(index + 1, ...item)), {
        recordingId, fingerprint: `fp-${recordingId}`, objective, acceptanceCriteria: acceptance,
        request: {
            squad: 'payment', featureScope: '', featureName: 'Flujo mobile', scenarioName: 'Escenario grabado',
            fileName: 'flujo-mobile', locatorModule: 'nueva-pantalla', caseId, pathType: 'Happy Path',
            tag: 'memoria', dataName: '', platform: 'android',
        },
    });
}

function fixedResolutions(packageDirectory) {
    const plan = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'generation-plan.json'), 'utf8'));
    const gaps = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'gaps.json'), 'utf8')).gaps;
    return plan.unresolvedGapIds.map(gapId => {
        if (gapId === 'gap-extend-existing-artifacts') return { gapId, decision: 'extend-existing', reason: 'rutas fijadas' };
        if (gapId === 'gap-english-naming') return { gapId, decision: 'renamed-by-authors', reason: 'sin agente' };
        const gap = gaps.find(candidate => candidate.id === gapId);
        const fixed = plan.resolutions.find(resolution => resolution.sequence === gap?.sequence)?.resolution;
        return { gapId, decision: fixed, reason: `plan: ${fixed}` };
    });
}

test('otro recording hereda wording, metodo y decision de gap de un caso validado en otro recording', t => {
    isolatedFramework(t, 'avr-memory-');
    const memoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'avr-memory-root-'));
    t.after(() => fs.rmSync(memoryRoot, { recursive: true, force: true }));
    const memory = new AutomationMemory(memoryRoot);
    const builder = new AutomationPackageBuilder(undefined, memory);

    // Caso A: se prepara, se materializa y se promociona (score 100) como
    // haria "Aplicar". Simula ademas que el agente redacto el bloque When y su
    // metodo con nombres propios: eso es lo que vale la pena recordar.
    const recordingA = path.join(projectPaths.recordings, 'rec-memory-a');
    fs.mkdirSync(recordingA, { recursive: true });
    const preparedA = builder.prepare(recording('rec-memory-a', 'el usuario consulta el historial memoria', 'se muestra el titulo del historial memoria', [HISTORY, SEE_ALL, TITLE], 'TC-70001'), recordingA);
    const planA = JSON.parse(fs.readFileSync(path.join(preparedA.packageDirectory, 'generation-plan.json'), 'utf8'));
    assert.ok(planA.unresolvedGapIds.includes('gap-verification-3'), 'el titulo fija el texto que valida: gap de verificacion');
    const responseA = new DeterministicGenerator().generate(preparedA.packageDirectory, fixedResolutions(preparedA.packageDirectory));
    const scenarioA = JSON.parse(fs.readFileSync(path.join(preparedA.packageDirectory, 'scenario.json'), 'utf8'));
    const validationA = new AutomationResponseValidator().validate(scenarioA, planA, responseA);
    assert.equal(validationA.valid, true, validationA.errors.map(error => error.message).join(' | '));
    const gapsA = JSON.parse(fs.readFileSync(path.join(preparedA.packageDirectory, 'unresolved-context.json'), 'utf8')).gaps;
    memory.promote(scenarioA, planA, responseA, validationA, gapsA);
    const whenA = responseA.actionTrace.find(trace => trace.sequence === 1);
    const thenA = responseA.actionTrace.find(trace => trace.sequence === 3);
    assert.deepEqual(memory.stats(), { successfulCases: 1, versions: 1, interactions: 2, gapDecisions: 1 });

    // Caso B: otro recording, otro objetivo, un paso mas en medio, y el
    // framework NO tiene aplicado A (el QA no llego a aplicarlo o lo
    // descarto). Lo que se repite son las interacciones: esas vienen de memoria.
    const recordingB = path.join(projectPaths.recordings, 'rec-memory-b');
    fs.mkdirSync(recordingB, { recursive: true });
    const preparedB = builder.prepare(recording('rec-memory-b', 'el usuario descarga el historial memoria', 'se muestra el titulo tras descargar', [HISTORY, SEE_ALL, DOWNLOAD, TITLE], 'TC-70002'), recordingB);
    const scenarioB = JSON.parse(fs.readFileSync(path.join(preparedB.packageDirectory, 'scenario.json'), 'utf8'));
    const rowsB = scenarioB.request.scenarioRows;
    const whenB = rowsB.find(row => row.keyword === 'When');
    assert.equal(whenB.wording, 'memory');
    assert.equal(`${whenB.keyword} ${whenB.text}`, whenA.gherkinStep);
    assert.equal(whenB.methodName, whenA.screenMethod);
    assert.deepEqual(whenB.memory, { caseId: 'TC-70001', screenMethod: whenA.screenMethod });
    assert.deepEqual(whenB.actions.map(item => item.sequence), [1, 2]);
    const downloadB = rowsB.find(row => (row.actions || []).some(item => item.sequence === 3));
    assert.notEqual(downloadB.wording, 'memory', 'la descarga no estaba en memoria: sigue el camino normal');
    const thenB = rowsB.find(row => row.keyword === 'Then');
    assert.equal(thenB.wording, 'memory');
    assert.equal(`Then ${thenB.text}`, thenA.gherkinStep);
    assert.equal(thenB.methodName, thenA.screenMethod);

    // El gap de verificacion sobre el mismo titulo nace resuelto desde memoria:
    // queda trazado para el QA pero no abre el paquete al agente.
    const planB = JSON.parse(fs.readFileSync(path.join(preparedB.packageDirectory, 'generation-plan.json'), 'utf8'));
    const gapsB = JSON.parse(fs.readFileSync(path.join(preparedB.packageDirectory, 'unresolved-context.json'), 'utf8')).gaps;
    const verificationB = gapsB.find(gap => gap.id === 'gap-verification-4');
    assert.ok(verificationB);
    assert.equal(verificationB.status, 'resolved');
    assert.equal(verificationB.resolvedBy, 'memory');
    assert.match(verificationB.reason, /TC-70001/);
    assert.equal(planB.unresolvedGapIds.includes('gap-verification-4'), false);

    // La materializacion determinista honra el metodo memorizado.
    const responseB = new DeterministicGenerator().generate(preparedB.packageDirectory, fixedResolutions(preparedB.packageDirectory));
    const stepsB = responseB.files.find(file => file.layer === 'steps').content;
    assert.match(stepsB, new RegExp(`\\.${whenA.screenMethod}\\(`));
    const validationB = new AutomationResponseValidator().validate(scenarioB, planB, responseB);
    assert.equal(validationB.valid, true, validationB.errors.map(error => error.message).join(' | '));
});
