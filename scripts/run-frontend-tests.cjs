#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workspaceRoot = path.resolve(__dirname, '..');
const rawTarget = process.env.FRONTEND_TEST_ROOT || process.argv[2] || 'src';
const targetDir = path.isAbsolute(rawTarget) ? rawTarget : path.resolve(workspaceRoot, rawTarget);

function findTestFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTestFiles(fullPath));
    } else if (entry.isFile() && /\.(test)\.(ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

const testFiles = findTestFiles(targetDir);
testFiles.sort();

if (testFiles.length === 0) {
  console.error(`Aucun fichier de test (*.test.ts, *.test.tsx) trouvé dans ${targetDir}`);
  process.exit(1);
}

console.log(`[run-frontend-tests] ${testFiles.length} suites de tests frontend détectées :`);
for (const file of testFiles) {
  console.log(`  - ${path.relative(workspaceRoot, file).replace(/\\/g, '/')}`);
}

const child = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: workspaceRoot,
  stdio: 'inherit',
  shell: false,
});

if (child.error) {
  console.error('Erreur lors de l’exécution des tests frontend :', child.error);
  process.exit(1);
}

process.exit(child.status !== null ? child.status : 1);
