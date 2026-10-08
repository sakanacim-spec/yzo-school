const { describe, it } = require('node:test');
const assert = require('node:assert');
const { normalizeIdentityText, normalizeIdentityDate } = require('../utils/helpers');

describe('Identity Normalization Helpers', () => {
    it('normalizes text', () => {
        assert.strictEqual(normalizeIdentityText(' Éric '), 'eric');
        assert.strictEqual(normalizeIdentityText('JEAN-LUC'), 'jean-luc');
        assert.strictEqual(normalizeIdentityText('Hélène'), 'helene');
        assert.strictEqual(normalizeIdentityText(null), null);
    });

    it('normalizes dates', () => {
        assert.strictEqual(normalizeIdentityDate('2015-05-12'), '2015-05-12');
        assert.strictEqual(normalizeIdentityDate('2015-05-12T00:00:00.000Z'), '2015-05-12');
        assert.strictEqual(normalizeIdentityDate('12/05/2015'), '2015-05-12');
        assert.strictEqual(normalizeIdentityDate('invalid'), null);
        assert.strictEqual(normalizeIdentityDate(null), null);
    });
});
