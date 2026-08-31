const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { DeterministicGenerator } = require('../dist/core/deterministicGenerator.js');
const { AutomationResponseValidator } = require('../dist/core/automationResponseValidator.js');
const { canonicalResponse } = require('./helpers/phase43Canonical.js');

const FIXTURE_ROOT = path.join(process.cwd(), 'tests/fixtures/phase43');
const CASES = [
    { id: 'rec-7588c175', folder: 'rec-7588c175' },
    { id: 'rec-f7c98dff', folder: 'rec-f7c98dff' },
];

async function copyFixture(srcDir, dstDir) {
    await fs.mkdir(dstDir, { recursive: true });
    const files = ['scenario.json', 'generation-plan.json', 'resolved-context.json', 'query-results.json'];
    await Promise.all(files.map(async (name) => {
        const src = path.join(srcDir, name);
        const dst = path.join(dstDir, name);
        try {
            await fs.copyFile(src, dst);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }));
}

test('phase43 deterministic fixtures remain stable and valid', async () => {
    const validator = new AutomationResponseValidator();
    for (const fixture of CASES) {
        const sourceDir = path.join(FIXTURE_ROOT, fixture.folder);
        const expectedPath = path.join(sourceDir, 'canonical.expected.json');
        const expectedValidationPath = path.join(sourceDir, 'validation.expected.json');
        const expected = JSON.parse(await fs.readFile(expectedPath, 'utf8'));
        const expectedValidation = JSON.parse(await fs.readFile(expectedValidationPath, 'utf8'));
        const gapResolutions = JSON.parse(await fs.readFile(path.join(sourceDir, 'gap-resolutions.json'), 'utf8'));

        const tempBase = await fs.mkdtemp(path.join(os.tmpdir(), `phase43-${fixture.folder}-`));
        try {
            await copyFixture(sourceDir, tempBase);
            const generator = new DeterministicGenerator();
            const response = await generator.generate(tempBase, gapResolutions.resolutions || []);
            const canonical = canonicalResponse(response);
            assert.deepEqual(canonical, expected, `Canonical mismatch for ${fixture.id}`);

            const scenario = JSON.parse(await fs.readFile(path.join(tempBase, 'scenario.json'), 'utf8'));
            const plan = JSON.parse(await fs.readFile(path.join(tempBase, 'effective-generation-plan.json'), 'utf8'));
            const validation = validator.validate(scenario, plan, response);
            const actualErrorCounts = validation.errors.reduce((acc, error) => {
                acc[error.code] = (acc[error.code] || 0) + 1;
                return acc;
            }, {});
            assert.deepEqual({
                valid: validation.valid,
                errorCounts: actualErrorCounts,
            }, expectedValidation, `Validation profile mismatch for ${fixture.id}`);
        } finally {
            await fs.rm(tempBase, { recursive: true, force: true });
        }
    }
});
