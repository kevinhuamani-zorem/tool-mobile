const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isolatedFramework } = require('./helpers/isolatedFramework');
const { applyAutomationResponse } = require('./helpers/applyAutomationResponse');
const { AutomationPackageBuilder } = require('../dist/core/automation');
const { DeterministicGenerator } = require('../dist/core/generation');
const { projectPaths } = require('../dist/core/workspace');

// Casuistica real de trabajo: el QA encadena casos sin commitear. El recorder
// tiene que generar el caso B reutilizando lo que el caso A dejo en el working
// tree del framework, ampliar esos archivos de forma aditiva y no chocar con
// ellos como si fueran artefactos ajenos.

function request(overrides = {}) {
    return {
        squad: 'payment', featureScope: '', featureName: 'Flujo mobile', scenarioName: 'Escenario grabado',
        fileName: 'flujo-mobile', locatorModule: 'nueva-pantalla', caseId: 'TC-90001',
        pathType: 'Happy Path', tag: 'historialencadenado', dataName: '', platform: 'android',
        ...overrides,
    };
}

function action(sequence, action, selector, locatorType, locatorValue, contextHint) {
    return {
        action, sequence, platform: 'android', variableName: '', contextHint, elementIntent: '',
        selector, value: '', description: '', locatorType, locatorValue, selectorVerified: true,
    };
}

const SHOW_HISTORY = ['CLICK', 'android=new UiSelector().text("Historial encadenado")', 'ANDROID', 'new UiSelector().text("Historial encadenado")', 'boton de historial encadenado'];
const OPEN_DETAIL = ['CLICK', '~Ver detalle encadenado', 'ID', 'Ver detalle encadenado', 'boton de ver detalle encadenado'];
const DOWNLOAD = ['CLICK', '~Descargar historial encadenado', 'ID', 'Descargar historial encadenado', 'boton de descargar historial encadenado'];
const TITLE = ['VERIFICAR_EXISTE', '~Titulo historial encadenado', 'ID', 'Titulo historial encadenado', 'titulo del historial encadenado'];

function scenario(recordingId, objective, acceptanceCriteria, steps, caseId) {
    return {
        schemaVersion: 1, pipelineVersion: '1.0.0', recordingId, revision: 1,
        fingerprint: `fingerprint-${recordingId}`, createdAt: new Date(0).toISOString(),
        squad: 'payment', platform: 'android', environment: 'qa', objective, acceptanceCriteria,
        request: request({ caseId }),
        actions: steps.map((step, index) => action(index + 1, ...step)),
    };
}

function prepareAndApply(builder, recordingId, objective, acceptance, steps, caseId) {
    const recordingDirectory = path.join(projectPaths.recordings, recordingId);
    fs.mkdirSync(recordingDirectory, { recursive: true });
    const prepared = builder.prepare(scenario(recordingId, objective, acceptance, steps, caseId), recordingDirectory);
    // Todo esta verificado: ningun gap abierto puede requerir juicio del
    // agente. Un gap cuya decision ya fija el plan (create/reuse por secuencia,
    // o extender los artefactos existentes) se resuelve como lo hace Derek en
    // su camino determinista; cualquier otro gap es un defecto del resolver.
    assert.equal(prepared.deterministicCoverage, 1);
    const plan = JSON.parse(fs.readFileSync(path.join(prepared.packageDirectory, 'generation-plan.json'), 'utf8'));
    const gaps = JSON.parse(fs.readFileSync(path.join(prepared.packageDirectory, 'gaps.json'), 'utf8')).gaps;
    const resolutions = plan.unresolvedGapIds.map(gapId => {
        if (gapId === 'gap-extend-existing-artifacts') {
            return { gapId, decision: 'extend-existing', reason: 'El plan ya fijo las rutas update.' };
        }
        if (gapId === 'gap-english-naming') {
            // "encadenado" es español sin traducción: el gap es informativo para
            // los autores, no una decisión. Aquí no hay autores; se conserva.
            return { gapId, decision: 'renamed-by-authors', reason: 'Sin agente: se conserva el nombre propuesto.' };
        }
        const gap = gaps.find(candidate => candidate.id === gapId);
        const fixed = plan.resolutions.find(resolution => resolution.sequence === gap?.sequence)?.resolution;
        assert.ok(fixed === 'create' || fixed === 'reuse',
            `${recordingId}: el gap ${gapId} exige juicio del agente aunque todo esta verificado: ${gap?.description}`);
        return { gapId, decision: fixed, reason: `El plan ya fijo ${fixed} para la secuencia ${gap.sequence}.` };
    });
    if (!prepared.responseAvailable) {
        const response = new DeterministicGenerator().generate(prepared.packageDirectory, resolutions);
        fs.writeFileSync(path.join(prepared.packageDirectory, 'agent-response.json'), JSON.stringify(response, null, 2));
    }
    const applied = applyAutomationResponse(prepared.packageDirectory);
    return { prepared, ...applied };
}

test('el caso B reutiliza y amplia los artefactos que el caso A dejo sin commitear', t => {
    const { frameworkRoot } = isolatedFramework(t, 'avr-chained-');
    const builder = new AutomationPackageBuilder();

    const caseA = prepareAndApply(
        builder, 'rec-chained-a',
        'el usuario consulta el historial encadenado',
        'se muestra el titulo del historial encadenado',
        [SHOW_HISTORY, OPEN_DETAIL, TITLE], 'TC-90001',
    );
    const filesA = new Map(caseA.plan.files.map(file => [file.layer, file.path]));
    assert.deepEqual(caseA.plan.files.map(file => file.operation), ['create', 'create', 'create', 'create']);
    for (const relative of filesA.values()) {
        assert.ok(fs.existsSync(path.join(frameworkRoot, relative)), `A debe escribir ${relative}`);
    }
    const screenAfterA = fs.readFileSync(path.join(frameworkRoot, filesA.get('screen')), 'utf8');
    const locatorsAfterA = fs.readFileSync(path.join(frameworkRoot, filesA.get('locators')), 'utf8');
    const featureAfterA = fs.readFileSync(path.join(frameworkRoot, filesA.get('feature')), 'utf8');
    const stepsAfterA = fs.readFileSync(path.join(frameworkRoot, filesA.get('steps')), 'utf8');

    // Sin commit de por medio: el framework queda exactamente como lo dejo A.
    const caseB = prepareAndApply(
        builder, 'rec-chained-b',
        'el usuario descarga el historial encadenado',
        'se muestra el titulo del historial encadenado tras descargar',
        [SHOW_HISTORY, OPEN_DETAIL, DOWNLOAD, TITLE], 'TC-90002',
    );
    const filesB = new Map(caseB.plan.files.map(file => [file.layer, file.path]));
    const operationsB = Object.fromEntries(caseB.plan.files.map(file => [file.layer, file.operation]));

    // 1. Reutilizacion: Screen y Locators de A se amplian, no se duplican.
    assert.equal(filesB.get('screen'), filesA.get('screen'), 'B debe apuntar al Screen Object de A');
    assert.equal(filesB.get('locators'), filesA.get('locators'), 'B debe apuntar al modulo de locators de A');
    assert.equal(operationsB.screen, 'update');
    assert.equal(operationsB.locators, 'update');
    assert.notEqual(filesB.get('feature'), filesA.get('feature'), 'B es otro caso: Feature propio');

    const decisions = caseB.plan.resolutions
        .filter(resolution => resolution.locatorName)
        .map(resolution => [resolution.sequence, resolution.resolution]);
    assert.deepEqual(decisions, [[1, 'reuse'], [2, 'reuse'], [3, 'create'], [4, 'reuse']],
        `B debe reutilizar los tres elementos de A y crear solo el nuevo: ${JSON.stringify(decisions)}`);

    // 2. Aditivo: lo de A sigue byte a byte y B solo agrega sus simbolos.
    const screenAfterB = fs.readFileSync(path.join(frameworkRoot, filesA.get('screen')), 'utf8');
    const locatorsAfterB = fs.readFileSync(path.join(frameworkRoot, filesA.get('locators')), 'utf8');
    assert.ok(screenAfterB.length > screenAfterA.length, 'B debe ampliar el Screen Object de A');
    for (const line of screenAfterA.split('\n').filter(candidate => candidate.trim())) {
        assert.ok(screenAfterB.includes(line), `B elimino una linea de A: ${line}`);
    }
    const parsedA = JSON.parse(locatorsAfterA);
    const parsedB = JSON.parse(locatorsAfterB);
    for (const [block, entries] of Object.entries(parsedA)) {
        for (const [name, value] of Object.entries(entries)) {
            assert.equal(parsedB[block]?.[name], value, `B alteró el locator ${block}.${name} de A`);
        }
    }
    const newLocatorNames = Object.keys(parsedB[Object.keys(parsedB).find(block => /android$/i.test(block))])
        .filter(name => !parsedA[Object.keys(parsedA).find(block => /android$/i.test(block))][name]);
    assert.equal(newLocatorNames.length, 1, `B debe agregar exactamente un locator: ${newLocatorNames}`);
    assert.equal(fs.readFileSync(path.join(frameworkRoot, filesA.get('feature')), 'utf8'), featureAfterA,
        'el Feature de A es de A: B no lo toca');
    // El Steps se comparte por relacion (importa el mismo Screen Object): B lo
    // amplia con sus definiciones y conserva las de A.
    assert.equal(filesB.get('steps'), filesA.get('steps'));
    assert.equal(operationsB.steps, 'update');
    const stepsAfterB = fs.readFileSync(path.join(frameworkRoot, filesA.get('steps')), 'utf8');
    for (const line of stepsAfterA.split('\n').filter(candidate => candidate.trim())) {
        assert.ok(stepsAfterB.includes(line), `B elimino una linea del Steps de A: ${line}`);
    }
    assert.match(stepsAfterB, /el usuario descarga el historial encadenado/);
    assert.equal(
        [...stepsAfterB.matchAll(/^import .+screen\.ts';$/gm)].length, 1,
        'el import del Screen Object no se duplica al ampliar Steps',
    );

    // 3. Registro: A sigue administrado con su hash y B queda en el ledger de patches.
    const registry = JSON.parse(fs.readFileSync(path.join(projectPaths.toolConfig, 'generated-files.json'), 'utf8'));
    for (const relative of filesA.values()) {
        assert.ok(registry.files[relative], `${relative} debe seguir administrado por el recorder`);
    }
    for (const layer of ['feature', 'steps']) {
        assert.ok(registry.files[filesB.get(layer)], `${filesB.get(layer)} debe registrarse como creado por B`);
    }
    const ledger = registry.patches?.[filesA.get('screen')] || [];
    assert.ok(ledger.some(entry => entry.recordingId === 'rec-chained-b'),
        'el ledger debe registrar que B amplio el Screen Object de A');

    // 4. Sin colisiones: los artefactos de A son reutilizacion legitima, no ajenos.
    assert.deepEqual(caseB.validation.errors, []);
    assert.equal(caseB.validation.qualityScore, 100);
});

test('el caso B amplia el Screen Object de A aunque A lo haya modificado despues de generarlo', t => {
    // Un QA corrige a mano un archivo que el recorder genero (por ejemplo,
    // renombra un metodo). El recorder no puede sobrescribirlo en silencio,
    // pero si debe seguir ampliandolo de forma aditiva.
    const { frameworkRoot } = isolatedFramework(t, 'avr-chained-edit-');
    const builder = new AutomationPackageBuilder();
    const caseA = prepareAndApply(
        builder, 'rec-chained-edit-a',
        'el usuario consulta el historial encadenado',
        'se muestra el titulo del historial encadenado',
        [SHOW_HISTORY, OPEN_DETAIL, TITLE], 'TC-90003',
    );
    const screenPath = path.join(frameworkRoot, caseA.plan.files.find(file => file.layer === 'screen').path);
    const edited = `${fs.readFileSync(screenPath, 'utf8')}\n// Ajuste manual del QA despues de generar A\n`;
    fs.writeFileSync(screenPath, edited, 'utf8');

    const caseB = prepareAndApply(
        builder, 'rec-chained-edit-b',
        'el usuario descarga el historial encadenado',
        'se muestra el titulo del historial encadenado tras descargar',
        [SHOW_HISTORY, OPEN_DETAIL, DOWNLOAD, TITLE], 'TC-90004',
    );
    assert.equal(caseB.plan.files.find(file => file.layer === 'screen').operation, 'update');
    const screenAfterB = fs.readFileSync(screenPath, 'utf8');
    assert.ok(screenAfterB.includes('// Ajuste manual del QA despues de generar A'),
        'la edicion manual del QA debe sobrevivir a la ampliacion de B');
    assert.ok(screenAfterB.length > edited.length, 'B debe seguir agregando su metodo nuevo');
});

// Un step existente se reutiliza, no se sufija, cuando hay evidencia: el
// caso C valida exactamente el mismo elemento que A con el mismo texto, y el
// step definition de A ya invoca el metodo que llega a ese locator.
test('el caso C reutiliza el step de A cuando cubre exactamente los mismos elementos', t => {
    const { frameworkRoot } = isolatedFramework(t, 'avr-chained-step-');
    const builder = new AutomationPackageBuilder();
    const caseA = prepareAndApply(
        builder, 'rec-chained-step-a',
        'el usuario consulta el historial encadenado',
        'se muestra el titulo del historial encadenado',
        [SHOW_HISTORY, OPEN_DETAIL, TITLE], 'TC-90005',
    );
    const thenA = caseA.scenario.request.scenarioRows.find(row => /^Then$/.test(row.keyword));
    assert.equal(thenA.status, 'missing', 'en A la asercion todavia no existe: se crea');
    const stepsPathA = caseA.plan.files.find(file => file.layer === 'steps').path;
    const stepsAfterA = fs.readFileSync(path.join(frameworkRoot, stepsPathA), 'utf8');
    const definitionsAfterA = [...stepsAfterA.matchAll(/(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g)].map(match => match[1]);
    assert.ok(definitionsAfterA.includes(thenA.text));

    const caseC = prepareAndApply(
        builder, 'rec-chained-step-c',
        'el usuario descarga el historial encadenado',
        'se muestra el titulo del historial encadenado',
        [SHOW_HISTORY, OPEN_DETAIL, DOWNLOAD, TITLE], 'TC-90006',
    );
    const rows = caseC.scenario.request.scenarioRows;
    const thenC = rows.find(row => row.status === 'reused' && (row.actions || []).length);
    assert.ok(thenC, `C deberia reutilizar la asercion de A: ${JSON.stringify(rows.map(row => [row.keyword, row.text, row.status]))}`);
    assert.equal(thenC.text, thenA.text, 'el texto es el literal del step existente, sin sufijo');
    assert.ok(thenC.methodName, 'la fila reutilizada conoce el metodo que ya invoca el step existente');
    // Trazabilidad completa: la accion de la asercion apunta a ese metodo.
    const trace = caseC.response.actionTrace.find(item => item.sequence === 4);
    assert.equal(trace.screenMethod, thenC.methodName);
    assert.equal(caseC.validation.qualityScore, 100);
    // El Feature usa el step literal y el Steps compartido no gana una definicion duplicada.
    const featureC = fs.readFileSync(path.join(frameworkRoot, caseC.plan.files.find(file => file.layer === 'feature').path), 'utf8');
    assert.match(featureC, new RegExp(`^\\s*Then ${thenA.text}$`, 'm'));
    const stepsAfterC = fs.readFileSync(path.join(frameworkRoot, stepsPathA), 'utf8');
    const definitionsAfterC = [...stepsAfterC.matchAll(/(?:Given|When|Then)\(\/\^([^\n]+?)\$\//g)].map(match => match[1]);
    assert.equal(definitionsAfterC.filter(definition => definition === thenA.text).length, 1);
    assert.equal(definitionsAfterC.some(definition => definition.startsWith(`${thenA.text} en `)), false, 'no hay variante sufijada');
});

// Dos grabaciones con el mismo objetivo caen en la misma ruta de Feature. La
// segunda añade su Scenario; antes lo creaba encima y el caso anterior
// desaparecía del framework sin aviso.
test('un segundo caso con el mismo objetivo amplía el Feature de A en vez de pisarlo', t => {
    const { frameworkRoot } = isolatedFramework(t, 'avr-chained-feature-');
    const builder = new AutomationPackageBuilder();
    const caseA = prepareAndApply(
        builder, 'rec-chained-feature-a',
        'el usuario consulta el historial encadenado',
        'se muestra el titulo del historial encadenado',
        [SHOW_HISTORY, OPEN_DETAIL, TITLE], 'TC-90007',
    );
    const featurePath = caseA.plan.files.find(file => file.layer === 'feature').path;
    const featureAfterA = fs.readFileSync(path.join(frameworkRoot, featurePath), 'utf8');

    const caseA2 = prepareAndApply(
        builder, 'rec-chained-feature-a2',
        'el usuario consulta el historial encadenado',
        'se muestra el titulo del historial encadenado',
        [SHOW_HISTORY, OPEN_DETAIL, DOWNLOAD, TITLE], 'TC-90008',
    );
    const featureFile = caseA2.plan.files.find(file => file.layer === 'feature');
    assert.equal(featureFile.path, featurePath, 'mismo objetivo, misma ruta de Feature');
    assert.equal(featureFile.operation, 'update');
    const featureAfterA2 = fs.readFileSync(path.join(frameworkRoot, featurePath), 'utf8');
    assert.ok(featureAfterA2.startsWith(featureAfterA.trimEnd()), 'el Feature de A se conserva byte a byte al inicio');
    const scenarios = [...featureAfterA2.matchAll(/^\s*Scenario(?: Outline)?:\s*(.+?)\s*$/gm)].map(match => match[1]);
    assert.equal(scenarios.length, 2, featureAfterA2);
    assert.ok(scenarios[0].includes('TC-90007'));
    assert.ok(scenarios[1].includes('TC-90008'));
    assert.equal([...featureAfterA2.matchAll(/^Feature:/gm)].length, 1, 'un solo encabezado Feature');
    assert.equal(caseA2.validation.qualityScore, 100);
});
