const test = require('node:test');
const assert = require('node:assert');

// Injection variables d'environnement avant import pour CI
process.env.SUPABASE_URL = 'http://localhost:8000';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-key';
process.env.JWT_SECRET = 'dummy-secret';

// Stub Supabase avant de charger le controleur
const supabaseModule = require('../utils/supabase');
const supabaseStub = {
    from: () => supabaseStub,
    select: () => supabaseStub,
    eq: () => supabaseStub,
    maybeSingle: () => supabaseStub
};
supabaseModule.supabase = supabaseStub;

const parentController = require('../controllers/parentController');

test('P25-T.3 Global Portfolio - Auth requise', async (t) => {
    const req = { user: {} };
    const res = {
        status: (code) => {
            res.statusCode = code;
            return res;
        },
        json: (data) => {
            res.data = data;
        },
        set: () => {}
    };

    await parentController.getGlobalPortfolio(req, res);
    assert.strictEqual(res.statusCode, 401);
});

test('P25-T.3 Global Portfolio - Parent isolé et déduplication', async (t) => {
    // Inject malicious body/query to test isolation
    const req = { user: { id: 'parent-123' }, body: { parent_ref: 'parent-HACK' }, query: { parent_ref: 'parent-HACK' } };
    const res = {
        status: () => res,
        json: (data) => { res.data = data; },
        set: (key, val) => { res.headers = res.headers || {}; res.headers[key] = val; }
    };

    let calledParentRef = null;

    supabaseStub.from = (table) => {
        const query = {
            select: () => query,
            eq: (col, val) => {
                query.table = table;
                if (table === 'parent_child_links') {
                    if (col === 'parent_ref') calledParentRef = val;
                    return Promise.resolve({
                        data: [
                            { student_global_id: 'global-1' },
                            { student_global_id: 'global-1' },
                            { student_global_id: 'global-2' }
                        ],
                        error: null
                    });
                }
                if (table === 'student_global_mappings') {
                    if (val === 'global-1') {
                        return Promise.resolve({
                            data: [
                                { school_slug: 'ecolea', student_local_id: 'local-1' },
                                { school_slug: 'ecoleb', student_local_id: 'local-2' }
                            ], error: null
                        });
                    }
                    if (val === 'global-2') {
                        return Promise.resolve({
                            data: [
                                { school_slug: 'ecolec', student_local_id: 'local-3' }
                            ], error: null
                        });
                    }
                }
                return query;
            },
            maybeSingle: () => {
                if (query.table === 'students_ecolea') {
                    return Promise.resolve({ data: { nom: 'DUPONT', prenom: 'Jean', date_naissance: '2015-05-10' }, error: null });
                }
                if (query.table === 'students_ecoleb') {
                    return Promise.resolve({ data: { nom: 'dupont ', prenom: 'JEAN', date_naissance: '10/05/2015' }, error: null });
                }
                if (query.table === 'students_ecolec') {
                    return Promise.resolve({ data: null, error: null });
                }
                return Promise.resolve({ data: null, error: null });
            }
        };
        return query;
    };

    await parentController.getGlobalPortfolio(req, res);

    assert.strictEqual(calledParentRef, 'parent-123');
    assert.strictEqual(res.headers['Cache-Control'], 'no-store');
    assert.strictEqual(res.data.children.length, 1);
    assert.strictEqual(res.data.children[0].student_global_id, 'global-1');
    assert.strictEqual(res.data.children[0].display_name, 'Jean DUPONT');
});

test('P25-T.3 Global Portfolio - Historique contradictoire exclu', async (t) => {
    const req = { user: { id: 'parent-123' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => {
        const query = {
            select: () => query,
            eq: (col, val) => {
                query.table = table;
                if (table === 'parent_child_links') return Promise.resolve({ data: [{ student_global_id: 'global-conflict' }], error: null });
                if (table === 'student_global_mappings') return Promise.resolve({
                    data: [{ school_slug: 'ecolea', student_local_id: 'l1' }, { school_slug: 'ecoleb', student_local_id: 'l2' }], error: null
                });
                return query;
            },
            maybeSingle: () => {
                if (query.table === 'students_ecolea') return Promise.resolve({ data: { nom: 'DUPONT', prenom: 'Jean', date_naissance: '2015-05-10' }, error: null });
                if (query.table === 'students_ecoleb') return Promise.resolve({ data: { nom: 'DUPONT', prenom: 'Paul', date_naissance: '2015-05-10' }, error: null });
                return Promise.resolve({ data: null, error: null });
            }
        };
        return query;
    };

    await parentController.getGlobalPortfolio(req, res);
    assert.strictEqual(res.data.children.length, 0);
});

test('P25-T.3 Global Portfolio - DOB manquant et invalide exclus', async (t) => {
    const req = { user: { id: 'parent-123' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => {
        const query = {
            select: () => query,
            eq: (col, val) => {
                query.table = table;
                if (table === 'parent_child_links') return Promise.resolve({ data: [{ student_global_id: 'global-nodob' }, { student_global_id: 'global-baddob' }], error: null });
                if (table === 'student_global_mappings') {
                    if (val === 'global-nodob') return Promise.resolve({ data: [{ school_slug: 'ecolea', student_local_id: 'l1' }], error: null });
                    if (val === 'global-baddob') return Promise.resolve({ data: [{ school_slug: 'ecoleb', student_local_id: 'l2' }], error: null });
                }
                return query;
            },
            maybeSingle: () => {
                if (query.table === 'students_ecolea') return Promise.resolve({ data: { nom: 'DUPONT', prenom: 'Jean', date_naissance: null }, error: null });
                if (query.table === 'students_ecoleb') return Promise.resolve({ data: { nom: 'DUPONT', prenom: 'Paul', date_naissance: 'not-a-date' }, error: null });
                return Promise.resolve({ data: null, error: null });
            }
        };
        return query;
    };

    await parentController.getGlobalPortfolio(req, res);
    assert.strictEqual(res.data.children.length, 0);
});

test('P25-T.3 Global Portfolio - Slug invalide ignoré', async (t) => {
    const req = { user: { id: 'parent-123' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };
    let invalidSlugQueried = false;

    supabaseStub.from = (table) => {
        if (table.includes('../../evil')) invalidSlugQueried = true;
        const query = {
            select: () => query,
            eq: (col, val) => {
                query.table = table;
                if (table === 'parent_child_links') return Promise.resolve({ data: [{ student_global_id: 'global-evil' }], error: null });
                if (table === 'student_global_mappings') return Promise.resolve({ data: [{ school_slug: '../../evil', student_local_id: 'l1' }], error: null });
                return query;
            },
            maybeSingle: () => Promise.resolve({ data: null, error: null })
        };
        return query;
    };

    await parentController.getGlobalPortfolio(req, res);
    assert.strictEqual(invalidSlugQueried, false);
    assert.strictEqual(res.data.children.length, 0);
});

test('P25-T.3 Global Portfolio - Empty portfolio', async (t) => {
    const req = { user: { id: 'parent-123' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => ({
        select: () => ({
            eq: () => {
                if (table === 'parent_child_links') return Promise.resolve({ data: [], error: null });
            }
        })
    });

    await parentController.getGlobalPortfolio(req, res);
    assert.deepStrictEqual(res.data, { children: [] });
});

test('P25-T.3 Global Portfolio - Erreur DB initiale parent_child_links', async (t) => {
    const req = { user: { id: 'parent-123' } };
    const res = { status: (code) => { res.statusCode = code; return res; }, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = () => ({
        select: () => ({
            eq: () => Promise.resolve({ data: null, error: new Error('DB DOWN') })
        })
    });

    await parentController.getGlobalPortfolio(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.data, { error: 'Erreur serveur.' });
});

test('P25-T.3 Global Portfolio - Erreur DB mappings', async (t) => {
    const req = { user: { id: 'parent-123' } };
    const res = { status: (code) => { res.statusCode = code; return res; }, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => ({
        select: () => ({
            eq: () => {
                if (table === 'parent_child_links') return Promise.resolve({ data: [{ student_global_id: 'g1' }], error: null });
                if (table === 'student_global_mappings') return Promise.resolve({ data: null, error: new Error('DB DOWN MAPPINGS') });
            }
        })
    });

    await parentController.getGlobalPortfolio(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.data, { error: 'Erreur serveur.' });
});

test('P25-T.3 Global Portfolio - Erreur DB historique hsErr', async (t) => {
    const req = { user: { id: 'parent-123' } };
    const res = { status: (code) => { res.statusCode = code; return res; }, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => {
        const query = {
            select: () => query,
            eq: (col, val) => {
                query.table = table;
                if (table === 'parent_child_links') return Promise.resolve({ data: [{ student_global_id: 'g1' }], error: null });
                if (table === 'student_global_mappings') return Promise.resolve({ data: [{ school_slug: 'ecolea', student_local_id: 'l1' }], error: null });
                return query;
            },
            maybeSingle: () => {
                if (query.table === 'students_ecolea') return Promise.resolve({ data: null, error: new Error('DB DOWN HIST') });
                return Promise.resolve({ data: null, error: null });
            }
        };
        return query;
    };

    await parentController.getGlobalPortfolio(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.data, { error: 'Erreur serveur.' });
});
