'use strict';
// Small, pinned static framework for acceptance checks. No git/network/live HEAD.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configureWorkspacePaths, projectPaths, workspaceConfiguration } = require('../../dist/core/workspace');

function acceptanceFramework(t) {
    const original = { targetProject: projectPaths.frameworkRoot, runtimeRoot: projectPaths.runtimeRoot, source: workspaceConfiguration.source };
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-contract-'));
    const frameworkRoot = path.join(root, 'framework');
    fs.cpSync(path.join(__dirname, '..', 'fixtures', 'acceptance-framework'), frameworkRoot, { recursive: true });
    for (const directory of ['features/yape-features', 'features/yape-steps-definitions', 'resources/locators', 'screenobjects', 'support']) {
        fs.mkdirSync(path.join(frameworkRoot, directory), { recursive: true });
    }
    const runtimeRoot = path.join(root, 'recorder');
    configureWorkspacePaths({ targetProject: frameworkRoot, runtimeRoot, source: 'selected' });
    t.after(() => {
        configureWorkspacePaths(original);
        fs.rmSync(root, { recursive: true, force: true });
    });
    return { frameworkRoot, runtimeRoot };
}
module.exports = { acceptanceFramework };
