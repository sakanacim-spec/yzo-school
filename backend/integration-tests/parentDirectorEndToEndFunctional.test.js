/**
 * YZIOW — P26-B : Validation fonctionnelle complète parent-directeur (Banc E2E Intégré)
 * 
 * Exécute l'intégralité des scénarios A à E sur l'API Express réelle et la base
 * PostgreSQL jetable locale (pg-yziow-p26b-test).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

// 1. CONFIGURATION STRICTEMENT LOCALE ET JETABLE
const PG_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:54329/yziow_disposable_test_p26b';
process.env.DATABASE_URL = PG_URL;
process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key_disposable_p26b';
process.env.JWT_SECRET = 'test_secret_p26b_functional_validation_min_32_chars';
process.env.AI_QUOTA_HASH_SECRET = 'test_ai_quota_hash_secret_p26b_min_32_chars';
process.env.PASSWORD_RESET_OTP_SECRET = 'test_otp_secret_p26b_functional_min_32_chars';

// Vérification absolue : AUCUN accès à Supabase Production
if (process.env.SUPABASE_URL.includes('supabase.co')) {
    throw new Error('BLOCAGE_SECURITE: Supabase Production détecté dans SUPABASE_URL.');
}

const pool = new Pool({ connectionString: PG_URL });
const app = require('../server.js');
const { supabase } = require('../utils/supabase');

// Identifiants uniques pour ce run de test (isolation stricte)
const RUN_ID = `fn_${Date.now().toString(36)}`;
const SCHOOL_A = `ecole_fna_${RUN_ID}`;
const SCHOOL_B = `ecole_fnb_${RUN_ID}`;

const PARENT_A_ID = '11111111-1111-4111-8111-111111111111';
const PARENT_B_ID = '22222222-2222-4222-8222-222222222222';
const DIRECTOR_A_ID = '33333333-3333-4333-8333-333333333333';
const DIRECTOR_B_ID = '44444444-4444-4444-8444-444444444444';
const COMPTABLE_A_ID = '55555555-5555-4555-8555-555555555555';

const STUDENT_A1_ID = `std_a1_${RUN_ID}`;
const STUDENT_A2_ID = `std_a2_${RUN_ID}`;
const STUDENT_A3_ID = `std_a3_${RUN_ID}`;
const STUDENT_A4_ID = `std_a4_${RUN_ID}`;
const STUDENT_B1_ID = `std_b1_${RUN_ID}`;

let server;
let baseUrl;

function makeToken(payload) {
    return jwt.sign(
        { token_type: 'access', ...payload },
        process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '2h' }
    );
}

// Client HTTP natif pour tester le serveur Express réel
async function request(options) {
    const { method = 'GET', path, token, body } = options;
    const url = new URL(path, baseUrl);

    return new Promise((resolve, reject) => {
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const payload = body !== undefined ? JSON.stringify(body) : null;
        if (payload) {
            headers['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = http.request(url, { method, headers }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = data ? JSON.parse(data) : null;
                } catch {
                    parsed = data;
                }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: parsed
                });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

// Configuration des mocks Supabase connectés à la base PostgreSQL réelle jetable
function setupSupabaseAdapter(pgClient) {
    // 1. Adapter pour supabase.rpc
    supabase.rpc = async (rpcName, params) => {
        try {
            if (rpcName === 'approve_parent_student_link') {
                const res = await pgClient.query(
                    'SELECT public.approve_parent_student_link($1, $2, $3, $4) AS result;',
                    [params.p_request_id, params.p_school_slug, params.p_decided_by, params.p_decided_by_name || null]
                );
                return { data: res.rows[0]?.result, error: null };
            }
            if (rpcName === 'reject_parent_student_link') {
                const res = await pgClient.query(
                    'SELECT public.reject_parent_student_link($1, $2, $3, $4, $5, $6) AS result;',
                    [
                        params.p_request_id,
                        params.p_school_slug,
                        params.p_decided_by,
                        params.p_rejection_reason,
                        params.p_rejection_reason_code || 'OTHER',
                        params.p_decided_by_name || null
                    ]
                );
                return { data: res.rows[0]?.result, error: null };
            }
            if (rpcName === 'delete_student_local_atomically') {
                const res = await pgClient.query(
                    'SELECT public.delete_student_local_atomically($1, $2) AS result;',
                    [params.p_school_slug, params.p_student_id]
                );
                return { data: res.rows[0]?.result, error: null };
            }
            return { data: null, error: { message: `RPC inconnue: ${rpcName}` } };
        } catch (err) {
            return { data: null, error: err };
        }
    };

    // 2. Adapter minimal pour supabase.from sur tables réelles PostgreSQL
    const originalFrom = supabase.from.bind(supabase);
    supabase.from = (table) => {
        // Table parent_student_link_requests : requêtes réelles dans PostgreSQL
        if (table === 'parent_student_link_requests') {
            return {
                insert: (rows) => {
                    const row = Array.isArray(rows) ? rows[0] : rows;
                    return {
                        select: (cols) => ({
                            maybeSingle: async () => {
                                try {
                                    const res = await pgClient.query(
                                        `INSERT INTO public.parent_student_link_requests
                                         (school_slug, parent_id, student_id, parent_phone_normalized, parent_name, student_name, student_class, phone_matched, status, source)
                                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                                         RETURNING id, status;`,
                                        [
                                            row.school_slug,
                                            row.parent_id,
                                            row.student_id,
                                            row.parent_phone_normalized,
                                            row.parent_name,
                                            row.student_name,
                                            row.student_class,
                                            row.phone_matched,
                                            row.status,
                                            row.source
                                        ]
                                    );
                                    return { data: res.rows[0], error: null };
                                } catch (err) {
                                    return { data: null, error: err };
                                }
                            }
                        })
                    };
                },
                select: (cols, opts) => {
                    let whereClauses = [];
                    let values = [];
                    let orderBy = 'requested_at DESC';
                    let rangeLimit = 100;
                    let rangeOffset = 0;

                    const queryObj = {
                        eq: (col, val) => {
                            values.push(val);
                            whereClauses.push(`${col} = $${values.length}`);
                            return queryObj;
                        },
                        in: (col, valArray) => {
                            const placeholders = valArray.map((v) => {
                                values.push(v);
                                return `$${values.length}`;
                            }).join(', ');
                            whereClauses.push(`${col} IN (${placeholders})`);
                            return queryObj;
                        },
                        order: (col, { ascending = false } = {}) => {
                            orderBy = `${col} ${ascending ? 'ASC' : 'DESC'}`;
                            return queryObj;
                        },
                        range: (from, to) => {
                            rangeOffset = from;
                            rangeLimit = to - from + 1;
                            return queryObj;
                        },
                        single: async () => {
                            const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
                            const sql = `SELECT ${cols} FROM public.parent_student_link_requests ${whereStr} LIMIT 1;`;
                            try {
                                const res = await pgClient.query(sql, values);
                                if (res.rows.length === 0) {
                                    return { data: null, error: { code: 'PGRST116', message: 'The result contains 0 rows' } };
                                }
                                return { data: res.rows[0], error: null };
                            } catch (err) {
                                return { data: null, error: err };
                            }
                        },
                        maybeSingle: async () => {
                            const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
                            const sql = `SELECT ${cols} FROM public.parent_student_link_requests ${whereStr} LIMIT 1;`;
                            try {
                                const res = await pgClient.query(sql, values);
                                return { data: res.rows[0] || null, error: null };
                            } catch (err) {
                                return { data: null, error: err };
                            }
                        },
                        then: async (resolve) => {
                            try {
                                if (opts?.head && opts?.count === 'exact') {
                                    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
                                    const countSql = `SELECT count(*)::int as count FROM public.parent_student_link_requests ${whereStr};`;
                                    const countRes = await pgClient.query(countSql, values);
                                    return resolve({ count: countRes.rows[0]?.count || 0, error: null });
                                }
                                const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
                                const sql = `SELECT ${cols} FROM public.parent_student_link_requests ${whereStr} ORDER BY ${orderBy} LIMIT ${rangeLimit} OFFSET ${rangeOffset};`;
                                const res = await pgClient.query(sql, values);
                                return resolve({ data: res.rows, error: null });
                            } catch (err) {
                                return resolve({ data: null, error: err });
                            }
                        }
                    };
                    return queryObj;
                }
            };
        }

        // Tables d'école locales : profiles_..., students_..., parent_student_...
        if (table.startsWith('profiles_') || table.startsWith('students_') || table.startsWith('parent_student_')) {
            return {
                select: (cols) => {
                    let whereClauses = [];
                    let values = [];

                    const queryObj = {
                        eq: (col, val) => {
                            values.push(val);
                            whereClauses.push(`${col} = $${values.length}`);
                            return queryObj;
                        },
                        in: (col, valArray) => {
                            const placeholders = valArray.map((v) => {
                                values.push(v);
                                return `$${values.length}`;
                            }).join(', ');
                            whereClauses.push(`${col} IN (${placeholders})`);
                            return queryObj;
                        },
                        ilike: (col, pattern) => {
                            values.push(pattern);
                            whereClauses.push(`${col} ILIKE $${values.length}`);
                            return queryObj;
                        },
                        or: (filterStr) => {
                            const match = filterStr.match(/ilike\.%([^%]+)%/);
                            const val = match ? `%${match[1]}%` : '%';
                            values.push(val);
                            whereClauses.push(`(nom ILIKE $${values.length} OR prenom ILIKE $${values.length})`);
                            return queryObj;
                        },
                        order: () => queryObj,
                        limit: () => queryObj,
                        maybeSingle: async () => {
                            const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
                            const sql = `SELECT ${cols} FROM public.${table} ${whereStr} LIMIT 1;`;
                            try {
                                const res = await pgClient.query(sql, values);
                                return { data: res.rows[0] || null, error: null };
                            } catch (err) {
                                return { data: null, error: err };
                            }
                        },
                        then: async (resolve) => {
                            const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
                            const sql = `SELECT ${cols} FROM public.${table} ${whereStr};`;
                            try {
                                const res = await pgClient.query(sql, values);
                                console.log('DEBUG_ADAPTER_QUERY:', table, sql, values, 'ROWS:', res.rows.length);
                                return resolve({ data: res.rows, error: null });
                            } catch (err) {
                                console.error('DEBUG_ADAPTER_ERR:', err.message);
                                return resolve({ data: null, error: err });
                            }
                        }
                    };
                    return queryObj;
                }
            };
        }

        // Table schools : enrichissement du nom d'établissement
        if (table === 'schools') {
            return {
                select: (cols) => ({
                    in: (col, slugs) => ({
                        then: (resolve) => {
                            const mockSchools = [
                                { slug: SCHOOL_A, name: 'École Primaire Test A' },
                                { slug: SCHOOL_B, name: 'Collège Privé Test B' }
                            ].filter(s => slugs.includes(s.slug));
                            resolve({ data: mockSchools, error: null });
                        }
                    })
                })
            };
        }

        return originalFrom(table);
    };
}

test('YZIOW P26-B — Validation Fonctionnelle Complète Parent-Directeur', async (t) => {
    let pgClient;

    // A. VÉRIFICATION PRÉALABLE ET INITIALISATION DU BANC LOCAL
    await t.test('0. Vérification préalable de l’environnement local jetable', async () => {
        pgClient = await pool.connect();
        const res = await pgClient.query('SELECT current_database(), current_user;');
        assert.equal(res.rows[0].current_database, 'yziow_disposable_test_p26b');
        assert.equal(res.rows[0].current_user, 'postgres');

        // Initialisation de l'adaptateur pour brancher Express sur la vraie base
        setupSupabaseAdapter(pgClient);

        // Démarrage du serveur HTTP Express réel sur un port éphémère
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        assert.ok(port > 0, 'Le serveur de validation HTTP doit être démarré.');

        // Création des tables locales isolées pour les écoles de test A et B
        await pgClient.query(`
            -- ÉCOLE A
            CREATE TABLE IF NOT EXISTS public.profiles_${SCHOOL_A} (
                id UUID PRIMARY KEY,
                nom TEXT,
                telephone TEXT,
                phone_normalized TEXT,
                role TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS public.students_${SCHOOL_A} (
                id TEXT PRIMARY KEY,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                classe TEXT NOT NULL,
                telephone_parent TEXT,
                telephone_parent_normalized TEXT
            );
            CREATE TABLE IF NOT EXISTS public.parent_student_${SCHOOL_A} (
                parent_id UUID NOT NULL,
                student_id TEXT NOT NULL,
                source_request_id UUID,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (parent_id, student_id)
            );

            -- ÉCOLE B
            CREATE TABLE IF NOT EXISTS public.profiles_${SCHOOL_B} (
                id UUID PRIMARY KEY,
                nom TEXT,
                telephone TEXT,
                phone_normalized TEXT,
                role TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS public.students_${SCHOOL_B} (
                id TEXT PRIMARY KEY,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                classe TEXT NOT NULL,
                telephone_parent TEXT,
                telephone_parent_normalized TEXT
            );
            CREATE TABLE IF NOT EXISTS public.parent_student_${SCHOOL_B} (
                parent_id UUID NOT NULL,
                student_id TEXT NOT NULL,
                source_request_id UUID,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (parent_id, student_id)
            );

            -- Insertion des profils et élèves de test
            INSERT INTO public.profiles_${SCHOOL_A} (id, nom, telephone, phone_normalized, role) VALUES
                ('${PARENT_A_ID}', 'Parent A', '+2290197000001', '+2290197000001', 'parent'),
                ('${PARENT_B_ID}', 'Parent B', '+2290197000002', '+2290197000002', 'parent'),
                ('${DIRECTOR_A_ID}', 'Directeur A', '+2290197000003', '+2290197000003', 'directeur'),
                ('${COMPTABLE_A_ID}', 'Comptable A', '+2290197000004', '+2290197000004', 'comptable');

            INSERT INTO public.students_${SCHOOL_A} (id, nom, prenom, classe, telephone_parent, telephone_parent_normalized) VALUES
                ('${STUDENT_A1_ID}', 'Dupont', 'Amine', 'CM2', '+2290197000001', '+2290197000001'),
                ('${STUDENT_A2_ID}', 'Dupont', 'Sophie', 'CE1', '+2290197000001', '+2290197000001'),
                ('${STUDENT_A3_ID}', 'Dupont', 'Lucas', 'CP', '+2290197000001', '+2290197000001'),
                ('${STUDENT_A4_ID}', 'Dupont', 'Lea', 'Maternelle', '+2290197000001', '+2290197000001');

            INSERT INTO public.profiles_${SCHOOL_B} (id, nom, telephone, phone_normalized, role) VALUES
                ('${PARENT_A_ID}', 'Parent A', '+2290197000001', '+2290197000001', 'parent'),
                ('${DIRECTOR_B_ID}', 'Directeur B', '+2290197000005', '+2290197000005', 'directeur');

            INSERT INTO public.students_${SCHOOL_B} (id, nom, prenom, classe, telephone_parent, telephone_parent_normalized) VALUES
                ('${STUDENT_B1_ID}', 'Dupont', 'Marc', '6ème', '+2290197000001', '+2290197000001');
        `);
    });

    let requestA1Id = null;
    let requestA2Id = null;

    // Tokens JWT d'authentification
    const tokenParentA = makeToken({ id: PARENT_A_ID, role: 'parent', schoolSlug: SCHOOL_A, telephone: '+2290197000001' });
    const tokenParentB = makeToken({ id: PARENT_B_ID, role: 'parent', schoolSlug: SCHOOL_A, telephone: '+2290197000002' });
    const tokenDirectorA = makeToken({ id: DIRECTOR_A_ID, role: 'directeur', schoolSlug: SCHOOL_A });
    const tokenDirectorB = makeToken({ id: DIRECTOR_B_ID, role: 'directeur', schoolSlug: SCHOOL_B });
    const tokenComptableA = makeToken({ id: COMPTABLE_A_ID, role: 'comptable', schoolSlug: SCHOOL_A });

    // ========================================================================
    // SCÉNARIO A : SOUMISSION PARENT
    // ========================================================================
    await t.test('A. Soumission parent — Recherche, envoi, HTTP 202, isolation et suivi', async () => {
        // A.1 Recherche d'élève :
        // Un parent sans enfant lié est strictement confiné (0 élève retourné pour protéger la vie privée scolaire)
        const parentSearchRes = await request({
            method: 'GET',
            path: '/api/students?nom=Dupont',
            token: tokenParentA
        });
        assert.equal(parentSearchRes.status, 200);
        assert.equal(parentSearchRes.body.students.length, 0, 'Un parent sans lien actif ne peut pas scraper la base');

        // La direction peut lister et rechercher l'élève
        const dirSearchRes = await request({
            method: 'GET',
            path: '/api/students?nom=Dupont',
            token: tokenDirectorA
        });
        assert.equal(dirSearchRes.status, 200);
        assert.ok(dirSearchRes.body.students.length >= 4, 'La direction retrouve bien les élèves de l\'école');

        // A.2 Soumission de demande de rattachement pour Élève A1
        const submitRes = await request({
            method: 'POST',
            path: '/api/students/link',
            token: tokenParentA,
            body: { studentId: STUDENT_A1_ID }
        });

        // A.3 Vérification HTTP 202 avec status: 'pending'
        assert.equal(submitRes.status, 202, 'La soumission doit retourner HTTP 202');
        assert.equal(submitRes.body.status, 'pending');
        assert.equal(submitRes.body.created, 1);
        assert.match(submitRes.body.message, /transmise à la direction/i);

        // A.4 Vérification dans la base : aucun lien créé avant approbation
        const linkCheck = await pgClient.query(
            `SELECT * FROM public.parent_student_${SCHOOL_A} WHERE parent_id = $1 AND student_id = $2;`,
            [PARENT_A_ID, STUDENT_A1_ID]
        );
        assert.equal(linkCheck.rows.length, 0, 'L\'élève ne doit pas être rattaché avant l\'approbation formelle');

        // A.5 Vérification dans « Mes demandes de rattachement »
        const listRes = await request({
            method: 'GET',
            path: '/api/parent/link-requests',
            token: tokenParentA
        });
        assert.equal(listRes.status, 200);
        assert.equal(listRes.body.total, 1);
        assert.equal(listRes.body.requests[0].student_name, 'Amine Dupont');
        assert.equal(listRes.body.requests[0].status, 'pending');
        assert.equal(listRes.body.requests[0].school_name, 'École Primaire Test A');

        requestA1Id = listRes.body.requests[0].id;
        assert.ok(requestA1Id, 'La demande doit posséder un UUID');
    });

    // ========================================================================
    // SCÉNARIO B : TRAITEMENT DIRECTEUR
    // ========================================================================
    await t.test('B. Traitement directeur — Consultation, approbation, rejet avec motif, anti-doublon décision', async () => {
        // B.1 Consultation des demandes en attente par Directeur A
        const dirListRes = await request({
            method: 'GET',
            path: '/api/director/requests',
            token: tokenDirectorA
        });
        assert.equal(dirListRes.status, 200);
        assert.equal(dirListRes.body.total, 1);
        assert.equal(dirListRes.body.requests[0].id, requestA1Id);
        assert.equal(dirListRes.body.requests[0].student_name, 'Amine Dupont');

        // B.2 Approbation de la demande A1
        const approveRes = await request({
            method: 'POST',
            path: `/api/director/requests/${requestA1Id}/approve`,
            token: tokenDirectorA,
            body: {}
        });
        assert.equal(approveRes.status, 200);
        assert.equal(approveRes.body.success, true);
        assert.equal(approveRes.body.status, 'approved');

        // B.3 Soumission d'une seconde demande (Élève A2) par le Parent
        const submit2Res = await request({
            method: 'POST',
            path: '/api/students/link',
            token: tokenParentA,
            body: { studentId: STUDENT_A2_ID }
        });
        assert.equal(submit2Res.status, 202);

        // Récupération de l'identifiant de la demande A2
        const list2Res = await request({
            method: 'GET',
            path: '/api/parent/link-requests',
            token: tokenParentA
        });
        const req2 = list2Res.body.requests.find(r => r.student_name === 'Sophie Dupont');
        assert.ok(req2);
        requestA2Id = req2.id;

        // B.4 Tentative de rejet SANS motif obligatoire -> Rejet HTTP 400
        const rejectEmptyRes = await request({
            method: 'POST',
            path: `/api/director/requests/${requestA2Id}/reject`,
            token: tokenDirectorA,
            body: { rejection_reason: '   ' }
        });
        assert.equal(rejectEmptyRes.status, 400);
        assert.match(rejectEmptyRes.body.error, /rejection_reason/i);

        // B.5 Rejet AVEC un motif valide
        const rejectValidRes = await request({
            method: 'POST',
            path: `/api/director/requests/${requestA2Id}/reject`,
            token: tokenDirectorA,
            body: {
                rejection_reason: 'Justificatif de filiation manquant dans le dossier',
                rejection_reason_code: 'IDENTITY_MISMATCH'
            }
        });
        assert.equal(rejectValidRes.status, 200);
        assert.equal(rejectValidRes.body.success, true);
        assert.equal(rejectValidRes.body.status, 'rejected');

        // B.6 Les demandes traitées (A1 approuvée et A2 rejetée) quittent la file d'attente
        const dirListAfterRes = await request({
            method: 'GET',
            path: '/api/director/requests',
            token: tokenDirectorA
        });
        assert.equal(dirListAfterRes.status, 200);
        assert.equal(dirListAfterRes.body.total, 0, 'Les demandes traitées doivent quitter la file d\'attente');

        // B.7 Tentative de seconde décision incompatible sur la demande approuvée -> HTTP 409
        const doubleDecisionRes = await request({
            method: 'POST',
            path: `/api/director/requests/${requestA1Id}/reject`,
            token: tokenDirectorA,
            body: { rejection_reason: 'Rejet tardif impossible' }
        });
        assert.equal(doubleDecisionRes.status, 409);
        assert.equal(doubleDecisionRes.body.error, 'INVALID_STATUS_TRANSITION');
        assert.equal(doubleDecisionRes.body.current_status, 'approved');
    });

    // ========================================================================
    // SCÉNARIO C : RETOUR CÔTÉ PARENT
    // ========================================================================
    await t.test('C. Retour côté parent — Statuts approved / rejected, motif et étanchéité', async () => {
        const parentRequestsRes = await request({
            method: 'GET',
            path: '/api/parent/link-requests',
            token: tokenParentA
        });
        assert.equal(parentRequestsRes.status, 200);
        assert.equal(parentRequestsRes.body.total, 2);

        const approvedReq = parentRequestsRes.body.requests.find(r => r.id === requestA1Id);
        const rejectedReq = parentRequestsRes.body.requests.find(r => r.id === requestA2Id);

        // C.1 Demande 1 affiche 'approved'
        assert.equal(approvedReq.status, 'approved');
        assert.ok(approvedReq.decided_at);

        // C.2 L'enfant approuvé est effectif dans la table locale de l'école
        const approvedDbCheck = await pgClient.query(
            `SELECT * FROM public.parent_student_${SCHOOL_A} WHERE parent_id = $1 AND student_id = $2;`,
            [PARENT_A_ID, STUDENT_A1_ID]
        );
        assert.equal(approvedDbCheck.rows.length, 1, 'L\'enfant approuvé doit être inséré dans la table locale');

        // C.3 Demande 2 affiche 'rejected' avec son motif autorisé
        assert.equal(rejectedReq.status, 'rejected');
        assert.equal(rejectedReq.rejection_reason, 'Justificatif de filiation manquant dans le dossier');

        // C.4 L'enfant rejeté n'ouvre aucun accès dans la table locale
        const rejectedDbCheck = await pgClient.query(
            `SELECT * FROM public.parent_student_${SCHOOL_A} WHERE parent_id = $1 AND student_id = $2;`,
            [PARENT_A_ID, STUDENT_A2_ID]
        );
        assert.equal(rejectedDbCheck.rows.length, 0, 'Un rejet n\'ouvre aucun accès scolaire');
    });

    // ========================================================================
    // SCÉNARIO D : SÉCURITÉ
    // ========================================================================
    await t.test('D. Sécurité — Cloisonnement parents, écoles, rôles et absence de fuite SQL', async () => {
        // D.1 Cloisonnement parent : Parent B ne voit AUCUNE demande de Parent A
        const parentBRes = await request({
            method: 'GET',
            path: '/api/parent/link-requests',
            token: tokenParentB
        });
        assert.equal(parentBRes.status, 200);
        assert.equal(parentBRes.body.total, 0, 'Parent B ne doit pas voir les demandes de Parent A');

        // D.2 Cloisonnement directeur : Directeur B ne voit AUCUNE demande de l'école A
        const directorBListRes = await request({
            method: 'GET',
            path: '/api/director/requests',
            token: tokenDirectorB
        });
        assert.equal(directorBListRes.status, 200);
        assert.equal(directorBListRes.body.total, 0, 'Directeur B ne doit voir aucune demande d\'une autre école');

        // D.3 Directeur B tente d'approuver une demande de l'école A -> Rejet HTTP 404
        const crossSchoolApproveRes = await request({
            method: 'POST',
            path: `/api/director/requests/${requestA1Id}/approve`,
            token: tokenDirectorB,
            body: {}
        });
        assert.equal(crossSchoolApproveRes.status, 404);

        // D.4 Rôle non autorisé : Comptable tente d'approuver -> Rejet HTTP 403
        const comptableApproveRes = await request({
            method: 'POST',
            path: `/api/director/requests/${requestA1Id}/approve`,
            token: tokenComptableA,
            body: {}
        });
        assert.equal(comptableApproveRes.status, 403);
        assert.match(comptableApproveRes.body.error, /Permission refusée/i);

        // D.5 Tentative d'usurpation d'identité : Parent tente de forcer un autre parentId -> Rejet HTTP 403
        const spoofingRes = await request({
            method: 'POST',
            path: '/api/students/link',
            token: tokenParentA,
            body: {
                studentId: STUDENT_A3_ID,
                parentId: PARENT_B_ID
            }
        });
        assert.equal(spoofingRes.status, 403);
        assert.match(spoofingRes.body.error, /Usurpation d'identité interdite/i);

        // D.6 Absence de fuite SQL sur UUID malformé
        const malformedUuidRes = await request({
            method: 'POST',
            path: '/api/director/requests/invalid-uuid-1234/approve',
            token: tokenDirectorA,
            body: {}
        });
        assert.equal(malformedUuidRes.status, 400);
        assert.match(malformedUuidRes.body.error, /invalide/i);
        assert.equal(typeof malformedUuidRes.body.stack, 'undefined', 'Aucune trace SQL interne ne doit fuiter');
    });

    // ========================================================================
    // SCÉNARIO E : CAS PARTICULIERS
    // ========================================================================
    await t.test('E. Cas particuliers — Multi-enfants, multi-écoles, anti-doublon pending, ré-application après rejet', async () => {
        // E.1 Plusieurs enfants pour un même parent (liaison groupée de 2 enfants)
        const multiStudentsRes = await request({
            method: 'POST',
            path: '/api/students/link',
            token: tokenParentA,
            body: { studentIds: [STUDENT_A3_ID, STUDENT_A4_ID] }
        });
        assert.equal(multiStudentsRes.status, 202);
        assert.equal(multiStudentsRes.body.created, 2, '2 demandes doivent être créées');

        // E.2 Demande déjà en attente : Resoumission pour Élève A3 -> HTTP 202 alreadyPending: 1, created: 0
        const alreadyPendingRes = await request({
            method: 'POST',
            path: '/api/students/link',
            token: tokenParentA,
            body: { studentId: STUDENT_A3_ID }
        });
        assert.equal(alreadyPendingRes.status, 202);
        assert.equal(alreadyPendingRes.body.created, 0);
        assert.equal(alreadyPendingRes.body.alreadyPending, 1);

        // E.3 Demande déjà approuvée : Resoumission pour Élève A1 (déjà rattaché) -> HTTP 200 already_linked
        const alreadyLinkedRes = await request({
            method: 'POST',
            path: '/api/students/link',
            token: tokenParentA,
            body: { studentId: STUDENT_A1_ID }
        });
        assert.equal(alreadyLinkedRes.status, 200);
        assert.equal(alreadyLinkedRes.body.status, 'already_linked');
        assert.equal(alreadyLinkedRes.body.alreadyLinked, 1);

        // E.4 Nouvelle demande après un rejet : Élève A2 avait été rejeté. Le parent peut resoumettre une nouvelle demande valide.
        const resubmitAfterRejectRes = await request({
            method: 'POST',
            path: '/api/students/link',
            token: tokenParentA,
            body: { studentId: STUDENT_A2_ID }
        });
        assert.equal(resubmitAfterRejectRes.status, 202);
        assert.equal(resubmitAfterRejectRes.body.created, 1, 'Une nouvelle demande doit être acceptée après un rejet');

        // E.5 Multi-établissements : Demande soumise dans l'école B
        const tokenParentAInSchoolB = makeToken({ id: PARENT_A_ID, role: 'parent', schoolSlug: SCHOOL_B, telephone: '+2290197000001' });
        const schoolBSubmitRes = await request({
            method: 'POST',
            path: '/api/students/link',
            token: tokenParentAInSchoolB,
            body: { studentId: STUDENT_B1_ID }
        });
        assert.equal(schoolBSubmitRes.status, 202);

        // Consultation de « Mes demandes » par Parent A : voit les demandes de l'école A ET de l'école B
        const globalRequestsRes = await request({
            method: 'GET',
            path: '/api/parent/link-requests',
            token: tokenParentA
        });
        assert.equal(globalRequestsRes.status, 200);
        const slugs = globalRequestsRes.body.requests.map(r => r.school_slug);
        assert.ok(slugs.includes(SCHOOL_A), 'Doit contenir les demandes de l\'école A');
        assert.ok(slugs.includes(SCHOOL_B), 'Doit contenir les demandes de l\'école B');

        // E.6 Double clic / Requêtes simultanées d'approbation sur la même demande
        const reqToDoubleApprove = globalRequestsRes.body.requests.find(r => r.student_name === 'Lucas Dupont');
        assert.ok(reqToDoubleApprove, 'La demande de Lucas Dupont doit être présente');

        const [res1, res2] = await Promise.all([
            request({
                method: 'POST',
                path: `/api/director/requests/${reqToDoubleApprove.id}/approve`,
                token: tokenDirectorA,
                body: {}
            }),
            request({
                method: 'POST',
                path: `/api/director/requests/${reqToDoubleApprove.id}/approve`,
                token: tokenDirectorA,
                body: {}
            })
        ]);

        // L'une des deux gagne (200), la seconde est idempotente ou refuse (200 already_approved ou 409)
        const statuses = [res1.status, res2.status].sort();
        assert.ok(
            (statuses[0] === 200 && statuses[1] === 200) || (statuses[0] === 200 && statuses[1] === 409),
            `Double soumission protégée (statuts reçus: ${res1.status}, ${res2.status})`
        );
    });

    // NETTOYAGE STRICT DE L'ENVIRONNEMENT JETABLE
    test.after(async () => {
        try {
            if (pgClient) {
                await pgClient.query(`
                    DELETE FROM public.parent_student_link_requests WHERE school_slug IN ('${SCHOOL_A}', '${SCHOOL_B}');
                    DROP TABLE IF EXISTS public.parent_student_${SCHOOL_A};
                    DROP TABLE IF EXISTS public.students_${SCHOOL_A};
                    DROP TABLE IF EXISTS public.profiles_${SCHOOL_A};
                    DROP TABLE IF EXISTS public.parent_student_${SCHOOL_B};
                    DROP TABLE IF EXISTS public.students_${SCHOOL_B};
                    DROP TABLE IF EXISTS public.profiles_${SCHOOL_B};
                `);
                pgClient.release();
            }
            if (server) {
                if (typeof server.closeAllConnections === 'function') {
                    server.closeAllConnections();
                }
                await new Promise((resolve) => server.close(resolve));
            }
            await pool.end();
        } catch (e) {
            console.error('Erreur nettoyage banc:', e.message);
        }
    });
});
