const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const recorderRoot = path.resolve(__dirname, '..');
const frameworkRoot = path.resolve(recorderRoot, '..', '..');

function inspectWorkspace(extraEnvironment = {}) {
    const script = [
        `const {getWorkspaceAdapter}=require('./dist/core/workspace');`,
        `const a=getWorkspaceAdapter(); a.initialize();`,
        `process.stdout.write(JSON.stringify(a.describe()));`
    ].join('');
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd: recorderRoot,
        env: { ...process.env, ...extraEnvironment },
        encoding: 'utf-8'
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

test('resuelve exclusivamente el fwk-mobile padre e ignora configuración heredada', () => {
    const info = inspectWorkspace({
        RECORDER_MODE: 'standalone',
        TARGET_PROJECT: path.join(recorderRoot, 'runtime', 'legacy-target'),
        AUTOMATION_AGENT: 'claude'
    });
    assert.equal(info.mode, 'fwk-mobile');
    assert.equal(info.integrated, true);
    assert.equal(info.output, 'fwk-mobile');
    assert.equal(info.root, frameworkRoot);
});
