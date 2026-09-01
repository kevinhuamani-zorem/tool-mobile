#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { DeterministicGenerator } = require('../dist/core/generation');
const { canonicalResponse } = require('../tests/helpers/phase43Canonical.js');

const FIXTURE_ROOT = path.join(process.cwd(), 'tests/fixtures/phase43');
const CASES = ['rec-7588c175', 'rec-f7c98dff'];

async function copyFixture(srcDir, dstDir) {
    await fs.mkdir(dstDir, { recursive: true });
    await Promise.all(['scenario.json', 'generation-plan.json', 'resolved-context.json', 'query-results.json'].map(async (name) => {
        try {
            await fs.copyFile(path.join(srcDir, name), path.join(dstDir, name));
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }));
}

async function run() {
    for (const folder of CASES) {
        const sourceDir = path.join(FIXTURE_ROOT, folder);
        const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), `phase43-refresh-${folder}-`));
        try {
            await copyFixture(sourceDir, tempBase);
            const gapResolutions = JSON.parse(await fs.readFile(path.join(sourceDir, 'gap-resolutions.json'), 'utf8'));
            const generator = new DeterministicGenerator();
            const response = await generator.generate(tempBase, gapResolutions.resolutions || []);
            const canonical = canonicalResponse(response);
            await fs.writeFile(
                path.join(sourceDir, 'canonical.expected.json'),
                `${JSON.stringify(canonical, null, 2)}\n`,
                'utf8',
            );
        } finally {
            await fs.rm(tempBase, { recursive: true, force: true });
        }
    }
    process.stdout.write('Canonical fixtures refreshed.\n');
}

run().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
