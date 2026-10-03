const { test, describe } = require('node:test');
const assert = require('node:assert');
const { normalizePhone } = require('../utils/helpers');

describe('Phone Normalization', () => {
    test('0197000000 with country BJ becomes +2290197000000', () => {
        const result = normalizePhone('0197000000', 'BJ');
        assert.strictEqual(result, '+2290197000000');
    });

    test('+2290197000000 is accepted and remains unchanged', () => {
        const result = normalizePhone('+2290197000000');
        assert.strictEqual(result, '+2290197000000');
    });

    test('Number starting with 00 is converted to +', () => {
        const result = normalizePhone('002290197000000');
        assert.strictEqual(result, '+2290197000000');
    });

    test('97000000 with BJ is rejected with INVALID_PHONE', () => {
        assert.throws(() => normalizePhone('97000000', 'BJ'), {
            message: 'INVALID_PHONE'
        });
    });

    test('National number without country is rejected with COUNTRY_REQUIRED', () => {
        assert.throws(() => normalizePhone('0197000000'), {
            message: 'COUNTRY_REQUIRED'
        });
    });

    test('Valid French national number with country FR is converted to E.164', () => {
        const result = normalizePhone('0612345678', 'FR');
        assert.strictEqual(result, '+33612345678');
    });

    test('Empty values, mixed text, and invalid ISO are rejected', () => {
        assert.throws(() => normalizePhone('', 'BJ'), { message: 'INVALID_PHONE' });
        assert.throws(() => normalizePhone('   ', 'BJ'), { message: 'INVALID_PHONE' });
        assert.throws(() => normalizePhone('abc97000000def', 'BJ'), { message: 'INVALID_PHONE' });
        assert.throws(() => normalizePhone('0197000000', 'XX'), { message: 'INVALID_PHONE' });
    });

    test('Equivalent formats lead to exactly the same E.164', () => {
        const r1 = normalizePhone('0197000000', 'BJ');
        const r2 = normalizePhone('+229 01 97 00 00 00');
        const r3 = normalizePhone('002290197000000');
        assert.strictEqual(r1, '+2290197000000');
        assert.strictEqual(r1, r2);
        assert.strictEqual(r1, r3);
    });
});
