process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key_1234567890123456';
process.env.JWT_SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
process.env.AI_QUOTA_HASH_SECRET = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
process.env.PASSWORD_RESET_OTP_SECRET = 'cccccccccccccccccccccccccccccccc';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const { supabase } = require('../utils/supabase');
const parentRouter = require('../routes/parent');

function createToken(payload) {
    return jwt.sign(
        { token_type: 'access', ...payload },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '1h' }
    );
}

function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/parent', parentRouter);
    return app;
}

// Helper pour simuler un appel HTTP local vers l'app express
async function request(app, options) {
    const { method, path, headers = {}, body = null } = options;
    return new Promise((resolve) => {
        const req = {
            method,
            url: path,
            headers: {
                ...headers,
                'content-type': 'application/json'
            },
            body
        };

        const res = {
            statusCode: 200,
            _headers: {},
            _body: '',
            status(code) {
                this.statusCode = code;
                return this;
            },
            setHeader(name, val) {
                this._headers[name.toLowerCase()] = val;
            },
            getHeader(name) {
                return this._headers[name.toLowerCase()];
            },
            json(data) {
                this._body = JSON.stringify(data);
                this.resolveResponse();
            },
            send(text) {
                this._body = String(text);
                this.resolveResponse();
            },
            resolveResponse() {
                resolve({
                    status: this.statusCode,
                    headers: this._headers,
                    body: this._body ? JSON.parse(this._body) : null
                });
            }
        };

        app.handle(req, res);
    });
}

describe('YZIOW P26-B Lot 3C — API GET /api/parent/link-requests', () => {
    let app;
    let mockRequests = [];
    let mockSchools = [];
    let mockCountError = null;
    let mockDataError = null;

    beforeEach(() => {
        app = createTestApp();
        mockRequests = [];
        mockSchools = [
            { slug: 'ecole_a', name: 'École Primaire Sainte-Marie' },
            { slug: 'ecole_b', name: 'Collège de l\'Avenir' }
        ];
        mockCountError = null;
        mockDataError = null;

        // Mock Supabase
        supabase.from = (table) => {
            if (table === 'parent_student_link_requests') {
                return {
                    select: (cols, opts) => {
                        let filterParentId = null;
                        let rangeFrom = 0;
                        let rangeTo = 999;

                        const chain = {
                            eq: (field, val) => {
                                if (field === 'parent_id') filterParentId = val;
                                return chain;
                            },
                            order: () => chain,
                            range: (from, to) => {
                                rangeFrom = from;
                                rangeTo = to;
                                if (mockDataError) {
                                    return Promise.resolve({ data: null, error: mockDataError });
                                }
                                const filtered = mockRequests.filter(r => !filterParentId || r.parent_id === filterParentId);
                                const paged = filtered.slice(rangeFrom, rangeTo + 1);
                                return Promise.resolve({ data: paged, error: null });
                            }
                        };

                        if (opts?.head && opts?.count === 'exact') {
                            const countChain = {
                                eq: (field, val) => {
                                    if (field === 'parent_id') filterParentId = val;
                                    return countChain;
                                },
                                then: (resolve) => {
                                    if (mockCountError) {
                                        return resolve({ count: 0, error: mockCountError });
                                    }
                                    const count = mockRequests.filter(r => !filterParentId || r.parent_id === filterParentId).length;
                                    return resolve({ count, error: null });
                                }
                            };
                            return countChain;
                        }

                        return chain;
                    }
                };
            }

            if (table === 'schools') {
                return {
                    select: (cols) => ({
                        in: (col, values) => {
                            const matches = mockSchools.filter(s => values.includes(s.slug));
                            return Promise.resolve({ data: matches, error: null });
                        }
                    })
                };
            }

            return {
                select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) })
            };
        };
    });

    it('1. Absence de JWT -> HTTP 401 refus d\'accès', async () => {
        const res = await request(app, {
            method: 'GET',
            path: '/api/parent/link-requests'
        });

        assert.strictEqual(res.status, 401);
        assert.ok(res.body.error.includes('Token manquant'));
    });

    it('2. Rôle non autorisé (directeur, admin, etc.) -> HTTP 403 réservé aux parents', async () => {
        const token = createToken({ id: 'user-dir-1', role: 'directeur', nom: 'Directeur A' });
        const res = await request(app, {
            method: 'GET',
            path: '/api/parent/link-requests',
            headers: { authorization: `Bearer ${token}` }
        });

        assert.strictEqual(res.status, 403);
        assert.ok(res.body.error.includes('Accès réservé aux parents'));
    });

    it('3. Filtrage strict par parent_id authentifié (impossible d\'accéder aux demandes d\'autrui)', async () => {
        const parentId = '11111111-1111-4111-8111-111111111111';
        const otherParentId = '22222222-2222-4222-8222-222222222222';

        mockRequests = [
            {
                id: 'req-1',
                parent_id: parentId,
                school_slug: 'ecole_a',
                student_name: 'Enfant Mon Parent',
                student_class: 'CM2',
                status: 'pending',
                requested_at: '2026-10-14T10:00:00Z',
                decided_at: null,
                decided_by: 'secret-uuid-1',
                rejection_reason: null,
                rejection_reason_code: null
            },
            {
                id: 'req-2',
                parent_id: otherParentId,
                school_slug: 'ecole_a',
                student_name: 'Enfant Autre Parent',
                student_class: '6ème',
                status: 'pending',
                requested_at: '2026-10-14T11:00:00Z',
                decided_by: 'secret-uuid-2'
            }
        ];

        const token = createToken({ id: parentId, role: 'parent', nom: 'Parent Test' });
        const res = await request(app, {
            method: 'GET',
            path: '/api/parent/link-requests?parentId=arbitrary-id-hacked',
            headers: { authorization: `Bearer ${token}` }
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.total, 1);
        assert.strictEqual(res.body.requests.length, 1);
        assert.strictEqual(res.body.requests[0].id, 'req-1');
        assert.strictEqual(res.body.requests[0].student_name, 'Enfant Mon Parent');
        assert.strictEqual(res.body.requests[0].school_name, 'École Primaire Sainte-Marie');
    });

    it('4. Non-exposition des champs techniques ou confidentiels (decided_by, SQL)', async () => {
        const parentId = '11111111-1111-4111-8111-111111111111';

        mockRequests = [
            {
                id: 'req-rej',
                parent_id: parentId,
                school_slug: 'ecole_b',
                student_name: 'Élève Rejeté',
                student_class: '4ème',
                status: 'rejected',
                requested_at: '2026-10-14T08:00:00Z',
                decided_at: '2026-10-14T09:00:00Z',
                decided_by: 'director-secret-uuid-999',
                revoked_by: 'admin-secret-uuid-888',
                rejection_reason: 'Informations non concordantes',
                rejection_reason_code: 'IDENTITY_MISMATCH'
            }
        ];

        const token = createToken({ id: parentId, role: 'parent', nom: 'Parent Test' });
        const res = await request(app, {
            method: 'GET',
            path: '/api/parent/link-requests',
            headers: { authorization: `Bearer ${token}` }
        });

        assert.strictEqual(res.status, 200);
        const reqItem = res.body.requests[0];
        assert.strictEqual(reqItem.decided_by, undefined, 'decided_by ne doit pas être exposé');
        assert.strictEqual(reqItem.revoked_by, undefined, 'revoked_by ne doit pas être exposé');
        assert.strictEqual(reqItem.status, 'rejected');
        assert.strictEqual(reqItem.rejection_reason, 'Informations non concordantes');
        assert.strictEqual(reqItem.rejection_reason_code, 'IDENTITY_MISMATCH');
        assert.strictEqual(reqItem.school_name, 'Collège de l\'Avenir');
    });

    it('5. Motif de rejet masqué si la demande n\'est pas au statut rejected', async () => {
        const parentId = '11111111-1111-4111-8111-111111111111';

        mockRequests = [
            {
                id: 'req-pending',
                parent_id: parentId,
                school_slug: 'ecole_a',
                student_name: 'Élève En Attente',
                status: 'pending',
                requested_at: '2026-10-14T08:00:00Z',
                rejection_reason: 'Ancien motif orphelin',
                rejection_reason_code: 'OTHER'
            }
        ];

        const token = createToken({ id: parentId, role: 'parent', nom: 'Parent Test' });
        const res = await request(app, {
            method: 'GET',
            path: '/api/parent/link-requests',
            headers: { authorization: `Bearer ${token}` }
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.requests[0].status, 'pending');
        assert.strictEqual(res.body.requests[0].rejection_reason, null, 'Le motif ne doit pas être exposé si pending');
    });

    it('6. Validation stricte de la pagination (400 si page ou limit invalides)', async () => {
        const token = createToken({ id: 'parent-1', role: 'parent', nom: 'Parent Test' });

        const testCases = [
            '/api/parent/link-requests?page=0',
            '/api/parent/link-requests?page=-1',
            '/api/parent/link-requests?page=abc',
            '/api/parent/link-requests?limit=101',
            '/api/parent/link-requests?limit=0',
            '/api/parent/link-requests?limit=-5',
            '/api/parent/link-requests?page=1.5'
        ];

        for (const url of testCases) {
            const res = await request(app, {
                method: 'GET',
                path: url,
                headers: { authorization: `Bearer ${token}` }
            });
            assert.strictEqual(res.status, 400, `Doit refuser ${url} avec HTTP 400`);
            assert.ok(res.body.error.includes('pagination'));
        }
    });

    it('7. Erreur base de données -> HTTP 500 fail-closed sans exposition SQL', async () => {
        const token = createToken({ id: 'parent-1', role: 'parent', nom: 'Parent Test' });
        mockDataError = { message: 'relation "parent_student_link_requests" does not exist (SQL: SELECT * FROM ...)', code: '42P01' };

        const res = await request(app, {
            method: 'GET',
            path: '/api/parent/link-requests',
            headers: { authorization: `Bearer ${token}` }
        });

        assert.strictEqual(res.status, 500);
        assert.strictEqual(res.body.error, 'Erreur serveur lors de la récupération de vos demandes de rattachement.');
        assert.strictEqual(res.body.code, undefined);
        assert.strictEqual(res.body.sql, undefined);
    });
});
