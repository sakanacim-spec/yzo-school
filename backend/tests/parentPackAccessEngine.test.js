const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Configurer l'environnement pour bypasser la vérification de supabase.js
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key';
process.env.JWT_SECRET = 'test_secret_for_multitenant_lot5b_security_min_32_chars';
process.env.PASSWORD_RESET_OTP_SECRET = 'test_otp_secret_for_lot5b_hmac_min_32_chars';
process.env.AI_QUOTA_HASH_SECRET = 'test_ai_quota_hash_secret_min_32_chars_ok';

const { ACCESS_STATES, getAccessStatesForGlobalIds } = require('../services/parentPackService');
const { supabase } = require('../utils/supabase');

describe('P25-A: Parent Pack Access Engine', () => {
    let mockLinks = [];
    let mockPaidIds = [];
    const parentRef = 'parent-123';
    const gid1 = 'uuid-1';
    const gid2 = 'uuid-2';

    // Sauvegarde des fonctions originales
    const originalFrom = supabase.from;
    const originalRpc = supabase.rpc;

    beforeEach(() => {
        mockLinks = [];
        mockPaidIds = [];

        const createQueryMock = (data) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                then: (resolve) => resolve({ data, error: null })
            };
            return m;
        };

        supabase.from = (table) => {
            if (table === 'parent_child_links') return createQueryMock(mockLinks);
            return createQueryMock([]);
        };

        supabase.rpc = (fnName) => {
            if (fnName === 'get_active_parent_pack_subscriptions') {
                return Promise.resolve({ data: mockPaidIds, error: null });
            }
            return Promise.resolve({ data: [], error: null });
        };
    });

    afterEach(() => {
        supabase.from = originalFrom;
        supabase.rpc = originalRpc;
    });

    it('1. RPC retourne enfant A -> PAID_ACTIVE', async () => {
        mockLinks = [{ student_global_id: gid1, first_linked_at: '2020-01-01T00:00:00Z' }];
        mockPaidIds = [{ student_global_id: gid1 }];

        const res = await getAccessStatesForGlobalIds(parentRef, [gid1]);
        assert.equal(res[gid1].state, ACCESS_STATES.PAID_ACTIVE);
        assert.equal(res[gid1].accessAllowed, true);
    });

    it('2. RPC ne retourne pas enfant B + first_linked_at récent -> GRACE_ACTIVE', async () => {
        const d = new Date(Date.now() - (1 * 24 * 60 * 60 * 1000));
        mockLinks = [{ student_global_id: gid1, first_linked_at: d.toISOString() }];
        mockPaidIds = [];

        const res = await getAccessStatesForGlobalIds(parentRef, [gid1]);
        assert.equal(res[gid1].state, ACCESS_STATES.GRACE_ACTIVE);
    });

    it('3. RPC ne retourne pas enfant B + first_linked_at expiré -> PACK_SUSPENDED', async () => {
        const d = new Date(Date.now() - (8 * 24 * 60 * 60 * 1000));
        mockLinks = [{ student_global_id: gid1, first_linked_at: d.toISOString() }];
        mockPaidIds = [];

        const res = await getAccessStatesForGlobalIds(parentRef, [gid1]);
        assert.equal(res[gid1].state, ACCESS_STATES.PACK_SUSPENDED);
    });

    it('4. RPC ne retourne pas enfant legacy -> LEGACY_UNDECIDED', async () => {
        mockLinks = [{ student_global_id: gid1, first_linked_at: null }];
        mockPaidIds = [];

        const res = await getAccessStatesForGlobalIds(parentRef, [gid1]);
        assert.equal(res[gid1].state, ACCESS_STATES.LEGACY_UNDECIDED);
    });

    it('5. erreur RPC -> fail-closed (throw)', async () => {
        supabase.rpc = () => Promise.resolve({ data: null, error: new Error('RPC Failed') });
        await assert.rejects(
            async () => await getAccessStatesForGlobalIds(parentRef, [gid1]),
            /RPC Failed/
        );
    });

    it('6. enfant A retourné par RPC et enfant B non retourné -> états indépendants', async () => {
        const d = new Date(Date.now() - (8 * 24 * 60 * 60 * 1000)); // Grace expired for B
        mockLinks = [
            { student_global_id: gid1, first_linked_at: d.toISOString() },
            { student_global_id: gid2, first_linked_at: d.toISOString() }
        ];
        mockPaidIds = [{ student_global_id: gid1 }];

        const res = await getAccessStatesForGlobalIds(parentRef, [gid1, gid2]);
        assert.equal(res[gid1].state, ACCESS_STATES.PAID_ACTIVE);
        assert.equal(res[gid2].state, ACCESS_STATES.PACK_SUSPENDED);
    });

    it('7. Grâce à J0 -> GRACE_ACTIVE', async () => {
        mockLinks = [{ student_global_id: gid1, first_linked_at: new Date().toISOString() }];
        const res = await getAccessStatesForGlobalIds(parentRef, [gid1]);
        assert.equal(res[gid1].state, ACCESS_STATES.GRACE_ACTIVE);
        assert.equal(res[gid1].accessAllowed, true);
    });

    it('8. Exactement 1 ms avant +7 jours -> GRACE_ACTIVE', async () => {
        const mockedTime = 1600000000000;
        const originalDate = global.Date;
        global.Date = class extends originalDate {
            constructor(...args) {
                if (args.length === 0) return new originalDate(mockedTime);
                return new originalDate(...args);
            }
            static now() { return mockedTime; }
        };

        try {
            const d = new originalDate(mockedTime - (7 * 24 * 60 * 60 * 1000) + 1); // 7 days ago + 1ms
            mockLinks = [{ student_global_id: gid1, first_linked_at: d.toISOString() }];
            const res = await getAccessStatesForGlobalIds(parentRef, [gid1]);
            assert.equal(res[gid1].state, ACCESS_STATES.GRACE_ACTIVE);
        } finally {
            global.Date = originalDate;
        }
    });

    it('9. Exactement à +7 jours -> PACK_SUSPENDED', async () => {
        const mockedTime = 1600000000000;
        const originalDate = global.Date;
        global.Date = class extends originalDate {
            constructor(...args) {
                if (args.length === 0) return new originalDate(mockedTime);
                return new originalDate(...args);
            }
            static now() { return mockedTime; }
        };

        try {
            const d = new originalDate(mockedTime - (7 * 24 * 60 * 60 * 1000)); // exactly 7 days ago
            mockLinks = [{ student_global_id: gid1, first_linked_at: d.toISOString() }];
            const res = await getAccessStatesForGlobalIds(parentRef, [gid1]);
            assert.equal(res[gid1].state, ACCESS_STATES.PACK_SUSPENDED);
            assert.equal(res[gid1].accessAllowed, false);
        } finally {
            global.Date = originalDate;
        }
    });

    it('10. Après +7 jours -> PACK_SUSPENDED', async () => {
        const mockedTime = 1600000000000;
        const originalDate = global.Date;
        global.Date = class extends originalDate {
            constructor(...args) {
                if (args.length === 0) return new originalDate(mockedTime);
                return new originalDate(...args);
            }
            static now() { return mockedTime; }
        };

        try {
            const d = new originalDate(mockedTime - (8 * 24 * 60 * 60 * 1000));
            mockLinks = [{ student_global_id: gid1, first_linked_at: d.toISOString() }];
            const res = await getAccessStatesForGlobalIds(parentRef, [gid1]);
            assert.equal(res[gid1].state, ACCESS_STATES.PACK_SUSPENDED);
        } finally {
            global.Date = originalDate;
        }
    });

    it('11. Période payée active + grâce expirée -> PAID_ACTIVE', async () => {
        const d = new Date(Date.now() - (8 * 24 * 60 * 60 * 1000)); // Grace expired
        mockLinks = [{ student_global_id: gid1, first_linked_at: d.toISOString() }];
        mockPaidIds = [{ student_global_id: gid1 }];

        const res = await getAccessStatesForGlobalIds(parentRef, [gid1]);
        assert.equal(res[gid1].state, ACCESS_STATES.PAID_ACTIVE);
    });

    it('12. Enfant A PAID_ACTIVE et Enfant B PACK_SUSPENDED -> états indépendants', async () => {
        const d = new Date(Date.now() - (8 * 24 * 60 * 60 * 1000)); // Grace expired for B
        mockLinks = [
            { student_global_id: gid1, first_linked_at: d.toISOString() },
            { student_global_id: gid2, first_linked_at: d.toISOString() }
        ];
        mockPaidIds = [{ student_global_id: gid1 }];

        const res = await getAccessStatesForGlobalIds(parentRef, [gid1, gid2]);
        assert.equal(res[gid1].state, ACCESS_STATES.PAID_ACTIVE);
        assert.equal(res[gid2].state, ACCESS_STATES.PACK_SUSPENDED);
    });
});
