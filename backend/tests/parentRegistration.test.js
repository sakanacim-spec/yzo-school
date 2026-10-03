const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { installSupabaseMock, restoreSupabaseMock } = require('./helpers/mockSupabaseModule');

describe('Parent Registration Controller', () => {
    let authController;
    let req, res;
    let responseData;
    let statusCode;

    // Mocks state
    let supabaseCalls = [];
    let adminAuthUserCreated = null;
    let deletedAuthUserId = null;
    let insertedProfile = null;
    let internalEmailCreated = null;

    before(() => {
        installSupabaseMock({
            supabase: {
                from: (table) => {
                    return {
                        select: (columns) => ({
                            eq: (field, value) => {
                                supabaseCalls.push({ action: 'select', table, columns, field, value });
                                return {
                                    single: async () => {
                                        if (table === 'schools' && value === 'demo_school') {
                                            return { data: { status: 'active', name: 'Demo School' } };
                                        }
                                        if (table === 'schools' && value === 'other_school') {
                                            return { data: { status: 'active', name: 'Other School' } };
                                        }
                                        return { data: null };
                                    },
                                    maybeSingle: async () => {
                                        if (table === 'profiles_demo_school' && field === 'phone_normalized') {
                                            // Simulate duplicate behavior
                                            if (value === '+33612345678') return { data: { id: 'dup-id' } };
                                        }
                                        return { data: null };
                                    }
                                };
                            }
                        }),
                        insert: (payload) => {
                            supabaseCalls.push({ action: 'insert', table, payload });
                            return {
                                select: () => ({
                                    single: async () => {
                                        if (payload.nom === 'Fail Insert') {
                                            return { data: null, error: new Error('DB Error') };
                                        }
                                        insertedProfile = payload;
                                        return { data: payload, error: null };
                                    }
                                })
                            };
                        }
                    };
                }
            },
            supabaseAdmin: {
                auth: {
                    admin: {
                        createUser: async (params) => {
                            supabaseCalls.push({ action: 'admin_create_user', params });
                            adminAuthUserCreated = params;
                            internalEmailCreated = params.email;
                            return { data: { user: { id: 'mocked-auth-uuid-123' } }, error: null };
                        },
                        deleteUser: async (id) => {
                            supabaseCalls.push({ action: 'admin_delete_user', id });
                            deletedAuthUserId = id;
                        }
                    }
                }
            }
        });

        // Mock external config and services
        process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
        process.env.JWT_EXPIRES = '1h';
        process.env.PASSWORD_RESET_OTP_SECRET = 'test-secret-that-is-at-least-32-characters-long';
        const smsService = require('../../backend/utils/smsService');
        smsService.sendWelcomeSMS = async () => {}; // mock SMS

        authController = require('../controllers/authController');
    });

    after(() => {
        restoreSupabaseMock();
    });

    beforeEach(() => {
        supabaseCalls = [];
        adminAuthUserCreated = null;
        deletedAuthUserId = null;
        insertedProfile = null;
        internalEmailCreated = null;
        statusCode = null;
        responseData = null;

        req = {
            body: {}
        };

        res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => { responseData = data; return res; }
        };
    });

    test('Valid registration creates auth user and profile with E.164 exactly', async () => {
        req.body = {
            nom: 'Test Parent',
            telephone: '0197000000',
            countryCode: 'BJ',
            password: 'securepassword',
            school_slug: 'demo_school',
            accepted_terms: true,
            accepted_privacy_policy: true
        };

        await authController.register(req, res);

        assert.strictEqual(statusCode, 201, `Expected 201 but got ${statusCode}. Error: ${responseData?.error}`);

        // Auth user created with correct full metadata
        assert.ok(adminAuthUserCreated);
        assert.strictEqual(adminAuthUserCreated.user_metadata.role, 'parent');
        assert.strictEqual(adminAuthUserCreated.user_metadata.school_slug, 'demo_school');
        assert.strictEqual(adminAuthUserCreated.user_metadata.phone_normalized, '+2290197000000');

        // Internal email generation uses phone_normalized and is deterministic
        const crypto = require('crypto');
        const expectedHash = crypto.createHash('sha256').update('demo_school:+2290197000000').digest('hex').slice(0, 32);
        const expectedEmail = `u_${expectedHash}@auth.yziow.internal`;
        assert.strictEqual(internalEmailCreated, expectedEmail);

        // Profile inserted exactly with auth UUID and normalized phone
        assert.ok(insertedProfile);
        assert.strictEqual(insertedProfile.id, 'mocked-auth-uuid-123');
        assert.strictEqual(insertedProfile.telephone, '0197000000'); // keeps original
        assert.strictEqual(insertedProfile.phone_normalized, '+2290197000000'); // stores E.164
    });

    test('Client-provided phone_normalized is completely ignored', async () => {
        req.body = {
            nom: 'Test Parent',
            telephone: '0197000000',
            countryCode: 'BJ',
            password: 'securepassword',
            school_slug: 'demo_school',
            accepted_terms: true,
            accepted_privacy_policy: true,
            phone_normalized: '+33612345678' // Fake injected normalized phone
        };

        await authController.register(req, res);

        assert.strictEqual(statusCode, 201);

        // Auth user created with CORRECT phone_normalized, ignoring the client's injected value
        assert.ok(adminAuthUserCreated);
        assert.strictEqual(adminAuthUserCreated.user_metadata.phone_normalized, '+2290197000000');
        assert.strictEqual(insertedProfile.phone_normalized, '+2290197000000');
    });

    test('Injecting an actually unknown field (e.g. role) is rejected with HTTP 400', async () => {
        req.body = {
            nom: 'Test Parent',
            telephone: '0197000000',
            countryCode: 'BJ',
            password: 'securepassword',
            school_slug: 'demo_school',
            accepted_terms: true,
            accepted_privacy_policy: true,
            role: 'admin' // Unknown and unpermitted field
        };

        await authController.register(req, res);

        assert.strictEqual(statusCode, 400);
        assert.ok(responseData.error.includes('is not allowed'), `Expected error to mention role is not allowed, got: ${responseData.error}`);
        assert.strictEqual(adminAuthUserCreated, null); // No auth created
    });

    test('Invalid phone returns INVALID_PHONE HTTP 400 and no user created', async () => {
        req.body = {
            nom: 'Test Parent',
            telephone: '97000000', // Invalid Benin
            countryCode: 'BJ',
            password: 'securepassword',
            school_slug: 'demo_school',
            accepted_terms: true,
            accepted_privacy_policy: true
        };

        await authController.register(req, res);

        assert.strictEqual(statusCode, 400);
        assert.strictEqual(responseData.error, 'INVALID_PHONE');
        assert.strictEqual(responseData.field, 'telephone');
        assert.strictEqual(adminAuthUserCreated, null); // no auth created
    });

    test('National number without country returns COUNTRY_REQUIRED HTTP 400', async () => {
        req.body = {
            nom: 'Test Parent',
            telephone: '0197000000',
            password: 'securepassword',
            school_slug: 'demo_school',
            accepted_terms: true,
            accepted_privacy_policy: true
        };

        await authController.register(req, res);

        assert.strictEqual(statusCode, 400);
        assert.strictEqual(responseData.error, 'COUNTRY_REQUIRED');
        assert.strictEqual(responseData.field, 'telephone');
        assert.strictEqual(adminAuthUserCreated, null);
    });

    test('Duplicate phone_normalized is strictly rejected in the SAME school', async () => {
        req.body = {
            nom: 'Test Parent',
            telephone: '+33612345678', // This triggers the dup check in our mock for demo_school
            countryCode: 'FR',
            password: 'securepassword',
            school_slug: 'demo_school',
            accepted_terms: true,
            accepted_privacy_policy: true
        };

        await authController.register(req, res);

        assert.strictEqual(statusCode, 409);
        assert.strictEqual(responseData.error, 'PHONE_ALREADY_EXISTS');
        assert.strictEqual(responseData.field, 'telephone');
        assert.strictEqual(adminAuthUserCreated, null);

        // Verify exact duplicate lookup scope
        const dupCheckCall = supabaseCalls.find(c => c.action === 'select' && c.table === 'profiles_demo_school');
        assert.ok(dupCheckCall, 'Missing duplicate check call to profiles_demo_school');
        assert.strictEqual(dupCheckCall.field, 'phone_normalized');
        assert.strictEqual(dupCheckCall.value, '+33612345678');
    });

    test('Same phone_normalized is ACCEPTED for a DIFFERENT schoolSlug', async () => {
        req.body = {
            nom: 'Test Parent 2',
            telephone: '+33612345678', // Same number, but different school
            countryCode: 'FR',
            password: 'securepassword',
            school_slug: 'other_school',
            accepted_terms: true,
            accepted_privacy_policy: true
        };

        await authController.register(req, res);

        assert.strictEqual(statusCode, 201, `Expected 201 but got ${statusCode}`);
        assert.ok(adminAuthUserCreated); // Auth user created
        assert.strictEqual(insertedProfile.phone_normalized, '+33612345678');
    });

    test('Rollback Auth if profile insertion fails', async () => {
        req.body = {
            nom: 'Fail Insert',
            telephone: '0622334455',
            countryCode: 'FR',
            password: 'securepassword',
            school_slug: 'demo_school',
            accepted_terms: true,
            accepted_privacy_policy: true
        };

        await authController.register(req, res);

        assert.strictEqual(statusCode, 500);
        assert.ok(adminAuthUserCreated); // it was created first
        assert.strictEqual(deletedAuthUserId, 'mocked-auth-uuid-123'); // then rolled back
    });
});
