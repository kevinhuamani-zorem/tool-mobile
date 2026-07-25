// Script: validate-squad-sync.js
// Validates that the squad_name dropdown in workflow-dispatch-e2e.yml
// and the keys in config/bs-test-management/bs-folder-map.json are in sync.
//
// Usage:
//   node scripts/validate-squad-sync.js
//
// Exits with code 1 if a mismatch is found, so CI will fail.

import fs from 'node:fs';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';

const ROOT = path.resolve(process.cwd());
const WORKFLOW_PATH = path.join(ROOT, '.github/workflows/workflow-dispatch-e2e.yml');
const JSON_MAP_PATH = path.join(ROOT, 'config/bs-test-management/bs-folder-map.json');

// ─── Load sources ─────────────────────────────────────────────────────────────

const workflow = parseYaml(fs.readFileSync(WORKFLOW_PATH, 'utf8'));
const workflowSquads = workflow?.on?.workflow_dispatch?.inputs?.squad_name?.options ?? [];

const squadFolderMap = JSON.parse(fs.readFileSync(JSON_MAP_PATH, 'utf8'));
const jsonSquads = Object.keys(squadFolderMap);

// ─── Compare ──────────────────────────────────────────────────────────────────

const inWorkflowNotJson = workflowSquads.filter(s => !jsonSquads.includes(s));
const inJsonNotWorkflow = jsonSquads.filter(s => !workflowSquads.includes(s));

let hasErrors = false;

if (inWorkflowNotJson.length > 0) {
    hasErrors = true;
    console.error('❌ Squads present in workflow dropdown but MISSING from bs-folder-map.json:');
    inWorkflowNotJson.forEach(s => console.error(`   - "${s}"`));
}

if (inJsonNotWorkflow.length > 0) {
    hasErrors = true;
    console.error('❌ Squads present in bs-folder-map.json but MISSING from workflow dropdown:');
    inJsonNotWorkflow.forEach(s => console.error(`   - "${s}"`));
}

if (hasErrors) {
    console.error('\nFix: keep both files in sync — add/remove entries from both simultaneously.');
    process.exit(1);
}

console.log(`✅ Squad sync OK — ${workflowSquads.length} squads match between workflow and bs-folder-map.json`);
