// Tests for GET /api/students/search-linkable (Initial Parent-Child Linking Search)
// Verifies:
// 1. Initial search finds unlinked student with matching E.164 phone
// 2. Phone mismatch strictly rejects / excludes student (zero data leakage)
// 3. Multi-tenant school isolation
// 4. Confidentiality (no student parent phone or other families' data exposed)
// 5. Role permissions (parent, admin, director allowed; others 403)
// 6. Identification of already linked and already pending students
// 7. General GET /api/students remains strictly confined to linked students for parents

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key_1234567890123456';
process.env.JWT_SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // 32 chars
process.env.AI_QUOTA_HASH_SECRET = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
process.env.PASSWORD_RESET_OTP_SECRET = 'cccccccccccccccccccccccccccccccc';

const app = require('../../backend/server.js');
const { supabase } = require('../../backend/utils/supabase');

let server;
let baseUrl;

test.before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
    if (server) {
        if (typeof server.closeAllConnections === 'function') {
            server.closeAllConnections();
        }
        await new Promise((resolve) => server.close(resolve));
    }
});

function generateToken(payload) {
    return jwt.sign({ token_type: 'access', ...payload }, process.env.JWT_SECRET, { algorithm: 'HS256' });
}

async function request(method, path, { token, body } = {}) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';

    const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });

    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        json = text;
    }
    return { status: res.status, body: json };
}

test.describe('GET /api/students/search-linkable - Rattachement initial sécurisé', () => {
    const origFrom = supabase.from;

    test.afterEach(() => {
        supabase.from = origFrom;
    });

    test('1. Recherche initiale : parent avec numéro concordant trouve son enfant non lié', async () => {
        const parentId = 'parent-uuid-1';
        const parentPhone = '+2290190000000';
        const schoolSlug = 'ecole_test';

        // Mock Supabase tables
        supabase.from = (table) => {
            if (table === `profiles_${schoolSlug}`) {
                return {
                    select: () => ({
                        eq: (col, val) => ({
                            maybeSingle: async () => ({
                                data: { id: parentId, nom: 'DOSSOU', telephone: parentPhone, phone_normalized: parentPhone, role: 'parent' },
                                error: null
                            })
                        })
                    })
                };
            }
            if (table === `students_${schoolSlug}`) {
                return {
                    select: () => ({
                        or: () => ({
                            order: () => ({
                                limit: async () => ({
                                    data: [
                                        {
                                            id: 'student-jp-1',
                                            nom: 'DOSSOU',
                                            prenom: 'Jean Paul',
                                            classe: 'CM2',
                                            telephone_parent: parentPhone,
                                            telephone_parent_normalized: parentPhone,
                                            photo_url: null
                                        }
                                    ],
                                    error: null
                                })
                            })
                        })
                    })
                };
            }
            if (table === `parent_student_${schoolSlug}`) {
                return {
                    select: () => ({
                        eq: async () => ({ data: [], error: null }) // Pas encore lié
                    })
                };
            }
            if (table === 'parent_student_link_requests') {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                in: async () => ({ data: [], error: null }) // Pas de demande pending
                            })
                        })
                    })
                };
            }
            return origFrom.call(supabase, table);
        };

        const token = generateToken({ id: parentId, role: 'parent', schoolSlug, telephone: parentPhone });
        const res = await request('GET', '/api/students/search-linkable?search=Jean Paul DOSSOU', { token });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.total, 1);
        assert.strictEqual(res.body.students[0].id, 'student-jp-1');
        assert.strictEqual(res.body.students[0].nom, 'DOSSOU');
        assert.strictEqual(res.body.students[0].prenom, 'Jean Paul');
        assert.strictEqual(res.body.students[0].is_linked, false);
        assert.strictEqual(res.body.students[0].is_pending, false);
        assert.strictEqual(res.body.students[0].link_status, 'eligible');
        // Vérification de non-divulgation des numéros
        assert.strictEqual(res.body.students[0].telephone_parent, undefined);
        assert.strictEqual(res.body.students[0].telephone_parent_normalized, undefined);
    });

    test('2. Numéro de téléphone différent : aucun élève retourné (zéro fuite inter-familles)', async () => {
        const parentId = 'parent-uuid-2';
        const parentPhone = '+2290190000000';
        const schoolSlug = 'ecole_test';

        supabase.from = (table) => {
            if (table === `profiles_${schoolSlug}`) {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({
                                data: { id: parentId, nom: 'Autre', telephone: parentPhone, phone_normalized: parentPhone, role: 'parent' },
                                error: null
                            })
                        })
                    })
                };
            }
            if (table === `students_${schoolSlug}`) {
                return {
                    select: () => ({
                        or: () => ({
                            order: () => ({
                                limit: async () => ({
                                    // La base renvoie des élèves avec un autre téléphone (ex: tentative de contournement ou données brutes)
                                    data: [
                                        {
                                            id: 'student-other-family',
                                            nom: 'KOUASSI',
                                            prenom: 'Awa',
                                            classe: '6ème',
                                            telephone_parent: '+2290199999999',
                                            telephone_parent_normalized: '+2290199999999'
                                        }
                                    ],
                                    error: null
                                })
                            })
                        })
                    })
                };
            }
            if (table === `parent_student_${schoolSlug}`) {
                return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
            }
            if (table === 'parent_student_link_requests') {
                return { select: () => ({ eq: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) }) };
            }
            return origFrom.call(supabase, table);
        };

        const token = generateToken({ id: parentId, role: 'parent', schoolSlug, telephone: parentPhone });
        const res = await request('GET', '/api/students/search-linkable?search=KOUASSI', { token });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.total, 0);
        assert.strictEqual(res.body.students.length, 0);
    });

    test('3. Établissement manquant ou invalide : rejet 403', async () => {
        const tokenWithoutSchool = generateToken({ id: 'parent-1', role: 'parent', telephone: '+2290190000000' });
        const res1 = await request('GET', '/api/students/search-linkable', { token: tokenWithoutSchool });
        assert.strictEqual(res1.status, 403);

        const tokenInvalidSchool = generateToken({ id: 'parent-1', role: 'parent', schoolSlug: 'invalid slug!', telephone: '+2290190000000' });
        const res2 = await request('GET', '/api/students/search-linkable', { token: tokenInvalidSchool });
        assert.strictEqual(res2.status, 403);
    });

    test('4. Rôle non autorisé (ex: comptable, surveillant) : rejet 403', async () => {
        const tokenComptable = generateToken({ id: 'user-1', role: 'comptable', schoolSlug: 'ecole_test' });
        const res1 = await request('GET', '/api/students/search-linkable', { token: tokenComptable });
        assert.strictEqual(res1.status, 403);

        const tokenSurveillant = generateToken({ id: 'user-2', role: 'surveillant', schoolSlug: 'ecole_test' });
        const res2 = await request('GET', '/api/students/search-linkable', { token: tokenSurveillant });
        assert.strictEqual(res2.status, 403);
    });

    test('5. Numéro de téléphone du parent manquant ou invalide : rejet 403', async () => {
        const parentId = 'parent-no-phone';
        const schoolSlug = 'ecole_test';

        supabase.from = (table) => {
            if (table === `profiles_${schoolSlug}`) {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({
                                data: { id: parentId, nom: 'Parent Sans Num', telephone: '', phone_normalized: null, role: 'parent' },
                                error: null
                            })
                        })
                    })
                };
            }
            return origFrom.call(supabase, table);
        };

        const token = generateToken({ id: parentId, role: 'parent', schoolSlug, telephone: '' });
        const res = await request('GET', '/api/students/search-linkable', { token });

        assert.strictEqual(res.status, 403);
        assert.match(res.body.error, /Le numéro de téléphone de votre compte est incomplet ou invalide/);
    });

    test('6. Élève déjà lié identifié avec statut already_linked', async () => {
        const parentId = 'parent-uuid-1';
        const parentPhone = '+2290190000000';
        const schoolSlug = 'ecole_test';

        supabase.from = (table) => {
            if (table === `profiles_${schoolSlug}`) {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({
                                data: { id: parentId, nom: 'DOSSOU', telephone: parentPhone, phone_normalized: parentPhone, role: 'parent' },
                                error: null
                            })
                        })
                    })
                };
            }
            if (table === `students_${schoolSlug}`) {
                return {
                    select: () => ({
                        or: () => ({
                            order: () => ({
                                limit: async () => ({
                                    data: [
                                        {
                                            id: 'student-already-linked',
                                            nom: 'DOSSOU',
                                            prenom: 'Jean Paul',
                                            classe: 'CM2',
                                            telephone_parent: parentPhone,
                                            telephone_parent_normalized: parentPhone
                                        }
                                    ],
                                    error: null
                                })
                            })
                        })
                    })
                };
            }
            if (table === `parent_student_${schoolSlug}`) {
                return {
                    select: () => ({
                        eq: async () => ({ data: [{ student_id: 'student-already-linked' }], error: null })
                    })
                };
            }
            if (table === 'parent_student_link_requests') {
                return { select: () => ({ eq: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) }) };
            }
            return origFrom.call(supabase, table);
        };

        const token = generateToken({ id: parentId, role: 'parent', schoolSlug, telephone: parentPhone });
        const res = await request('GET', '/api/students/search-linkable?search=DOSSOU', { token });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.students[0].is_linked, true);
        assert.strictEqual(res.body.students[0].link_status, 'already_linked');
    });

    test('7. Demande de liaison pending identifiée avec statut pending', async () => {
        const parentId = 'parent-uuid-1';
        const parentPhone = '+2290190000000';
        const schoolSlug = 'ecole_test';

        supabase.from = (table) => {
            if (table === `profiles_${schoolSlug}`) {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({
                                data: { id: parentId, nom: 'DOSSOU', telephone: parentPhone, phone_normalized: parentPhone, role: 'parent' },
                                error: null
                            })
                        })
                    })
                };
            }
            if (table === `students_${schoolSlug}`) {
                return {
                    select: () => ({
                        or: () => ({
                            order: () => ({
                                limit: async () => ({
                                    data: [
                                        {
                                            id: 'student-with-pending-req',
                                            nom: 'DOSSOU',
                                            prenom: 'Jean Paul',
                                            classe: 'CM2',
                                            telephone_parent: parentPhone,
                                            telephone_parent_normalized: parentPhone
                                        }
                                    ],
                                    error: null
                                })
                            })
                        })
                    })
                };
            }
            if (table === `parent_student_${schoolSlug}`) {
                return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
            }
            if (table === 'parent_student_link_requests') {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                in: async () => ({
                                    data: [{ student_id: 'student-with-pending-req', status: 'pending' }],
                                    error: null
                                })
                            })
                        })
                    })
                };
            }
            return origFrom.call(supabase, table);
        };

        const token = generateToken({ id: parentId, role: 'parent', schoolSlug, telephone: parentPhone });
        const res = await request('GET', '/api/students/search-linkable?search=DOSSOU', { token });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.students[0].is_linked, false);
        assert.strictEqual(res.body.students[0].is_pending, true);
        assert.strictEqual(res.body.students[0].link_status, 'pending');
    });

    test('8. L endpoint général GET /api/students reste strictement confiné aux élèves déjà liés pour les parents', async () => {
        const parentId = 'parent-uuid-1';
        const schoolSlug = 'ecole_test';

        supabase.from = (table) => {
            if (table === `parent_student_${schoolSlug}`) {
                return {
                    select: () => ({
                        eq: async () => ({ data: [], error: null }) // Pas d'élèves liés
                    })
                };
            }
            return origFrom.call(supabase, table);
        };

        const token = generateToken({ id: parentId, role: 'parent', schoolSlug, telephone: '+2290190000000' });
        const res = await request('GET', '/api/students?nom=DOSSOU', { token });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.total, 0);
        assert.deepStrictEqual(res.body.students, []);
    });

    test('9. Schéma réel élève YZIOW (prenom, telephone_parent, telephone_parent_normalized) : recherche « DOSSOU » retourne l élève uniquement avec numéro concordant', async () => {
        const schoolSlug = 'ecole_test';
        const targetParentPhone = '+2290190000000';
        const otherParentPhone = '+2290198888888';

        // Élève avec schéma complet réel YZIOW
        const yziowStudent = {
            id: 'student-dossou-jp-001',
            nom: 'DOSSOU',
            prenom: 'Jean Paul',
            classe: 'CM2-A',
            matricule: 'MAT-2026-0042',
            genre: 'M',
            date_naissance: '2015-08-14',
            statut: 'Actif',
            ecolage: 150000,
            deja_paye: 100000,
            telephone_parent: targetParentPhone,
            telephone_parent_normalized: targetParentPhone,
            photo_url: null,
            redoublant: false,
            ecole_provenance: 'Ecole Primaire Publique',
            updated_at: '2026-09-01T08:00:00Z'
        };

        const setupMocks = (callerParentId, callerPhone) => {
            supabase.from = (table) => {
                if (table === `profiles_${schoolSlug}`) {
                    return {
                        select: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: { id: callerParentId, nom: 'Parent Test', telephone: callerPhone, phone_normalized: callerPhone, role: 'parent' },
                                    error: null
                                })
                            })
                        })
                    };
                }
                if (table === `students_${schoolSlug}`) {
                    return {
                        select: () => ({
                            or: () => ({
                                order: () => ({
                                    limit: async () => ({
                                        // La base renvoie les élèves enregistrés dans l'école
                                        data: [yziowStudent],
                                        error: null
                                    })
                                })
                            })
                        })
                    };
                }
                if (table === `parent_student_${schoolSlug}`) {
                    return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
                }
                if (table === 'parent_student_link_requests') {
                    return { select: () => ({ eq: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) }) };
                }
                return origFrom.call(supabase, table);
            };
        };

        // Cas A : Parent avec numéro concordant (+2290190000000) recherche « DOSSOU »
        setupMocks('parent-dossou-owner', targetParentPhone);
        const tokenOwner = generateToken({ id: 'parent-dossou-owner', role: 'parent', schoolSlug, telephone: targetParentPhone });
        const resOwner = await request('GET', '/api/students/search-linkable?search=DOSSOU', { token: tokenOwner });

        assert.strictEqual(resOwner.status, 200);
        assert.strictEqual(resOwner.body.total, 1);
        const found = resOwner.body.students[0];
        assert.strictEqual(found.id, 'student-dossou-jp-001');
        assert.strictEqual(found.nom, 'DOSSOU');
        assert.strictEqual(found.prenom, 'Jean Paul');
        assert.strictEqual(found.classe, 'CM2-A');
        assert.strictEqual(found.matricule, 'MAT-2026-0042');
        assert.strictEqual(found.date_naissance, '2015-08-14');
        assert.strictEqual(found.link_status, 'eligible');
        // Vérification de non-divulgation des données sensibles
        assert.strictEqual(found.telephone_parent, undefined);
        assert.strictEqual(found.telephone_parent_normalized, undefined);
        assert.strictEqual(found.ecolage, undefined);
        assert.strictEqual(found.deja_paye, undefined);
        assert.strictEqual(found.statut, undefined);
        assert.strictEqual(found.redoublant, undefined);

        // Cas B : Autre parent avec numéro différent (+2290198888888) recherche également « DOSSOU »
        setupMocks('parent-other-phone', otherParentPhone);
        const tokenOther = generateToken({ id: 'parent-other-phone', role: 'parent', schoolSlug, telephone: otherParentPhone });
        const resOther = await request('GET', '/api/students/search-linkable?search=DOSSOU', { token: tokenOther });

        assert.strictEqual(resOther.status, 200);
        assert.strictEqual(resOther.body.total, 0);
        assert.strictEqual(resOther.body.students.length, 0);
    });
});
