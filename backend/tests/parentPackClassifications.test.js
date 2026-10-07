// backend/tests/parentPackClassifications.test.js
const test = require('node:test');
const assert = require('node:assert');
const { resolveCycleName } = require('../config/parentPackClassifications');

test('resolveCycleName - FR exact', () => {
  assert.strictEqual(resolveCycleName('CP1'), 'maternelle_primaire');
  assert.strictEqual(resolveCycleName('6EME'), 'college_secondaire');
});

test('resolveCycleName - EN exact', () => {
  assert.strictEqual(resolveCycleName('Kindergarten 1'), 'maternelle_primaire');
  assert.strictEqual(resolveCycleName('Grade 12'), 'college_secondaire');
});

test('resolveCycleName - Aliases normalisation', () => {
  assert.strictEqual(resolveCycleName('6ème'), 'college_secondaire');
  assert.strictEqual(resolveCycleName('6 EME'), 'college_secondaire');
  assert.strictEqual(resolveCycleName('1ère A4'), 'college_secondaire');
  assert.strictEqual(resolveCycleName('grade 12'), 'college_secondaire');
});

test('resolveCycleName - Unknown Fail Closed', () => {
  assert.throws(() => resolveCycleName('Université'), /CLASS_UNKNOWN/);
  assert.throws(() => resolveCycleName(''), /CLASS_UNKNOWN/);
  assert.throws(() => resolveCycleName(null), /CLASS_UNKNOWN/);
});
