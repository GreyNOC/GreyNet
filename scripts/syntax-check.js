// Cross-platform `node --check` runner over every JS file we own.
// Used by `npm run check` and recommended in PRODUCTION_READINESS.md as a
// fast pre-commit/pre-build sanity gate that catches parse-level breakage.
'use strict';
const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.claude', 'test-results']);

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st   = fs.statSync(full);
    if (st.isDirectory())  out.push(...walk(full));
    else if (st.isFile() && full.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(ROOT).sort();
let failed = 0;
for (const f of files) {
  const rel = path.relative(ROOT, f);
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    console.log(`  ok   ${rel}`);
  } catch (err) {
    failed++;
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    console.error(`  FAIL ${rel}\n${stderr.split('\n').slice(0, 4).map(l => '       ' + l).join('\n')}`);
  }
}
console.log(`\n${files.length - failed}/${files.length} files passed node --check`);
process.exit(failed ? 1 : 0);
