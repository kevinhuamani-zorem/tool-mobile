'use strict';
const fs = require('node:fs');
const { evaluateBehaviorReuse } = require('../dist/core/automation/domain/reuseEvaluation');
const args = process.argv.slice(2);
function argument(name) { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; }
try {
    const planFile = argument('--plan'), labelsFile = argument('--labels');
    if (!planFile || !labelsFile) throw new Error('Uso: npm run reuse:evaluate -- --plan generation-plan.json --labels expected.json [--response agent-response.json --baseline baseline-files.json] [--output report.json]');
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    if (!plan.behaviorReuse) throw new Error('El plan no contiene evidencia de reutilización por comportamiento.');
    const responseFile = argument('--response'), baselineFile = argument('--baseline');
    if (!!responseFile !== !!baselineFile) throw new Error('La evidencia final requiere --response y --baseline del framework anterior a la generación.');
    const evidence = responseFile ? { response: JSON.parse(fs.readFileSync(responseFile, 'utf8')), baselineFiles: JSON.parse(fs.readFileSync(baselineFile, 'utf8')) } : undefined;
    const result = evaluateBehaviorReuse(plan.behaviorReuse, JSON.parse(fs.readFileSync(labelsFile, 'utf8')), evidence);
    const output = JSON.stringify(result, null, 2) + '\n';
    if (argument('--output')) fs.writeFileSync(argument('--output'), output);
    process.stdout.write(output);
    if (result.status !== 'evaluated' || result.incorrectlyReused || result.missedReuse || result.unlabelledDecisions) process.exitCode = 2;
} catch (error) { console.error(error.message); process.exitCode = 1; }
