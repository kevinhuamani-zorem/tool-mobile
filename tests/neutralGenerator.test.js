const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { NeutralGenerator } = require('../dist/core/neutralGenerator');
const { projectPaths } = require('../dist/core/projectPaths');

test('la exportación neutral produce Gherkin y JSON dentro de runtime', () => {
    const steps = [{
        action: 'CLICK',
        variableName: 'btnContinuar',
        selector: '~Continuar'
    }];
    const preview = new NeutralGenerator().preview({
        squad: 'default',
        featureName: 'Flujo neutral',
        scenarioName: 'Continuar',
        fileName: 'flujo-neutral',
        locatorModule: 'neutral',
        caseId: 'TC-10239',
        pathType: 'Happy Path',
        tag: 'neutral',
        platform: 'android'
    }, steps);

    assert.equal(preview.files.length, 2);
    assert.equal(preview.files.every(file =>
        file.startsWith(path.join(projectPaths.toolRoot, 'runtime', 'exports'))
    ), true);
    assert.match(preview.featureContent, /Feature: Flujo neutral/);
    assert.match(preview.locatorContent, /"schemaVersion": 1/);
});
