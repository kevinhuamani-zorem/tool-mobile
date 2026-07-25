'use strict';
/**
 * Postinstall script: patches package-lock.json to replace known-vulnerable
 * nested dependency versions with the safe top-level versions already resolved
 * by npm overrides.
 *
 * npm overrides do not reliably propagate into packages that create their own
 * nested node_modules. This script closes that gap by copying the resolved
 * tarball URL and integrity hash from the safe top-level entry into any nested
 * entry that still references a vulnerable version.
 *
 * Exits 0 in all cases so it never blocks the install.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LOCK_FILE = path.join(__dirname, '..', 'package-lock.json');

/**
 * Minimum safe version for each package we care about.
 * Entries with version < minSafe are replaced.
 */
const MIN_SAFE = {
  'axios': '1.17.0',
  '@xmldom/xmldom': '0.9.10',
  'esbuild': '0.28.1',
  'follow-redirects': '1.16.0',
  'form-data': '4.0.6',
  'plist': '3.1.1',
  'qs': '6.15.2',
  'shell-quote': '1.8.4',
  'undici': '7.28.0',
  'uuid': '14.0.0',
};

/** Simple semver comparison: returns -1 | 0 | 1 */
function cmpVer(a, b) {
  const pa = String(a).replace(/[^0-9.]/g, '').split('.').map(Number);
  const pb = String(b).replace(/[^0-9.]/g, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

function isVulnerable(pkgName, version) {
  const min = MIN_SAFE[pkgName];
  return min !== undefined && cmpVer(version, min) < 0;
}

if (!fs.existsSync(LOCK_FILE)) {
  process.exit(0);
}

let lock;
try {
  lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
} catch {
  process.exit(0);
}

const packages = lock.packages || {};
let patched = 0;

for (const [pkgPath, pkgInfo] of Object.entries(packages)) {
  // Extract the bare package name (last node_modules segment)
  const pkgName = pkgPath.replace(/^.*\/node_modules\//, '');
  const version = pkgInfo.version || '';
  if (!version || !isVulnerable(pkgName, version)) continue;

  // Skip the top-level entry itself
  const topLevelKey = `node_modules/${pkgName}`;
  if (pkgPath === topLevelKey) continue;

  // Look up the top-level safe entry
  const safeEntry = packages[topLevelKey];
  if (!safeEntry || isVulnerable(pkgName, safeEntry.version || '')) {
    console.warn(
      `[fix-vuln-nested-deps] No safe top-level entry for ${pkgName}. ` +
        `Nested ${pkgPath}@${version} remains vulnerable.`
    );
    continue;
  }

  console.log(
    `[fix-vuln-nested-deps] Patching ${pkgPath}: ${version} → ${safeEntry.version}`
  );

  packages[pkgPath] = {
    ...pkgInfo,
    version: safeEntry.version,
    resolved: safeEntry.resolved,
    integrity: safeEntry.integrity,
  };
  patched++;
}

if (patched > 0) {
  fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  console.log(`[fix-vuln-nested-deps] Patched ${patched} entries in package-lock.json.`);
} else {
  console.log('[fix-vuln-nested-deps] No vulnerable nested deps found — nothing to patch.');
}

process.exit(0);
