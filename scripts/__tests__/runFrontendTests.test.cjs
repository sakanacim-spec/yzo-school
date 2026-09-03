'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const runnerPath = path.resolve('scripts/run-frontend-tests.cjs');

test('Runner script : vérification statique (présence et sécurité)', () => {
  assert.ok(fs.existsSync(runnerPath), 'scripts/run-frontend-tests.cjs doit exister');
  const content = fs.readFileSync(runnerPath, 'utf8');

  assert.match(content, /shell:\s*false/, 'Le runner doit obligatoirement avoir shell: false');
  assert.doesNotMatch(content, /shell:\s*true/, 'Le runner ne doit jamais avoir shell: true');
  assert.match(content, /findTestFiles/, 'Le runner doit parcourir récursivement les fichiers');
  assert.match(content, /sort\(\)/, 'Le runner doit trier les fichiers pour un ordre déterministe');
  assert.match(content, /spawnSync/, 'Le runner doit utiliser spawnSync sans shell');
});

test('Runner script : découverte récursive, extensions strictes, tri et chemin avec espaces', (t) => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'yzo runner test with spaces '));
  t.after(() => {
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
  });

  // Arborescence :
  // tmpBase/
  //   z_last.test.ts  (valide)
  //   a_first.test.tsx (valide)
  //   sub/
  //     m_middle.test.ts (valide)
  //     ignored.ts (exclu)
  //     ignored.test.js (exclu car .js frontend)
  //     ignored.spec.ts (exclu)

  fs.mkdirSync(path.join(tmpBase, 'sub'), { recursive: true });

  const dummyTestContent = `
    const test = require('node:test');
    test('dummy pass', () => {});
  `;

  fs.writeFileSync(path.join(tmpBase, 'z_last.test.ts'), dummyTestContent, 'utf8');
  fs.writeFileSync(path.join(tmpBase, 'a_first.test.tsx'), dummyTestContent, 'utf8');
  fs.writeFileSync(path.join(tmpBase, 'sub', 'm_middle.test.ts'), dummyTestContent, 'utf8');
  fs.writeFileSync(path.join(tmpBase, 'sub', 'ignored.ts'), 'export const x = 1;', 'utf8');
  fs.writeFileSync(path.join(tmpBase, 'sub', 'ignored.test.js'), dummyTestContent, 'utf8');
  fs.writeFileSync(path.join(tmpBase, 'sub', 'ignored.spec.ts'), dummyTestContent, 'utf8');

  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_TEST_CONTEXT;

  const res = spawnSync(process.execPath, [runnerPath, tmpBase], {
    encoding: 'utf8',
    env: cleanEnv,
    shell: false
  });

  assert.equal(res.status, 0, `Le runner doit réussir sur des tests valides. Stderr: ${res.stderr}`);

  // Vérifier la détection exacte de 3 suites
  assert.match(res.stdout, /3 suites de tests frontend détectées/);

  // Vérifier l'exclusion des fichiers non ciblés
  assert.doesNotMatch(res.stdout, /ignored\.ts/);
  assert.doesNotMatch(res.stdout, /ignored\.test\.js/);
  assert.doesNotMatch(res.stdout, /ignored\.spec\.ts/);

  // Vérifier le tri déterministe (a_first avant m_middle avant z_last)
  const idxA = res.stdout.indexOf('a_first.test.tsx');
  const idxM = res.stdout.indexOf('m_middle.test.ts');
  const idxZ = res.stdout.indexOf('z_last.test.ts');

  assert.ok(idxA !== -1, 'a_first.test.tsx doit être présent');
  assert.ok(idxM !== -1, 'm_middle.test.ts doit être présent');
  assert.ok(idxZ !== -1, 'z_last.test.ts doit être présent');
  assert.ok(idxA < idxM && idxM < idxZ, 'Les tests doivent être ordonnés alphabétiquement');
});

test('Runner script : échec avec code 1 si aucun test détecté', (t) => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yzo empty test '));
  t.after(() => {
    try { fs.rmSync(emptyDir, { recursive: true, force: true }); } catch (_) {}
  });

  const res = spawnSync(process.execPath, [runnerPath, emptyDir], {
    encoding: 'utf8',
    shell: false
  });

  assert.equal(res.status, 1, 'Le runner doit sortir avec code 1 si aucun test');
  assert.match(res.stderr, /Aucun fichier de test/, 'Un message explicite doit être émis sur stderr');
});

test('Runner script : propagation fidèle du code d’échec du processus enfant', (t) => {
  const failDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yzo failing test '));
  t.after(() => {
    try { fs.rmSync(failDir, { recursive: true, force: true }); } catch (_) {}
  });

  const failingTestContent = `
import test from 'node:test';
import assert from 'node:assert/strict';
test('intentional failure', () => {
  assert.equal(1, 2, 'Échec attendu');
});
`;
  fs.writeFileSync(path.join(failDir, 'failure.test.ts'), failingTestContent, 'utf8');

  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_TEST_CONTEXT;

  const res = spawnSync(process.execPath, [runnerPath, failDir], {
    encoding: 'utf8',
    env: cleanEnv,
    shell: false
  });

  assert.notEqual(res.status, 0, `Le runner doit propager un code non-nul si un test échoue. Code: ${res.status}, out: ${res.stdout}, err: ${res.stderr}`);
  assert.equal(res.status, 1, 'Le code d’échec standard attendu est 1');
});
