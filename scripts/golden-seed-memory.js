#!/usr/bin/env node
// Compatibility alias: rebuild the approved projection; legacy memory stays disabled.
const { ApprovedGoldenStore, goldenDatasetRoot } = require('../dist/core/automation');
try {
    const store = new ApprovedGoldenStore(goldenDatasetRoot());
    const index = store.rebuildIndex();
    console.log(JSON.stringify({ ...store.stats(), issues: index.issues }, null, 2));
    if (index.issues.length) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
