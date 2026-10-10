const test = require('node:test');
const assert = require('node:assert');

// Injection variables d'environnement avant import pour CI
process.env.SUPABASE_URL = 'http://localhost:8000';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-key';
process.env.JWT_SECRET = 'dummy-secret';

// Stub Supabase avant de charger le controleur
const supabaseModule = require('../utils/supabase');

/**
 * Helper de mock Supabase chainable et compatible Promise (Thenable)
 */
function createMockQuery(handler) {
    const builder = {
        select: () => builder,
        eq: (col, val) => {
            builder.eqFilters = builder.eqFilters || {};
            builder.eqFilters[col] = val;
            return builder;
        },
        in: (col, vals) => {
            builder.inFilters = builder.inFilters || {};
            builder.inFilters[col] = vals;
            return builder;
        },
        maybeSingle: () => {
            builder.isMaybeSingle = true;
            return builder;
        },
        then: (resolve, reject) => {
            try {
                const res = handler(builder);
                return Promise.resolve(res).then(resolve, reject);
            } catch (err) {
                return Promise.reject(err).catch(reject);
            }
        }
    };
    return builder;
}

const supabaseStub = {
    from: () => createMockQuery(() => ({ data: [], error: null })),
    rpc: () => Promise.resolve({ data: [], error: null })
};
supabaseModule.supabase = supabaseStub;

const parentController = require('../controllers/parentController');
const parentPackService = require('../services/parentPackService');

// ── Tests P25-T.3 existants (préservés et enrichis) ──────────────────

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
    const req = { user: { id: 'parent-123' }, body: { parent_ref: 'parent-HACK' }, query: { parent_ref: 'parent-HACK' } };
    const res = {
        status: () => res,
        json: (data) => { res.data = data; },
        set: (key, val) => { res.headers = res.headers || {}; res.headers[key] = val; }
    };

    let calledParentRef = null;

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') {
            if (q.eqFilters && q.eqFilters['parent_ref']) {
                calledParentRef = q.eqFilters['parent_ref'];
            }
            return {
                data: [
                    { student_global_id: 'global-1', first_linked_at: new Date().toISOString() },
                    { student_global_id: 'global-1', first_linked_at: new Date().toISOString() },
                    { student_global_id: 'global-2', first_linked_at: new Date().toISOString() }
                ],
                error: null
            };
        }
        if (table === 'student_global_mappings') {
            const gid = q.eqFilters?.['student_global_id'];
            if (gid === 'global-1') {
                return {
                    data: [
                        { school_slug: 'ecolea', student_local_id: 'local-1' },
                        { school_slug: 'ecoleb', student_local_id: 'local-2' }
                    ],
                    error: null
                };
            }
            if (gid === 'global-2') {
                return {
                    data: [
                        { school_slug: 'ecolec', student_local_id: 'local-3' }
                    ],
                    error: null
                };
            }
        }
        if (table === 'schools') {
            return {
                data: [
                    { slug: 'ecolea', name: 'École A Pasteur' },
                    { slug: 'ecoleb', name: 'École B Hugo' }
                ],
                error: null
            };
        }
        if (table === 'students_ecolea') {
            return { data: { nom: 'DUPONT', prenom: 'Jean', date_naissance: '2015-05-10' }, error: null };
        }
        if (table === 'students_ecoleb') {
            return { data: { nom: 'dupont ', prenom: 'JEAN', date_naissance: '10/05/2015' }, error: null };
        }
        if (table === 'students_ecolec') {
            return { data: null, error: null };
        }
        return { data: null, error: null };
    });

    supabaseStub.rpc = (fn) => {
        if (fn === 'get_active_parent_pack_subscriptions') {
            return Promise.resolve({ data: [{ student_global_id: 'global-1' }], error: null });
        }
        return Promise.resolve({ data: [], error: null });
    };

    await parentController.getGlobalPortfolio(req, res);

    assert.strictEqual(calledParentRef, 'parent-123');
    assert.strictEqual(res.headers['Cache-Control'], 'no-store');
    assert.strictEqual(res.data.children.length, 1);
    assert.strictEqual(res.data.children[0].student_global_id, 'global-1');
    assert.strictEqual(res.data.children[0].display_name, 'Jean DUPONT');
    assert.ok(Array.isArray(res.data.children[0].schools));
    assert.strictEqual(res.data.children[0].schools.length, 2);
    assert.strictEqual(res.data.children[0].schools[0].school_name, 'École A Pasteur');
    assert.strictEqual(res.data.children[0].schools[1].school_name, 'École B Hugo');
    assert.strictEqual(res.data.children[0].access.state, 'PAID_ACTIVE');
    assert.strictEqual(res.data.children[0].access.accessAllowed, true);
});

test('P25-T.3 Global Portfolio - Historique contradictoire exclu', async (t) => {
    const req = { user: { id: 'parent-123' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') return { data: [{ student_global_id: 'global-conflict' }], error: null };
        if (table === 'student_global_mappings') return {
            data: [{ school_slug: 'ecolea', student_local_id: 'l1' }, { school_slug: 'ecoleb', student_local_id: 'l2' }], error: null
        };
        if (table === 'students_ecolea') return { data: { nom: 'DUPONT', prenom: 'Jean', date_naissance: '2015-05-10' }, error: null };
        if (table === 'students_ecoleb') return { data: { nom: 'DUPONT', prenom: 'Paul', date_naissance: '2015-05-10' }, error: null };
        return { data: null, error: null };
    });

    supabaseStub.rpc = () => Promise.resolve({ data: [], error: null });

    await parentController.getGlobalPortfolio(req, res);
    assert.strictEqual(res.data.children.length, 0);
});

test('P25-T.3 Global Portfolio - DOB manquant et invalide exclus', async (t) => {
    const req = { user: { id: 'parent-123' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') return { data: [{ student_global_id: 'global-nodob' }, { student_global_id: 'global-baddob' }], error: null };
        if (table === 'student_global_mappings') {
            const gid = q.eqFilters?.['student_global_id'];
            if (gid === 'global-nodob') return { data: [{ school_slug: 'ecolea', student_local_id: 'l1' }], error: null };
            if (gid === 'global-baddob') return { data: [{ school_slug: 'ecoleb', student_local_id: 'l2' }], error: null };
        }
        if (table === 'students_ecolea') return { data: { nom: 'DUPONT', prenom: 'Jean', date_naissance: null }, error: null };
        if (table === 'students_ecoleb') return { data: { nom: 'DUPONT', prenom: 'Paul', date_naissance: 'not-a-date' }, error: null };
        return { data: null, error: null };
    });

    supabaseStub.rpc = () => Promise.resolve({ data: [], error: null });

    await parentController.getGlobalPortfolio(req, res);
    assert.strictEqual(res.data.children.length, 0);
});

test('P25-T.3 Global Portfolio - Slug invalide ignoré', async (t) => {
    const req = { user: { id: 'parent-123' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };
    let invalidSlugQueried = false;

    supabaseStub.from = (table) => {
        if (table.includes('../../evil')) invalidSlugQueried = true;
        return createMockQuery((q) => {
            if (table === 'parent_child_links') return { data: [{ student_global_id: 'global-evil' }], error: null };
            if (table === 'student_global_mappings') return { data: [{ school_slug: '../../evil', student_local_id: 'l1' }], error: null };
            return { data: null, error: null };
        });
    };

    supabaseStub.rpc = () => Promise.resolve({ data: [], error: null });

    await parentController.getGlobalPortfolio(req, res);
    assert.strictEqual(invalidSlugQueried, false);
    assert.strictEqual(res.data.children.length, 0);
});

test('P25-T.3 Global Portfolio - Empty portfolio', async (t) => {
    const req = { user: { id: 'parent-123' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') return { data: [], error: null };
        return { data: [], error: null };
    });

    await parentController.getGlobalPortfolio(req, res);
    assert.deepStrictEqual(res.data, { children: [] });
});

test('P25-T.3 Global Portfolio - Erreur DB initiale parent_child_links', async (t) => {
    const req = { user: { id: 'parent-123' } };
    const res = { status: (code) => { res.statusCode = code; return res; }, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = () => createMockQuery(() => ({ data: null, error: new Error('DB DOWN') }));

    await parentController.getGlobalPortfolio(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.data, { error: 'Erreur serveur.' });
});

test('P25-T.3 Global Portfolio - Erreur DB mappings', async (t) => {
    const req = { user: { id: 'parent-123' } };
    const res = { status: (code) => { res.statusCode = code; return res; }, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') return { data: [{ student_global_id: 'g1' }], error: null };
        if (table === 'student_global_mappings') return { data: null, error: new Error('DB DOWN MAPPINGS') };
        return { data: [], error: null };
    });

    supabaseStub.rpc = () => Promise.resolve({ data: [], error: null });

    await parentController.getGlobalPortfolio(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.data, { error: 'Erreur serveur.' });
});

test('P25-T.3 Global Portfolio - Erreur DB historique hsErr', async (t) => {
    const req = { user: { id: 'parent-123' } };
    const res = { status: (code) => { res.statusCode = code; return res; }, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') return { data: [{ student_global_id: 'g1' }], error: null };
        if (table === 'student_global_mappings') return { data: [{ school_slug: 'ecolea', student_local_id: 'l1' }], error: null };
        if (table === 'students_ecolea') return { data: null, error: new Error('DB DOWN HIST') };
        return { data: null, error: null };
    });

    supabaseStub.rpc = () => Promise.resolve({ data: [], error: null });

    await parentController.getGlobalPortfolio(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.data, { error: 'Erreur serveur.' });
});

// ── Tests P25-T.5a : Contrat enrichi, Parent Pack et Sécurité ─────────

test('P25-T.5a - Parent avec plusieurs enfants et écoles résolues', async (t) => {
    const req = { user: { id: 'parent-multi' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') {
            return {
                data: [
                    { student_global_id: 'child-1', first_linked_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString() },
                    { student_global_id: 'child-2', first_linked_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString() }
                ],
                error: null
            };
        }
        if (table === 'student_global_mappings') {
            const gid = q.eqFilters?.['student_global_id'];
            if (gid === 'child-1') return { data: [{ school_slug: 'ecole_nord', student_local_id: 'loc-1' }], error: null };
            if (gid === 'child-2') return { data: [{ school_slug: 'ecole_sud', student_local_id: 'loc-2' }], error: null };
        }
        if (table === 'schools') {
            return {
                data: [
                    { slug: 'ecole_nord', name: 'École du Nord' },
                    { slug: 'ecole_sud', name: 'École du Sud' }
                ],
                error: null
            };
        }
        if (table === 'students_ecole_nord') {
            return { data: { nom: 'KOUASSI', prenom: 'Amina', date_naissance: '2016-04-12' }, error: null };
        }
        if (table === 'students_ecole_sud') {
            return { data: { nom: 'KOUASSI', prenom: 'Marc', date_naissance: '2018-09-25' }, error: null };
        }
        return { data: null, error: null };
    });

    supabaseStub.rpc = (fn) => {
        if (fn === 'get_active_parent_pack_subscriptions') {
            return Promise.resolve({ data: [{ student_global_id: 'child-2' }], error: null });
        }
        return Promise.resolve({ data: [], error: null });
    };

    await parentController.getGlobalPortfolio(req, res);

    assert.strictEqual(res.data.children.length, 2);

    const child1 = res.data.children.find(c => c.student_global_id === 'child-1');
    assert.strictEqual(child1.display_name, 'Amina KOUASSI');
    assert.strictEqual(child1.schools.length, 1);
    assert.strictEqual(child1.schools[0].school_slug, 'ecole_nord');
    assert.strictEqual(child1.schools[0].school_name, 'École du Nord');
    assert.strictEqual(child1.access.state, 'GRACE_ACTIVE');
    assert.strictEqual(child1.access.accessAllowed, true);
    assert.ok(child1.access.grace_expires_at);

    const child2 = res.data.children.find(c => c.student_global_id === 'child-2');
    assert.strictEqual(child2.display_name, 'Marc KOUASSI');
    assert.strictEqual(child2.schools.length, 1);
    assert.strictEqual(child2.schools[0].school_slug, 'ecole_sud');
    assert.strictEqual(child2.schools[0].school_name, 'École du Sud');
    assert.strictEqual(child2.access.state, 'PAID_ACTIVE');
    assert.strictEqual(child2.access.accessAllowed, true);
    assert.strictEqual(child2.access.grace_expires_at, undefined);
});

test('P25-T.5a - Déduplication des établissements pour un même enfant', async (t) => {
    const req = { user: { id: 'parent-dedup' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') {
            return { data: [{ student_global_id: 'g-child-dedup', first_linked_at: new Date().toISOString() }], error: null };
        }
        if (table === 'student_global_mappings') {
            return {
                data: [
                    { school_slug: 'ecole_same', student_local_id: 'loc-1' },
                    { school_slug: 'ecole_same', student_local_id: 'loc-2' }
                ],
                error: null
            };
        }
        if (table === 'schools') {
            return { data: [{ slug: 'ecole_same', name: 'École Identique' }], error: null };
        }
        if (table === 'students_ecole_same') {
            return { data: { nom: 'TRAORE', prenom: 'Fatou', date_naissance: '2014-01-01' }, error: null };
        }
        return { data: null, error: null };
    });

    supabaseStub.rpc = () => Promise.resolve({ data: [], error: null });

    await parentController.getGlobalPortfolio(req, res);

    assert.strictEqual(res.data.children.length, 1);
    assert.strictEqual(res.data.children[0].schools.length, 1);
    assert.strictEqual(res.data.children[0].schools[0].school_slug, 'ecole_same');
    assert.strictEqual(res.data.children[0].schools[0].school_name, 'École Identique');
});

test('P25-T.5a - Absence stricte de student_local_id et de données privées', async (t) => {
    const req = { user: { id: 'parent-privacy' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') return { data: [{ student_global_id: 'g-priv', first_linked_at: new Date().toISOString() }], error: null };
        if (table === 'student_global_mappings') return { data: [{ school_slug: 'ecolea', student_local_id: 'SECRET_LOCAL_ID_999' }], error: null };
        if (table === 'schools') return { data: [{ slug: 'ecolea', name: 'École A' }], error: null };
        if (table === 'students_ecolea') return { data: { nom: 'SECRETS', prenom: 'Agent', date_naissance: '2015-05-10', notes: [18], ecolage: 150000 }, error: null };
        return { data: null, error: null };
    });

    supabaseStub.rpc = () => Promise.resolve({ data: [], error: null });

    await parentController.getGlobalPortfolio(req, res);

    assert.strictEqual(res.data.children.length, 1);
    const child = res.data.children[0];

    assert.strictEqual(child.student_local_id, undefined);
    assert.strictEqual(child.local_id, undefined);
    assert.strictEqual(child.notes, undefined);
    assert.strictEqual(child.ecolage, undefined);
    assert.strictEqual(child.subscription_expires_at, undefined);
    assert.strictEqual(child.schools[0].student_local_id, undefined);

    const serialized = JSON.stringify(res.data);
    assert.ok(!serialized.includes('SECRET_LOCAL_ID_999'));
    assert.ok(!serialized.includes('ecolage'));
});

test('P25-T.5a - Isolation stricte : Parent A ne voit aucun enfant de Parent B', async (t) => {
    const reqA = { user: { id: 'parent-A' } };
    const resA = { status: () => resA, json: (data) => { resA.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') {
            const requestedParent = q.eqFilters?.['parent_ref'];
            if (requestedParent === 'parent-A') {
                return { data: [{ student_global_id: 'child-A', first_linked_at: new Date().toISOString() }], error: null };
            }
            if (requestedParent === 'parent-B') {
                return { data: [{ student_global_id: 'child-B', first_linked_at: new Date().toISOString() }], error: null };
            }
            return { data: [], error: null };
        }
        if (table === 'student_global_mappings') {
            const gid = q.eqFilters?.['student_global_id'];
            if (gid === 'child-A') return { data: [{ school_slug: 'ecolea', student_local_id: 'lA' }], error: null };
            if (gid === 'child-B') return { data: [{ school_slug: 'ecoleb', student_local_id: 'lB' }], error: null };
        }
        if (table === 'students_ecolea') return { data: { nom: 'PARENT_A', prenom: 'Enfant', date_naissance: '2015-05-10' }, error: null };
        if (table === 'students_ecoleb') return { data: { nom: 'PARENT_B', prenom: 'Enfant', date_naissance: '2015-05-10' }, error: null };
        return { data: null, error: null };
    });

    supabaseStub.rpc = () => Promise.resolve({ data: [], error: null });

    await parentController.getGlobalPortfolio(reqA, resA);

    assert.strictEqual(resA.data.children.length, 1);
    assert.strictEqual(resA.data.children[0].student_global_id, 'child-A');
    assert.strictEqual(resA.data.children[0].display_name, 'Enfant PARENT_A');
});

test('P25-T.5a - Deux parents partageant un téléphone ne sont pas fusionnés', async (t) => {
    const req1 = { user: { id: 'parent-uuid-1', telephone: '+2290197000000' } };
    const res1 = { status: () => res1, json: (data) => { res1.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') {
            const parentRef = q.eqFilters?.['parent_ref'];
            if (parentRef === 'parent-uuid-1') {
                return { data: [{ student_global_id: 'child-single-1', first_linked_at: new Date().toISOString() }], error: null };
            }
            return { data: [], error: null };
        }
        if (table === 'student_global_mappings') {
            return { data: [{ school_slug: 'ecolea', student_local_id: 'l1' }], error: null };
        }
        if (table === 'students_ecolea') {
            return { data: { nom: 'FAMILLE', prenom: 'Un', date_naissance: '2015-01-01' }, error: null };
        }
        return { data: null, error: null };
    });

    supabaseStub.rpc = () => Promise.resolve({ data: [], error: null });

    await parentController.getGlobalPortfolio(req1, res1);

    assert.strictEqual(res1.data.children.length, 1);
    assert.strictEqual(res1.data.children[0].student_global_id, 'child-single-1');
});

test('P25-T.5a - Échec fail-closed si le moteur Parent Pack lève une erreur', async (t) => {
    const req = { user: { id: 'parent-err' } };
    const res = { status: (c) => { res.statusCode = c; return res; }, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') return { data: [{ student_global_id: 'child-fail', first_linked_at: new Date().toISOString() }], error: null };
        return { data: [], error: null };
    });

    supabaseStub.rpc = (fn) => {
        if (fn === 'get_active_parent_pack_subscriptions') {
            return Promise.reject(new Error('RPC TIMEOUT / ENGINE FAIL'));
        }
        return Promise.resolve({ data: [], error: null });
    };

    await parentController.getGlobalPortfolio(req, res);

    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.data, { error: 'Erreur serveur.' });
});

test('P25-T.5a - Statut PACK_SUSPENDED lorsque la grâce est expirée', async (t) => {
    const req = { user: { id: 'parent-suspended' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };

    // 15 jours dans le passé
    const expiredLinkDate = new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString();

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') return { data: [{ student_global_id: 'child-susp', first_linked_at: expiredLinkDate }], error: null };
        if (table === 'student_global_mappings') return { data: [{ school_slug: 'ecolea', student_local_id: 'l1' }], error: null };
        if (table === 'students_ecolea') return { data: { nom: 'SUSP', prenom: 'Child', date_naissance: '2016-01-01' }, error: null };
        return { data: null, error: null };
    });

    supabaseStub.rpc = () => Promise.resolve({ data: [], error: null });

    await parentController.getGlobalPortfolio(req, res);

    assert.strictEqual(res.data.children.length, 1);
    assert.strictEqual(res.data.children[0].access.state, 'PACK_SUSPENDED');
    assert.strictEqual(res.data.children[0].access.accessAllowed, false);
    assert.strictEqual(res.data.children[0].access.grace_expires_at, undefined);
});

test('P25-T.5a - Statut LEGACY_UNDECIDED sans date de grâce inventée', async (t) => {
    const req = { user: { id: 'parent-legacy' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') return { data: [{ student_global_id: 'child-leg', first_linked_at: null }], error: null };
        if (table === 'student_global_mappings') return { data: [{ school_slug: 'ecolea', student_local_id: 'l1' }], error: null };
        if (table === 'students_ecolea') return { data: { nom: 'LEGACY', prenom: 'Child', date_naissance: '2014-06-01' }, error: null };
        return { data: null, error: null };
    });

    supabaseStub.rpc = () => Promise.resolve({ data: [], error: null });

    await parentController.getGlobalPortfolio(req, res);

    assert.strictEqual(res.data.children.length, 1);
    assert.strictEqual(res.data.children[0].access.state, 'LEGACY_UNDECIDED');
    assert.strictEqual(res.data.children[0].access.accessAllowed, true);
    assert.strictEqual(res.data.children[0].access.grace_expires_at, undefined);
});

test('P25-T.5a - Droits et multi-établissements préservés après transfert', async (t) => {
    const req = { user: { id: 'parent-transferred' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') {
            return {
                data: [{ student_global_id: 'child-transferred-1', first_linked_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString() }],
                error: null
            };
        }
        if (table === 'student_global_mappings') {
            return {
                data: [
                    { school_slug: 'ecole_source', student_local_id: 's-loc-1' },
                    { school_slug: 'ecole_dest', student_local_id: 'd-loc-2' }
                ],
                error: null
            };
        }
        if (table === 'schools') {
            return {
                data: [
                    { slug: 'ecole_source', name: 'École Source A' },
                    { slug: 'ecole_dest', name: 'École Destination B' }
                ],
                error: null
            };
        }
        if (table === 'students_ecole_source') {
            return { data: { nom: 'DIOP', prenom: 'Moussa', date_naissance: '2015-10-10' }, error: null };
        }
        if (table === 'students_ecole_dest') {
            return { data: { nom: 'DIOP', prenom: 'Moussa', date_naissance: '2015-10-10' }, error: null };
        }
        return { data: null, error: null };
    });

    supabaseStub.rpc = () => Promise.resolve({ data: [], error: null });

    await parentController.getGlobalPortfolio(req, res);

    assert.strictEqual(res.data.children.length, 1);
    const child = res.data.children[0];
    assert.strictEqual(child.display_name, 'Moussa DIOP');
    assert.strictEqual(child.schools.length, 2);
    assert.strictEqual(child.schools[0].school_slug, 'ecole_source');
    assert.strictEqual(child.schools[0].school_name, 'École Source A');
    assert.strictEqual(child.schools[1].school_slug, 'ecole_dest');
    assert.strictEqual(child.schools[1].school_name, 'École Destination B');
    assert.strictEqual(child.access.state, 'GRACE_ACTIVE');
    assert.strictEqual(child.access.accessAllowed, true);
    assert.ok(child.access.grace_expires_at);
});

// ── Tests de régression P25-T.5a : Gestion d'erreur renforcée ────────

test('P25-T.5a - Exception levée pendant la récupération des écoles : HTTP 500', async (t) => {
    const req = { user: { id: 'parent-schools-crash' } };
    const res = { status: (code) => { res.statusCode = code; return res; }, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') return { data: [{ student_global_id: 'g-schools-crash', first_linked_at: new Date().toISOString() }], error: null };
        if (table === 'student_global_mappings') return { data: [{ school_slug: 'ecolea', student_local_id: 'l1' }], error: null };
        if (table === 'students_ecolea') return { data: { nom: 'DUPONT', prenom: 'Paul', date_naissance: '2015-01-01' }, error: null };
        if (table === 'schools') {
            throw new Error('CRASH BASE SCHOOLS');
        }
        return { data: null, error: null };
    });

    supabaseStub.rpc = () => Promise.resolve({ data: [], error: null });

    await parentController.getGlobalPortfolio(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.data, { error: 'Erreur serveur.' });
});

test('P25-T.5a - État Parent Pack absent : HTTP 500', async (t) => {
    const req = { user: { id: 'parent-pack-missing' } };
    const res = { status: (code) => { res.statusCode = code; return res; }, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') return { data: [{ student_global_id: 'g-missing-pack', first_linked_at: new Date().toISOString() }], error: null };
        if (table === 'student_global_mappings') return { data: [{ school_slug: 'ecolea', student_local_id: 'l1' }], error: null };
        if (table === 'students_ecolea') return { data: { nom: 'DUPONT', prenom: 'Paul', date_naissance: '2015-01-01' }, error: null };
        if (table === 'schools') return { data: [{ slug: 'ecolea', name: 'École A' }], error: null };
        return { data: null, error: null };
    });

    const origFn = parentPackService.getAccessStatesForGlobalIds;
    parentPackService.getAccessStatesForGlobalIds = async () => ({}); // Aucun état retourné pour g-missing-pack

    try {
        await parentController.getGlobalPortfolio(req, res);
        assert.strictEqual(res.statusCode, 500);
        assert.deepStrictEqual(res.data, { error: 'Erreur serveur.' });
    } finally {
        parentPackService.getAccessStatesForGlobalIds = origFn;
    }
});

test('P25-T.5a - État Parent Pack inconnu : HTTP 500', async (t) => {
    const req = { user: { id: 'parent-pack-unknown' } };
    const res = { status: (code) => { res.statusCode = code; return res; }, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') return { data: [{ student_global_id: 'g-unknown-pack', first_linked_at: new Date().toISOString() }], error: null };
        if (table === 'student_global_mappings') return { data: [{ school_slug: 'ecolea', student_local_id: 'l1' }], error: null };
        if (table === 'students_ecolea') return { data: { nom: 'DUPONT', prenom: 'Paul', date_naissance: '2015-01-01' }, error: null };
        if (table === 'schools') return { data: [{ slug: 'ecolea', name: 'École A' }], error: null };
        return { data: null, error: null };
    });

    const origFn = parentPackService.getAccessStatesForGlobalIds;
    parentPackService.getAccessStatesForGlobalIds = async () => ({
        'g-unknown-pack': { state: 'UNKNOWN_CUSTOM_STATUS', accessAllowed: true }
    });

    try {
        await parentController.getGlobalPortfolio(req, res);
        assert.strictEqual(res.statusCode, 500);
        assert.deepStrictEqual(res.data, { error: 'Erreur serveur.' });
    } finally {
        parentPackService.getAccessStatesForGlobalIds = origFn;
    }
});

test('P25-T.5a - accessAllowed manquant ou non booléen : HTTP 500', async (t) => {
    const req = { user: { id: 'parent-pack-bad-bool' } };
    const res = { status: (code) => { res.statusCode = code; return res; }, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') return { data: [{ student_global_id: 'g-bad-bool', first_linked_at: new Date().toISOString() }], error: null };
        if (table === 'student_global_mappings') return { data: [{ school_slug: 'ecolea', student_local_id: 'l1' }], error: null };
        if (table === 'students_ecolea') return { data: { nom: 'DUPONT', prenom: 'Paul', date_naissance: '2015-01-01' }, error: null };
        if (table === 'schools') return { data: [{ slug: 'ecolea', name: 'École A' }], error: null };
        return { data: null, error: null };
    });

    const origFn = parentPackService.getAccessStatesForGlobalIds;

    // 1. Chaîne au lieu de booléen
    parentPackService.getAccessStatesForGlobalIds = async () => ({
        'g-bad-bool': { state: 'PAID_ACTIVE', accessAllowed: 'true' }
    });

    try {
        await parentController.getGlobalPortfolio(req, res);
        assert.strictEqual(res.statusCode, 500);
        assert.deepStrictEqual(res.data, { error: 'Erreur serveur.' });
    } finally {
        parentPackService.getAccessStatesForGlobalIds = origFn;
    }

    // 2. Propriété accessAllowed absente
    parentPackService.getAccessStatesForGlobalIds = async () => ({
        'g-bad-bool': { state: 'PAID_ACTIVE' }
    });

    try {
        await parentController.getGlobalPortfolio(req, res);
        assert.strictEqual(res.statusCode, 500);
        assert.deepStrictEqual(res.data, { error: 'Erreur serveur.' });
    } finally {
        parentPackService.getAccessStatesForGlobalIds = origFn;
    }
});

test('P25-T.5a - État PACK_SUSPENDED valide : réponse normale', async (t) => {
    const req = { user: { id: 'parent-valid-suspended' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') return { data: [{ student_global_id: 'g-valid-susp', first_linked_at: new Date().toISOString() }], error: null };
        if (table === 'student_global_mappings') return { data: [{ school_slug: 'ecolea', student_local_id: 'l1' }], error: null };
        if (table === 'students_ecolea') return { data: { nom: 'SUSP', prenom: 'Paul', date_naissance: '2015-01-01' }, error: null };
        if (table === 'schools') return { data: [{ slug: 'ecolea', name: 'École A' }], error: null };
        return { data: null, error: null };
    });

    const origFn = parentPackService.getAccessStatesForGlobalIds;
    parentPackService.getAccessStatesForGlobalIds = async () => ({
        'g-valid-susp': { state: 'PACK_SUSPENDED', accessAllowed: false }
    });

    try {
        await parentController.getGlobalPortfolio(req, res);
        assert.strictEqual(res.data.children.length, 1);
        assert.strictEqual(res.data.children[0].student_global_id, 'g-valid-susp');
        assert.strictEqual(res.data.children[0].access.state, 'PACK_SUSPENDED');
        assert.strictEqual(res.data.children[0].access.accessAllowed, false);
    } finally {
        parentPackService.getAccessStatesForGlobalIds = origFn;
    }
});

test('P25-T.5a - Établissement absent dans une requête réussie : comportement de repli conservé', async (t) => {
    const req = { user: { id: 'parent-missing-school-record' } };
    const res = { status: () => res, json: (data) => { res.data = data; }, set: () => {} };

    supabaseStub.from = (table) => createMockQuery((q) => {
        if (table === 'parent_child_links') return { data: [{ student_global_id: 'g-fallback-school', first_linked_at: new Date().toISOString() }], error: null };
        if (table === 'student_global_mappings') return { data: [{ school_slug: 'ecole_inconnue', student_local_id: 'l1' }], error: null };
        if (table === 'students_ecole_inconnue') return { data: { nom: 'DUPONT', prenom: 'Jean', date_naissance: '2015-01-01' }, error: null };
        if (table === 'schools') {
            // Requête SQL réussie sans erreur mais table ne contient pas ecole_inconnue
            return { data: [], error: null };
        }
        return { data: null, error: null };
    });

    supabaseStub.rpc = () => Promise.resolve({ data: [], error: null });

    await parentController.getGlobalPortfolio(req, res);
    assert.strictEqual(res.data.children.length, 1);
    assert.strictEqual(res.data.children[0].schools.length, 1);
    assert.strictEqual(res.data.children[0].schools[0].school_slug, 'ecole_inconnue');
    assert.strictEqual(res.data.children[0].schools[0].school_name, 'ecole_inconnue');
});
