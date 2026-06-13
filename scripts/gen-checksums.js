#!/usr/bin/env node
/* =========================================================================
   GREYNET — BUILD ARTIFACT CHECKSUMS

   Run AFTER `npm run build` (or build:portable / build:installer):

     npm run dist:checksums

   Produces dist/SHA256SUMS.txt, a sha256sum-compatible manifest of every
   shipped Windows artifact (.exe / .zip / .blockmap / electron-builder .yml).
   Publish this alongside the binaries so users can verify their download:

     # PowerShell
     Get-FileHash .\GreyNet-0.6.1-portable.exe -Algorithm SHA256

     # POSIX
     sha256sum -c SHA256SUMS.txt

   Checksums detect corruption and casual tampering. They are NOT a substitute
   for Authenticode code signing (see RELEASE_SECURITY_CHECKLIST.md) — sign the
   binaries as well when a certificate is available.
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  console.error('dist/ not found — run a build first (npm run build).');
  process.exit(1);
}

const ARTIFACT_EXTS = new Set(['.exe', '.zip', '.blockmap', '.yml']);
const files = fs.readdirSync(distDir)
  .filter((f) => ARTIFACT_EXTS.has(path.extname(f).toLowerCase()))
  .filter((f) => f !== 'SHA256SUMS.txt')
  .sort();

if (files.length === 0) {
  console.error('No build artifacts found in dist/. Did the build succeed?');
  process.exit(1);
}

const lines = files.map((f) => {
  const buf = fs.readFileSync(path.join(distDir, f));
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  return `${hash}  ${f}`;
});

const outPath = path.join(distDir, 'SHA256SUMS.txt');
fs.writeFileSync(outPath, lines.join('\n') + '\n');

console.log(lines.join('\n'));
console.log(`\nWrote ${path.relative(path.join(__dirname, '..'), outPath)} (${files.length} artifact(s)).`);
