'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const runnerPath = path.resolve('scripts/run-backend-tests.cjs');

test('Backend Runner script : vérification statique (présence et sécurité)', () => {
  assert.ok(fs.existsSync(runnerPath), 'scripts/run-backend-tests.cjs doit exister');
  const content = fs.readFileSync(runnerPath, 'utf8');

  assert.match(content, /shell:\s*false/, 'Le runner doit obligatoirement avoir shell: false');
  assert.doesNotMatch(content, /shell:\s*true/, 'Le runner ne doit jamais avoir shell: true');
  assert.match(content, /findTestFiles/, 'Le runner doit parcourir récursivement les fichiers');
  assert.match(content, /sort\(\)/, 'Le runner doit trier les fichiers pour un ordre déterministe');
  assert.match(content, /spawnSync/, 'Le runner doit utiliser spawnSync sans shell');
});

test('Backend Runner script : découverte récursive, extensions .js/.cjs/.mjs, tri et chemin avec espaces', (t) => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'yzo backend runner spaces '));
  t.after(() => {
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
  });

  fs.mkdirSync(path.join(tmpBase, 'sub'), { recursive: true });

  const dummyTestContent = `
    const test = require('node:test');
    test('dummy pass', () => {});
  `;

  fs.writeFileSync(path.join(tmpBase, 'z_last.test.js'), dummyTestContent, 'utf8');
  fs.writeFileSync(path.join(tmpBase, 'a_first.test.cjs'), dummyTestContent, 'utf8');
  fs.writeFileSync(path.join(tmpBase, 'sub', 'm_middle.test.mjs'), 'import test from "node:test"; test("pass", () => {});', 'utf8');
  fs.writeFileSync(path.join(tmpBase, 'sub', 'ignored.js'), 'module.exports = 1;', 'utf8');
  fs.writeFileSync(path.join(tmpBase, 'sub', 'ignored.spec.js'), dummyTestContent, 'utf8');

  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_TEST_CONTEXT;

  const res = spawnSync(process.execPath, [runnerPath, tmpBase], {
    encoding: 'utf8',
    env: cleanEnv,
    shell: false
  });

  assert.equal(res.status, 0, `Le runner doit réussir sur des tests valides. Stderr: ${res.stderr}`);
  assert.match(res.stdout, /3 suites de tests backend détectées/);
  assert.doesNotMatch(res.stdout, /ignored\.js/);
  assert.doesNotMatch(res.stdout, /ignored\.spec\.js/);

  const idxA = res.stdout.indexOf('a_first.test.cjs');
  const idxM = res.stdout.indexOf('m_middle.test.mjs');
  const idxZ = res.stdout.indexOf('z_last.test.js');

  assert.ok(idxA !== -1 && idxM !== -1 && idxZ !== -1, 'Toutes les suites attendues doivent être présentes');
  assert.ok(idxA < idxM && idxM < idxZ, 'Les suites doivent être triées alphabétiquement');
});

test('Backend Runner script : échec avec code 1 si aucun test détecté', (t) => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yzo empty backend test '));
  t.after(() => {
    try { fs.rmSync(emptyDir, { recursive: true, force: true }); } catch (_) {}
  });

  const res = spawnSync(process.execPath, [runnerPath, emptyDir], {
    encoding: 'utf8',
    shell: false
  });

  assert.equal(res.status, 1, 'Le runner doit sortir avec code 1 si aucun test');
  assert.match(res.stderr, /Aucun fichier de test/, 'Un message d’erreur doit être émis sur stderr');
});

test('Backend Runner script : propagation fidèle du code d’échec du processus enfant', (t) => {
  const failDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yzo failing backend test '));
  t.after(() => {
    try { fs.rmSync(failDir, { recursive: true, force: true }); } catch (_) {}
  });

  const failingTestContent = `
    const test = require('node:test');
    const assert = require('node:assert/strict');
    test('intentional backend failure', () => {
      assert.equal(1, 2, 'Échec attendu');
    });
  `;
  fs.writeFileSync(path.join(failDir, 'failure.test.js'), failingTestContent, 'utf8');

  const cleanEnv = { ...process.env };
  delete cleanEnv.NODE_TEST_CONTEXT;

  const res = spawnSync(process.execPath, [runnerPath, failDir], {
    encoding: 'utf8',
    env: cleanEnv,
    shell: false
  });

  assert.notEqual(res.status, 0, `Le runner doit propager un code non-nul. Code: ${res.status}`);
  assert.equal(res.status, 1, 'Le code d’échec attendu est 1');
});
