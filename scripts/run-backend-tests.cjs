#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workspaceRoot = path.resolve(__dirname, '..');
const rawTarget = process.env.BACKEND_TEST_ROOT || process.argv[2] || 'backend/tests';
const targetDir = path.isAbsolute(rawTarget) ? rawTarget : path.resolve(workspaceRoot, rawTarget);

function findTestFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTestFiles(fullPath));
    } else if (entry.isFile() && /\.(test)\.(js|cjs|mjs)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

const testFiles = findTestFiles(targetDir);
testFiles.sort();

if (testFiles.length === 0) {
  console.error(`Aucun fichier de test (*.test.js, *.test.cjs, *.test.mjs) trouvé dans ${targetDir}`);
  process.exit(1);
}

console.log(`[run-backend-tests] ${testFiles.length} suites de tests backend détectées :`);
for (const file of testFiles) {
  console.log(`  - ${path.relative(workspaceRoot, file).replace(/\\/g, '/')}`);
}

const child = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: workspaceRoot,
  stdio: 'inherit',
  shell: false,
});

if (child.error) {
  console.error('Erreur lors de l’exécution des tests backend :', child.error);
  process.exit(1);
}

process.exit(child.status !== null ? child.status : 1);
