const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const installer = path.resolve(__dirname, '..', 'install.sh');

function git(cwd, ...args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function createFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-recorder-installer-'));
    const source = path.join(root, 'source');
    const framework = path.join(root, 'fwk-mobile-test');

    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'package.json'), '{"name":"fixture"}\n');
    fs.writeFileSync(path.join(source, 'package-lock.json'), '{"name":"fixture","lockfileVersion":3,"packages":{}}\n');
    fs.writeFileSync(path.join(source, '.gitignore'), '.env\nnode_modules/\n');
    fs.writeFileSync(path.join(source, 'run.sh'), '#!/usr/bin/env bash\n');
    git(source, 'init', '-b', 'visual-recorder');
    git(source, 'config', 'user.email', 'installer@example.test');
    git(source, 'config', 'user.name', 'Installer Test');
    git(source, 'config', 'commit.gpgsign', 'false');
    git(source, 'add', '.');
    git(source, 'commit', '-m', 'fixture');

    fs.mkdirSync(path.join(framework, 'features', 'yape-features'), { recursive: true });
    fs.mkdirSync(path.join(framework, 'screenobjects'), { recursive: true });
    fs.writeFileSync(path.join(framework, 'package.json'), JSON.stringify({
        name: 'fwk-mobile-test',
        scripts: { test: 'framework-test' },
    }) + '\n');
    fs.writeFileSync(
        path.join(framework, 'package-lock.json'),
        '{"name":"fwk-mobile-test","lockfileVersion":3,"packages":{}}\n',
    );
    fs.writeFileSync(path.join(framework, '.gitignore'), 'node_modules/\n');
    git(framework, 'init', '-b', 'main');

    return { root, source, framework };
}

test('instala y actualiza el recorder sin modificar el framework', () => {
    const fixture = createFixture();
    const environment = {
        ...process.env,
        VISUAL_RECORDER_REPOSITORY: fixture.source,
        VISUAL_RECORDER_BRANCH: 'visual-recorder',
        VISUAL_RECORDER_SKIP_NPM_CI: '1',
    };

    const packageBefore = fs.readFileSync(path.join(fixture.framework, 'package.json'), 'utf8');
    const lockBefore = fs.readFileSync(path.join(fixture.framework, 'package-lock.json'), 'utf8');
    const gitignoreBefore = fs.readFileSync(path.join(fixture.framework, '.gitignore'), 'utf8');

    execFileSync('bash', [installer], {
        cwd: fixture.framework,
        env: environment,
        stdio: 'pipe',
    });

    const target = path.join(fixture.framework, 'tools', 'visual-recorder');
    assert.equal(fs.existsSync(path.join(target, '.git')), true);
    assert.equal(fs.existsSync(path.join(target, '.env')), false);
    assert.equal(fs.readFileSync(path.join(fixture.framework, 'package.json'), 'utf8'), packageBefore);
    assert.equal(fs.readFileSync(path.join(fixture.framework, 'package-lock.json'), 'utf8'), lockBefore);
    assert.equal(fs.readFileSync(path.join(fixture.framework, '.gitignore'), 'utf8'), gitignoreBefore);
    assert.match(
        fs.readFileSync(path.join(fixture.framework, '.git', 'info', 'exclude'), 'utf8'),
        /^\/tools\/visual-recorder\/$/m,
    );

    execFileSync('bash', [installer], {
        cwd: fixture.framework,
        env: environment,
        stdio: 'pipe',
    });
    assert.equal(fs.readFileSync(path.join(fixture.framework, 'package.json'), 'utf8'), packageBefore);
    assert.equal(fs.readFileSync(path.join(fixture.framework, 'package-lock.json'), 'utf8'), lockBefore);
    assert.equal(fs.readFileSync(path.join(fixture.framework, '.gitignore'), 'utf8'), gitignoreBefore);
});

test('rechaza una carpeta que no es fwk-mobile-test', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-recorder-invalid-'));
    assert.throws(() => execFileSync('bash', [installer], {
        cwd: empty,
        env: { ...process.env, VISUAL_RECORDER_SKIP_NPM_CI: '1' },
        stdio: 'pipe',
    }));
});
