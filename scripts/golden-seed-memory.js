#!/usr/bin/env node
// Compatibility alias: rebuild the approved projection; legacy memory stays disabled.
const { ApprovedGoldenStore, GoldenRetrievalIndex, goldenDatasetRoot } = require('../dist/core/automation');
try {
    const store = new ApprovedGoldenStore(goldenDatasetRoot());
    const index = store.rebuildIndex();
    const retrieval = new GoldenRetrievalIndex(store.root).refresh(true);
    console.log(JSON.stringify({ ...store.stats(), retrieval: retrieval.metrics, issues: [...index.issues, ...retrieval.index.issues] }, null, 2));
    if (index.issues.length || retrieval.index.issues.length) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
