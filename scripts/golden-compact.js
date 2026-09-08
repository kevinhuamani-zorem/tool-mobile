#!/usr/bin/env node
const { ApprovedGoldenStore, goldenDatasetRoot } = require('../dist/core/automation');
try {
    const position = process.argv.indexOf('--root');
    const root = position >= 0 ? process.argv[position + 1] : goldenDatasetRoot();
    if (!root) throw new Error('Indica el directorio del dataset después de --root.');
    const store = new ApprovedGoldenStore(root);
    console.log(JSON.stringify({ root, compacted: store.compact(), index: store.rebuildIndex() }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
