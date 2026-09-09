'use strict';
const fs = require('node:fs');
const { evaluateBehaviorReuse } = require('../dist/core/automation/domain/reuseEvaluation');
const args = process.argv.slice(2);
function argument(name) { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; }
try {
    const planFile = argument('--plan'), labelsFile = argument('--labels');
    if (!planFile || !labelsFile) throw new Error('Uso: npm run reuse:evaluate -- --plan generation-plan.json --labels expected.json [--output report.json]');
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    if (!plan.behaviorReuse) throw new Error('El plan no contiene evidencia de reutilización por comportamiento.');
    const result = evaluateBehaviorReuse(plan.behaviorReuse, JSON.parse(fs.readFileSync(labelsFile, 'utf8')));
    const output = JSON.stringify(result, null, 2) + '\n';
    if (argument('--output')) fs.writeFileSync(argument('--output'), output);
    process.stdout.write(output);
    if (result.incorrectlyReused || result.missedReuse || result.unlabelledDecisions) process.exitCode = 2;
} catch (error) { console.error(error.message); process.exitCode = 1; }
