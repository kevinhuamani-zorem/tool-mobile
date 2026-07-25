// Script: browserstack-tm-reporter.js
// Reports Cucumber JSON test results to BrowserStack Test Management API v2.
//
// Required env vars:
//   BROWSERSTACK_USER_NAME      - BrowserStack username
//   BROWSERSTACK_ACCESS_KEY     - BrowserStack access key
//   BROWSERSTACK_TM_PROJECT_ID  - Project identifier (e.g. PR-5)
//
// Optional env vars:
//   EXISTING_RUN_ID   - If set (e.g. TR-55), skips test run creation and uploads
//                       results directly into that existing run.
//   NODE_ENV          - Environment label shown in run name (default: "qa")
//   GITHUB_WORKFLOW   - Workflow name shown in run name
//   GITHUB_REPOSITORY - Repo name shown in run description
//   GITHUB_REF_NAME   - Branch name shown in run description
//   GITHUB_SHA        - Commit SHA shown in run description
//
// Usage:
//   node scripts/browserstack-tm-reporter.js
//
// The script reads all *.json files under reports/cucumber-json/,
// maps scenarios tagged with @TC-<id> to BrowserStack test runs,
// and uploads the results via the Test Management API.

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

// ─── Configuration ───────────────────────────────────────────────────────────

const BS_API_BASE = 'test-management.browserstack.com';
const CUCUMBER_REPORTS_DIR = path.resolve(process.cwd(), 'reports/cucumber-json');
const TC_TAG_REGEX = /^@(TC-\d+)$/i;

const username = process.env.BROWSERSTACK_USER_NAME;
const accessKey = process.env.BROWSERSTACK_ACCESS_KEY;
const projectId = process.env.BROWSERSTACK_TM_PROJECT_ID;
const existingRunId = process.env.EXISTING_RUN_ID || null;
const nodeEnv = (process.env.NODE_ENV || 'qa').toUpperCase();
const githubWorkflow = process.env.GITHUB_WORKFLOW || 'Local Run';
const githubRepo = process.env.GITHUB_REPOSITORY || 'local';
const githubBranch = process.env.GITHUB_REF_NAME || 'local';
const githubSha = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.substring(0, 7) : 'N/A';

// ─── Validation ──────────────────────────────────────────────────────────────

const missingVars = ['BROWSERSTACK_USER_NAME', 'BROWSERSTACK_ACCESS_KEY', 'BROWSERSTACK_TM_PROJECT_ID']
  .filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.error(`[BrowserStack TM] Missing required env vars: ${missingVars.join(', ')}`);
  console.error('[BrowserStack TM] Set them in your shell or in a .env.browserstack file.');
  process.exit(1);
}

// ─── HTTP Helper ─────────────────────────────────────────────────────────────

function apiRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${username}:${accessKey}`).toString('base64');
    const options = {
      hostname: BS_API_BASE,
      path: urlPath,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ─── Get All Projects with Pagination ────────────────────────────────────────

async function getAllProjects() {
  let allProjects = [];
  const seenIds = new Set();
  let page = 1;
  const perPage = 30;
  const maxPages = 5; // Limit to prevent rate limiting (53 projects = 2 pages)
  
  console.log(`[BrowserStack TM] Fetching all projects with pagination...`);
  
  while (page <= maxPages) {
    const res = await apiRequest('GET', `/api/v2/projects?p=${page}&per_page=${perPage}`);
    if (res.status !== 200) {
      console.error(`[BrowserStack TM] Failed to fetch projects page ${page} (HTTP ${res.status})`);
      break;
    }
    
    const projects = res.body.projects || [];
    const info = res.body.info || {};
    
    if (projects.length === 0) {
      console.log(`[BrowserStack TM] Page ${page} returned 0 projects. Done.`);
      break;
    }
    
    // Add only new unique projects
    let newCount = 0;
    for (const project of projects) {
      if (!seenIds.has(project.identifier)) {
        seenIds.add(project.identifier);
        allProjects.push(project);
        newCount++;
      }
    }
    
    console.log(`[BrowserStack TM] Page ${page}: ${newCount} new projects (total: ${allProjects.length})`);
    
    // Stop if no new projects found (all duplicates)
    if (newCount === 0) {
      console.log(`[BrowserStack TM] No new projects on page ${page}. Pagination complete.`);
      break;
    }
    
    // Check API metadata for next page
    if (info.next === null || info.next === undefined) {
      console.log(`[BrowserStack TM] API indicates no more pages. Pagination complete.`);
      break;
    }
    
    // Use API's next page number, but validate it's incrementing
    if (info.next <= page) {
      console.log(`[BrowserStack TM] API next page (${info.next}) <= current (${page}). Stopping to prevent loop.`);
      break;
    }
    
    page = info.next;
  }
  
  // Warn if pagination limit was reached
  if (page > maxPages) {
    console.warn(`[BrowserStack TM] ⚠️ Se alcanzó el límite de paginación (${maxPages} páginas). Algunos proyectos pueden no estar incluidos.`);
  }
  
  console.log(`[BrowserStack TM] Pagination complete. Total projects: ${allProjects.length}`);
  return allProjects;
}

// ─── Get All Test Cases with Pagination ──────────────────────────────────────

async function getAllTestCases(projectId) {
  let allTestCases = [];
  const seenTCIds = new Set();
  let page = 1;
  const perPage = 30;
  const maxPages = 34; // Safety limit (1000 TCs = ~34 pages max)
  
  console.log(`[BrowserStack TM] Fetching test cases for project ${projectId} with pagination...`);
  
  while (page <= maxPages) {
    const res = await apiRequest('GET', `/api/v2/projects/${projectId}/test-cases?p=${page}&per_page=${perPage}`);
    if (res.status !== 200) {
      console.warn(`[BrowserStack TM] Could not fetch test cases page ${page} (HTTP ${res.status})`);
      break;
    }
    
    const testCases = res.body.test_cases || [];
    const info = res.body.info || {};
    
    console.log(`[BrowserStack TM] TC Page ${page}: fetched ${testCases.length} TCs, info.next=${info.next}`);
    
    if (testCases.length === 0) {
      console.log(`[BrowserStack TM] No test cases on page ${page}. Done.`);
      break;
    }
    
    // Add only new unique test cases (avoid duplicates)
    let newCount = 0;
    for (const tc of testCases) {
      if (!seenTCIds.has(tc.identifier)) {
        seenTCIds.add(tc.identifier);
        allTestCases.push(tc);
        newCount++;
      }
    }
    
    console.log(`[BrowserStack TM] TC Page ${page}: ${newCount} new test cases (total: ${allTestCases.length})`);
    
    // Stop if no new test cases found (all duplicates)
    if (newCount === 0) {
      console.log(`[BrowserStack TM] No new test cases on page ${page}. Pagination complete.`);
      break;
    }
    
    // Use API metadata to check if there's a next page
    if (info.next === null || info.next === undefined) {
      console.log(`[BrowserStack TM] No more test case pages. Done.`);
      break;
    }
    
    page = info.next;
  }
  
  // Warn if pagination limit was reached
  if (page > maxPages) {
    console.warn(`[BrowserStack TM] ⚠️ Se alcanzó el límite de paginación (${maxPages} páginas). Algunos test cases pueden no estar incluidos.`);
  }
  
  console.log(`[BrowserStack TM] Test cases pagination complete. Total TCs: ${allTestCases.length}`);
  return allTestCases;
}

// ─── Cucumber JSON Parser ─────────────────────────────────────────────────────

function parseCucumberReports(reportsDir) {
  if (!fs.existsSync(reportsDir)) {
    console.error(`[BrowserStack TM] Reports directory not found: ${reportsDir}`);
    process.exit(1);
  }

  const jsonFiles = fs.readdirSync(reportsDir)
    .filter(f => f.endsWith('.json') && !f.startsWith('bs-upload'))
    .map(f => path.join(reportsDir, f));

  if (jsonFiles.length === 0) {
    console.error(`[BrowserStack TM] No Cucumber JSON files found in: ${reportsDir}`);
    console.error('[BrowserStack TM] Run the tests first to generate reports.');
    process.exit(1);
  }

  console.log(`[BrowserStack TM] Found ${jsonFiles.length} report file(s): ${jsonFiles.map(f => path.basename(f)).join(', ')}`);

  const mapped = [];
  let totalScenarios = 0;
  let skippedNoTag = 0;

  for (const file of jsonFiles) {
    let features;
    try {
      features = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      console.warn(`[BrowserStack TM] Could not parse ${path.basename(file)}: ${err.message}`);
      continue;
    }

    for (const feature of features) {
      for (const scenario of (feature.elements || [])) {
        totalScenarios++;

        const tcTag = (scenario.tags || []).find(t => t.name && TC_TAG_REGEX.test(t.name));
        if (!tcTag) {
          skippedNoTag++;
          continue;
        }

        const testCaseId = tcTag.name.replace('@', '').toUpperCase();

        const failedStep = (scenario.steps || []).find(s => s.result?.status === 'failed');
        const skippedStep = !failedStep && (scenario.steps || []).find(s => s.result?.status === 'skipped');
        const status = failedStep ? 'failed' : skippedStep ? 'skipped' : 'passed';

        const failureReason = failedStep?.result?.error_message
          ? failedStep.result.error_message.substring(0, 500)
          : undefined;

        const result = {
          test_case_id: testCaseId,
          test_result: { status },
        };
        if (failureReason) result.test_result.failure_reason = failureReason;

        mapped.push(result);
      }
    }
  }

  // Deduplicate by TC-ID: keep the worst status across all scenario instances
  // (e.g. Scenario Outline with N examples all share the same TC tag)
  const STATUS_PRIORITY = { failed: 0, skipped: 1, passed: 2 };
  const deduped = new Map();
  for (const result of mapped) {
    const existing = deduped.get(result.test_case_id);
    if (!existing || STATUS_PRIORITY[result.test_result.status] < STATUS_PRIORITY[existing.test_result.status]) {
      deduped.set(result.test_case_id, result);
    }
  }
  const dedupedResults = Array.from(deduped.values());

  if (mapped.length !== dedupedResults.length) {
    console.log(`[BrowserStack TM] Deduplicated ${mapped.length} scenario(s) → ${dedupedResults.length} unique TC(s) (Scenario Outlines collapsed)`);
  }

  console.log(`[BrowserStack TM] Scanned ${totalScenarios} scenario(s) | Mapped: ${dedupedResults.length} unique TC(s) | Skipped (no @TC-* tag): ${skippedNoTag}`);
  return dedupedResults;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n[BrowserStack TM] Starting reporter for project ${projectId} | ENV: ${nodeEnv}\n`);

  // Step 1 — Verify project exists
  console.log(`[BrowserStack TM] [1/4] Verifying project ${projectId}...`);
  
  const projects = await getAllProjects();
  
  const project = projects.find(p => p.identifier === projectId);
  if (!project) {
    console.error(`[BrowserStack TM] Project "${projectId}" not found. Check BROWSERSTACK_TM_PROJECT_ID.`);
    console.error(`[BrowserStack TM] Available projects (showing first 20 of ${projects.length}):`);
    projects.slice(0, 20).forEach((p, idx) => {
      console.error(`[BrowserStack TM]   [${idx + 1}] ${p.identifier} : "${p.name}"`);
    });
    process.exit(1);
  }
  console.log(`[BrowserStack TM] Project found: "${project.name}" (${projectId})`);

  // Step 2 — Fetch known test cases for pre-validation
  console.log(`[BrowserStack TM] [2/4] Fetching known test cases...`);
  const allTestCases = await getAllTestCases(projectId);
  const knownTCs = new Set();
  allTestCases.forEach(tc => knownTCs.add((tc.identifier || '').toUpperCase()));
  console.log(`[BrowserStack TM] Known test cases: ${knownTCs.size}`);

  // Step 3 — Parse Cucumber JSON reports
  console.log(`[BrowserStack TM] [3/4] Parsing Cucumber reports...`);
  const allResults = parseCucumberReports(CUCUMBER_REPORTS_DIR);

  if (allResults.length === 0) {
    console.warn('[BrowserStack TM] No mapped test cases found. Add @TC-<id> tags to your scenarios.');
    process.exit(0);
  }

  // Validate against known TCs and warn on mismatches
  const validResults = allResults.filter(r => {
    if (knownTCs.size > 0 && !knownTCs.has(r.test_case_id)) {
      console.warn(`[BrowserStack TM]  WARNING: "${r.test_case_id}" not found in project — skipping.`);
      return false;
    }
    return true;
  });

  if (validResults.length === 0) {
    console.error('[BrowserStack TM] No valid test case IDs matched the project. Check your @TC-* tags.');
    if (knownTCs.size > 0) {
      console.error(`[BrowserStack TM] Available Test Cases in project (showing first 10 of ${knownTCs.size}):`);
      Array.from(knownTCs).slice(0, 10).forEach(tc => {
        console.error(`[BrowserStack TM]   - ${tc}`);
      });
    }
    process.exit(1);
  }

  const passed = validResults.filter(r => r.test_result.status === 'passed').length;
  const failed = validResults.filter(r => r.test_result.status === 'failed').length;
  const skipped = validResults.filter(r => r.test_result.status === 'skipped').length;

  // Step 4 — Create or reuse test run, then submit results
  let testRunId;
  let runName;

  if (existingRunId) {
    testRunId = existingRunId;
    runName = existingRunId;
    console.log(`[BrowserStack TM] [4/4] Reusing existing run ${testRunId} — uploading ${validResults.length} result(s)...`);
  } else {
    console.log(`[BrowserStack TM] [4/4] Creating test run and uploading ${validResults.length} result(s)...`);

    const now = new Date().toUTCString().replace(/:\d{2} GMT$/, ' UTC');
    runName = `${githubWorkflow} | ${nodeEnv} | ${now}`;
    const runDescription = `Repo: ${githubRepo} | Branch: ${githubBranch} | Commit: ${githubSha} | Total: ${validResults.length} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`;

    const createRunRes = await apiRequest('POST', `/api/v2/projects/${projectId}/test-runs`, {
      test_run: {
        name: runName,
        description: runDescription,
        test_cases: validResults.map(r => r.test_case_id),
        build_tag: projectId,
      },
    });

    if (createRunRes.status !== 200 && createRunRes.status !== 201) {
      console.error(`[BrowserStack TM] Failed to create test run (HTTP ${createRunRes.status}):`, JSON.stringify(createRunRes.body));
      process.exit(1);
    }

    testRunId = createRunRes.body.test_run?.identifier || createRunRes.body.identifier;
    console.log(`[BrowserStack TM] Test run created: ${testRunId} — "${runName}"`);
  }

  // Submit results one by one
  let uploadedCount = 0;
  let uploadErrors = 0;

  for (const result of validResults) {
    const resultRes = await apiRequest(
      'POST',
      `/api/v2/projects/${projectId}/test-runs/${testRunId}/results`,
      result
    );

    if (resultRes.status === 200 || resultRes.status === 201) {
      const status = result.test_result.status.toUpperCase().padEnd(6);
      console.log(`[BrowserStack TM]   [${status}] ${result.test_case_id}`);
      uploadedCount++;
    } else {
      console.warn(`[BrowserStack TM]   [ERROR] ${result.test_case_id} — HTTP ${resultRes.status}: ${JSON.stringify(resultRes.body)}`);
      uploadErrors++;
    }
  }

  // Summary
  console.log(`
[BrowserStack TM] ─────────────────────────────────────────────
[BrowserStack TM]  Run:      ${testRunId} — "${runName}"
[BrowserStack TM]  Results:  ${uploadedCount} uploaded, ${uploadErrors} errors
[BrowserStack TM]  Passed:   ${passed} | Failed: ${failed} | Skipped: ${skipped}
[BrowserStack TM]  Link:     https://test-management.browserstack.com/projects/${projectId}/test-runs/${testRunId}
[BrowserStack TM] ─────────────────────────────────────────────
`);

  if (uploadErrors > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[BrowserStack TM] Unexpected error:', err);
  process.exit(1);
});
