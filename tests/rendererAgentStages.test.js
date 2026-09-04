// [visual-recorder] El progreso del pipeline por capas se pinta por agente:
// Lorem y Zorem pueden estar en curso a la vez, cada etapa muestra su
// evidencia y sus avisos de presupuesto, y las observaciones para el QA
// distinguen erratas de la app de verificaciones con XPath generico.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { installFakeBrowserGlobals } = require('./helpers/fakeDom');

const controllerUrl = path.join(__dirname, '../recorder/renderer/src/controller/recorderController.js');

async function mountWithProgress() {
    let emitProgress;
    const fakeBrowser = installFakeBrowserGlobals({
        api: {
            onAutomationProgress: listener => {
                emitProgress = listener;
                return () => {};
            },
        },
    });
    const { initializeRecorder, disposeRecorder } = await import(`${controllerUrl}?case=agent-stages-${Date.now()}`);
    await initializeRecorder();
    assert.equal(typeof emitProgress, 'function', 'la review se suscribe al progreso');
    return { fakeBrowser, emitProgress, disposeRecorder };
}

test('muestra Lorem y Zorem en curso a la vez con evidencia y avisos de presupuesto', async () => {
    const { fakeBrowser, emitProgress, disposeRecorder } = await mountWithProgress();
    try {
        const stages = fakeBrowser.document.getElementById('automationAgentStages');
        const status = fakeBrowser.document.getElementById('automationPipelineStatus');
        emitProgress({
            stage: 'RESOLVING_DECISIONS', message: 'Lorem redacta Feature y Steps', completed: 2, total: 6,
            agentName: 'Lorem', roleState: 'running', execution: 'agent', evidenceBytes: 40_000, contextBytes: 50_000,
            budgetWarnings: ['Lorem recibió 50000 bytes de contexto; el objetivo es 20000. No se recortó evidencia: costará más tokens.'],
        });
        emitProgress({
            stage: 'GENERATING', message: 'Zorem construye Screen Object y Locators', completed: 3, total: 6,
            agentName: 'Zorem', roleState: 'running', execution: 'agent', evidenceBytes: 110_000, budgetWarnings: [],
        });
        assert.equal(stages.style.display, '');
        assert.match(stages.innerHTML, /data-agent="Lorem" class="is-running"/);
        assert.match(stages.innerHTML, /data-agent="Zorem" class="is-running"/);
        assert.match(stages.innerHTML, /en curso, en paralelo/);
        assert.match(stages.innerHTML, /39,1 KB de evidencia/);
        assert.match(stages.innerHTML, /agent-budget-warning">⚠ Lorem recibió 50000 bytes/);
        assert.equal(status.textContent, 'Lorem y Zorem trabajan en paralelo');

        emitProgress({
            stage: 'RESOLVING_DECISIONS', message: 'Lorem redacta Feature y Steps', completed: 3, total: 6,
            agentName: 'Lorem', roleState: 'completed', execution: 'agent', evidenceBytes: 40_000, budgetWarnings: [],
        });
        emitProgress({
            stage: 'VALIDATING', message: 'Sumrak integra y revisa la automatización', completed: 5, total: 6,
            agentName: 'Sumrak', roleState: 'completed', execution: 'deterministic', evidenceBytes: 56_000,
        });
        assert.match(stages.innerHTML, /data-agent="Lorem" class="is-completed"/);
        assert.match(stages.innerHTML, /data-agent="Zorem" class="is-running"/);
        assert.match(stages.innerHTML, /Sumrak<\/strong> · Integración<small>Derek lo resolvió sin Copilot/);
        assert.equal(status.textContent, 'Sumrak integra y revisa la automatización');
    } finally {
        disposeRecorder();
        fakeBrowser.restore();
    }
});

test('una etapa que falla o se corta por el hang stop se ve en su fila', async () => {
    const { fakeBrowser, emitProgress, disposeRecorder } = await mountWithProgress();
    try {
        const stages = fakeBrowser.document.getElementById('automationAgentStages');
        emitProgress({
            stage: 'FAILED', message: 'Falló Zorem', completed: 3, total: 6,
            agentName: 'Zorem', roleState: 'failed', execution: 'agent', timedOut: true,
            error: 'Tiempo de espera agotado (3600000 ms).',
        });
        assert.match(stages.innerHTML, /data-agent="Zorem" class="is-failed"/);
        assert.match(stages.innerHTML, /se cortó por el hang stop/);
        assert.match(stages.innerHTML, /Tiempo de espera agotado/);
    } finally {
        disposeRecorder();
        fakeBrowser.restore();
    }
});

test('las observaciones para QA distinguen erratas de verificaciones con XPath genérico', () => {
    const review = require('node:fs').readFileSync(
        path.join(__dirname, '../recorder/renderer/src/features/review/reviewFeature.js'), 'utf8',
    );
    assert.match(review, /observation\.type === 'weak-assertion'/);
    assert.match(review, /Verificación con XPath genérico/);
    assert.match(review, /El selector se conserva tal cual/);
    assert.match(review, /Título: Verificación con selector genérico/);
    assert.match(review, /trackAgentStage\(progress\)/);
    const modal = require('node:fs').readFileSync(
        path.join(__dirname, '../recorder/renderer/src/components/ScenarioBuilderModal.tsx'), 'utf8',
    );
    assert.match(modal, /id="automationAgentStages"/);
});
