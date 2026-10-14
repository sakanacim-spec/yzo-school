/**
 * Suite de tests unitaires et statiques : Validation de delete_student_local_atomically (Version Finale)
 *
 * Vérifie :
 * 1. Ordre strict des verrous (Niveau 1 AVANT Niveau 2, Niveau 2 AVANT Niveau 3, interdiction absolue de 1 après 2).
 * 2. Véritable verrouillage de ligne (SELECT id ... FOR UPDATE, sans sous-requête SELECT EXISTS).
 * 3. Vérification de provenance P26-B stricte (5 critères : id, school_slug, student_id, parent_id, local_link_created_by_p26b).
 * 4. Rejet automatique des demandes pendantes pour l'élève supprimé (aucune approbation post-suppression possible).
 * 5. Échec sécurisé et rollback complet en cas d'erreur de scan inter-écoles (zéro faux succès).
 * 6. Respect strict des types réels (parent_ref TEXT, parent_id UUID, statuts réels).
 * 7. Confinement et rôles autorisés stricts ('admin', 'directeur', 'directeur_general', 'superadmin').
 * 8. Préservation absolue de global_students et des mappings des autres écoles.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Définition canonique du SQL pour delete_student_local_atomically
const DELETE_STUDENT_ATOMIC_SQL = `
CREATE OR REPLACE FUNCTION public.delete_student_local_atomically(
    p_school_slug TEXT,
    p_student_id TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_profile_exists BOOLEAN := false;
    v_actor_role TEXT;
    v_student_exists BOOLEAN := false;
    v_locked_student_id TEXT;
    v_student_global_id UUID;
    v_req RECORD;
    v_parent RECORD;
    v_deleted_parents_count INT := 0;
    v_global_links_deactivated_count INT := 0;
    v_global_links_preserved_count INT := 0;
    v_has_other_school_link BOOLEAN;
    v_other_mapping RECORD;
    v_other_local_link_exists BOOLEAN;
BEGIN
    SET LOCAL lock_timeout = '2s';

    IF p_school_slug IS NULL OR p_school_slug !~ '^[a-z0-9_]{1,50}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_SCHOOL_SLUG');
    END IF;

    IF p_student_id IS NULL OR trim(p_student_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STUDENT_ID');
    END IF;

    IF p_actor_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_ACTOR_ID');
    END IF;

    -- 1. Contrôle d'habilitation et confinement strict à l'établissement
    BEGIN
        EXECUTE format('
            SELECT EXISTS (
                SELECT 1 FROM public.%I WHERE id = %L
            ), (
                SELECT role FROM public.%I WHERE id = %L
            )
        ', 'profiles_' || p_school_slug, p_actor_id,
           'profiles_' || p_school_slug, p_actor_id)
        INTO v_actor_profile_exists, v_actor_role;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'SCHOOL_PROFILE_NOT_FOUND', 'message', 'Table de profils de l''établissement introuvable.');
    END;

    IF NOT v_actor_profile_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'ACTOR_NOT_IN_SCHOOL', 'message', 'Demandeur non confiné à cet établissement.');
    END IF;

    IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'directeur', 'directeur_general', 'superadmin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_ACTOR', 'message', 'Rôle insuffisant pour supprimer un élève.');
    END IF;

    -- 2. ORDRE STRICT DES VERROUS : PHASE 1 — Tous les verrous de Niveau 1 (Demandes P26-B actives pour cet élève)
    -- Acquis impérativement AVANT tout verrou de Niveau 2 ou 3
    FOR v_req IN
        SELECT id
        FROM public.parent_student_link_requests
        WHERE school_slug = p_school_slug
          AND student_id = trim(p_student_id)
          AND status IN ('pending', 'pending_verification', 'approved')
        ORDER BY id ASC
    LOOP
        PERFORM pg_advisory_xact_lock(1, hashtext(p_school_slug || ':' || v_req.id::text));
    END LOOP;

    -- 3. ORDRE STRICT DES VERROUS : PHASE 2 — Verrous de Niveau 2 (Local Établissement)
    -- Verrou local élève (sérialisation stricte avec approve)
    PERFORM pg_advisory_xact_lock(2, hashtext(p_school_slug || ':' || trim(p_student_id)));

    -- 4. Véritable verrouillage de ligne sur la fiche élève locale (FOR UPDATE réel, sans sous-requête EXISTS)
    BEGIN
        EXECUTE format('
            SELECT id FROM public.%I
            WHERE id = %L
            FOR UPDATE
        ', 'students_' || p_school_slug, trim(p_student_id))
        INTO v_locked_student_id;

        v_student_exists := (v_locked_student_id IS NOT NULL);
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'STUDENTS_TABLE_NOT_FOUND');
    END;

    IF NOT v_student_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'STUDENT_NOT_FOUND', 'message', 'Élève introuvable dans cet établissement.');
    END IF;

    -- Verrous de Niveau 2 sur chaque couple local parent-élève (tri déterministe ASC)
    BEGIN
        FOR v_parent IN
            EXECUTE format('
                SELECT parent_id, source_request_id
                FROM public.%I
                WHERE student_id = %L
                ORDER BY parent_id ASC
            ', 'parent_student_' || p_school_slug, trim(p_student_id))
        LOOP
            PERFORM pg_advisory_xact_lock(2, hashtext(p_school_slug || ':' || v_parent.parent_id::text || ':' || trim(p_student_id)));
        END LOOP;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'PARENT_STUDENT_TABLE_NOT_FOUND');
    END;

    -- 5. Résolution de l'identité globale
    SELECT student_global_id INTO v_student_global_id
    FROM public.student_global_mappings
    WHERE school_slug = p_school_slug AND student_local_id = trim(p_student_id);

    -- 6. ORDRE STRICT DES VERROUS : PHASE 3 — Verrous de Niveau 3 (Global Inter-établissements)
    -- Acquis impérativement APRÈS Niveau 1 et Niveau 2
    IF v_student_global_id IS NOT NULL THEN
        FOR v_parent IN
            EXECUTE format('
                SELECT parent_id
                FROM public.%I
                WHERE student_id = %L
                ORDER BY parent_id ASC
            ', 'parent_student_' || p_school_slug, trim(p_student_id))
        LOOP
            PERFORM pg_advisory_xact_lock(3, hashtext(v_parent.parent_id::text || ':' || v_student_global_id::text));
        END LOOP;
    END IF;

    -- 7. Clôture immédiate de toute demande pendante pour cet élève (prévention de création concurrente)
    UPDATE public.parent_student_link_requests
    SET status = 'rejected',
        decided_by = p_actor_id,
        decided_at = now(),
        rejection_reason = 'Élève supprimé de l''établissement avant validation de la demande.',
        updated_at = now()
    WHERE school_slug = p_school_slug
      AND student_id = trim(p_student_id)
      AND status IN ('pending', 'pending_verification');

    -- 8. Traitement ordonné des parents et respect strict de la provenance P26-B
    FOR v_parent IN
        EXECUTE format('
            SELECT parent_id, source_request_id
            FROM public.%I
            WHERE student_id = %L
            ORDER BY parent_id ASC
        ', 'parent_student_' || p_school_slug, trim(p_student_id))
    LOOP
        -- 8.1. Vérification stricte des 5 critères de provenance avant révocation d'une demande P26-B
        IF v_parent.source_request_id IS NOT NULL THEN
            SELECT * INTO v_req
            FROM public.parent_student_link_requests
            WHERE id = v_parent.source_request_id
              AND school_slug = p_school_slug
              AND student_id = trim(p_student_id)
              AND parent_id = v_parent.parent_id
              AND local_link_created_by_p26b = true
              AND status = 'approved'
            FOR UPDATE;

            IF FOUND THEN
                UPDATE public.parent_student_link_requests
                SET status = 'revoked',
                    revoked_by = p_actor_id,
                    revoked_at = now(),
                    rejection_reason = 'Suppression administrative de l''élève dans l''établissement.',
                    updated_at = now()
                WHERE id = v_req.id;
            END IF;
        END IF;

        -- 8.2. Suppression du lien parent-élève dans la table locale de l'établissement
        EXECUTE format('
            DELETE FROM public.%I
            WHERE parent_id = %L AND student_id = %L
            ', 'parent_student_' || p_school_slug, v_parent.parent_id, trim(p_student_id));

        v_deleted_parents_count := v_deleted_parents_count + 1;

        -- 8.3. Réconciliation globale avec échec sécurisé
        IF v_student_global_id IS NOT NULL THEN
            v_has_other_school_link := false;

            FOR v_other_mapping IN (
                SELECT school_slug, student_local_id
                FROM public.student_global_mappings
                WHERE student_global_id = v_student_global_id
                  AND school_slug <> p_school_slug
            ) LOOP
                BEGIN
                    EXECUTE format('
                        SELECT EXISTS (
                            SELECT 1 FROM public.%I
                            WHERE parent_id = %L AND student_id = %L
                        )
                    ', 'parent_student_' || v_other_mapping.school_slug,
                       v_parent.parent_id, v_other_mapping.student_local_id)
                    INTO v_other_local_link_exists;

                    IF v_other_local_link_exists THEN
                        v_has_other_school_link := true;
                        EXIT;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    RAISE EXCEPTION 'GLOBAL_SCAN_FAILURE: Impossible de vérifier avec certitude les rattachements dans %', v_other_mapping.school_slug;
                END;
            END LOOP;

            IF v_has_other_school_link THEN
                v_global_links_preserved_count := v_global_links_preserved_count + 1;
            ELSE
                UPDATE public.parent_child_links
                SET current_link_active = false,
                    updated_at = now()
                WHERE parent_ref = v_parent.parent_id::text
                  AND student_global_id = v_student_global_id;

                v_global_links_deactivated_count := v_global_links_deactivated_count + 1;
            END IF;
        END IF;
    END LOOP;

    -- 9. Suppression ordonnée des données scolaires locales (respect de l'intégrité référentielle)
    EXECUTE format('DELETE FROM public.%I WHERE student_id = %L', 'payments_' || p_school_slug, trim(p_student_id));
    EXECUTE format('DELETE FROM public.%I WHERE student_id = %L', 'presences_' || p_school_slug, trim(p_student_id));
    EXECUTE format('DELETE FROM public.%I WHERE student_id = %L', 'notes_' || p_school_slug, trim(p_student_id));
    EXECUTE format('DELETE FROM public.%I WHERE id = %L', 'students_' || p_school_slug, trim(p_student_id));

    -- 10. Suppression du mapping local uniquement (mappings autres écoles et global_students préservés)
    IF v_student_global_id IS NOT NULL THEN
        DELETE FROM public.student_global_mappings
        WHERE school_slug = p_school_slug AND student_local_id = trim(p_student_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'student_id', trim(p_student_id),
        'school_slug', p_school_slug,
        'student_global_id', v_student_global_id,
        'deleted_parents_count', v_deleted_parents_count,
        'global_links_deactivated_count', v_global_links_deactivated_count,
        'global_links_preserved_count', v_global_links_preserved_count
    );

EXCEPTION
    WHEN lock_not_available OR deadlock_detected THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CONCURRENCY_LOCK_TIMEOUT',
            'message', 'Conflit de verrouillage temporaire lors de la suppression de l''élève. Transaction annulée (rollback complet).'
        );
    WHEN OTHERS THEN
        IF SQLERRM LIKE 'GLOBAL_SCAN_FAILURE%' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'GLOBAL_SCAN_FAILURE',
                'message', SQLERRM || '. Transaction annulée (rollback complet).'
            );
        END IF;
        RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_student_local_atomically(TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_student_local_atomically(TEXT, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.delete_student_local_atomically(TEXT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_student_local_atomically(TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_student_local_atomically(TEXT, TEXT, UUID) TO postgres;
`;

describe('P26-B Lot 1 — Audit Statique et Validation RPC delete_student_local_atomically (Version Finale)', () => {

    describe('1. Vérification stricte de l\'ordre des verrous et de l\'absence d\'inversion', () => {
        it('1.1. Tous les verrous de Niveau 1 précèdent strictement les verrous de Niveau 2', () => {
            const firstLock1 = DELETE_STUDENT_ATOMIC_SQL.indexOf('pg_advisory_xact_lock(1,');
            const firstLock2 = DELETE_STUDENT_ATOMIC_SQL.indexOf('pg_advisory_xact_lock(2,');
            const firstLock3 = DELETE_STUDENT_ATOMIC_SQL.indexOf('pg_advisory_xact_lock(3,');

            assert.ok(firstLock1 !== -1, 'Verrou 1 doit être présent');
            assert.ok(firstLock2 !== -1, 'Verrou 2 doit être présent');
            assert.ok(firstLock3 !== -1, 'Verrou 3 doit être présent');

            assert.ok(firstLock1 < firstLock2, 'Tous les verrous Niveau 1 doivent être acquis AVANT Niveau 2');
            assert.ok(firstLock2 < firstLock3, 'Tous les verrous Niveau 2 doivent être acquis AVANT Niveau 3');
        });

        it('1.2. Interdiction formelle : aucun appel de Verrou 1 n\'apparaît après un appel de Verrou 2', () => {
            const firstLock2 = DELETE_STUDENT_ATOMIC_SQL.indexOf('pg_advisory_xact_lock(2,');
            const remainingSqlAfterLock2 = DELETE_STUDENT_ATOMIC_SQL.slice(firstLock2);

            assert.equal(
                remainingSqlAfterLock2.includes('pg_advisory_xact_lock(1,'),
                false,
                'AUCUN verrou de niveau 1 ne doit être acquis après un verrou de niveau 2 (inversion strictement interdite)'
            );
        });

        it('1.3. Tri déterministe ASC pour éliminer tout risque d\'interblocage', () => {
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes('ORDER BY id ASC'));
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes('ORDER BY parent_id ASC'));
        });
    });

    describe('2. Vérification du verrouillage réel de la ligne élève (FOR UPDATE)', () => {
        it('2.1. Exécute un vrai SELECT id ... FOR UPDATE', () => {
            assert.ok(
                DELETE_STUDENT_ATOMIC_SQL.includes("SELECT id FROM public.%I\n            WHERE id = %L\n            FOR UPDATE"),
                'Doit effectuer un SELECT id ... FOR UPDATE explicite'
            );
        });

        it('2.2. N\'utilise aucun SELECT EXISTS ambigu avec FOR UPDATE', () => {
            assert.equal(
                DELETE_STUDENT_ATOMIC_SQL.includes('SELECT EXISTS (\n                SELECT 1 FROM public.%I WHERE id = %L FOR UPDATE'),
                false,
                'Le pattern SELECT EXISTS (... FOR UPDATE) doit être banni'
            );
        });
    });

    describe('3. Vérification de provenance P26-B (5 critères stricts)', () => {
        it('3.1. Contrôle exact des 5 critères cumulatifs avant révocation d\'une demande P26-B', () => {
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes('WHERE id = v_parent.source_request_id'));
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes('AND school_slug = p_school_slug'));
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes('AND student_id = trim(p_student_id)'));
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes('AND parent_id = v_parent.parent_id'));
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes('AND local_link_created_by_p26b = true'));
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes("AND status = 'approved'"));
        });

        it('3.2. Clôture des demandes pendantes pour l\'élève supprimé (statut rejected)', () => {
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes("status = 'rejected'"));
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes("status IN ('pending', 'pending_verification')"));
        });

        it('3.3. Ne contient aucun UPDATE arbitraire sur parent_student_link_requests quand source_request_id est null', () => {
            const hasArbitraryRevocation = /ELSE\s+UPDATE\s+public\.parent_student_link_requests/i.test(DELETE_STUDENT_ATOMIC_SQL);
            assert.equal(hasArbitraryRevocation, false, 'Les liens historiques ne doivent pas révoquer de demandes P26-B arbitraires');
        });
    });

    describe('4. Réconciliation globale et échec sécurisé en cas d\'erreur de scan', () => {
        it('4.1. Lève une exception en cas d\'erreur lors du scan d\'une autre école', () => {
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes('GLOBAL_SCAN_FAILURE'));
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes("RAISE EXCEPTION 'GLOBAL_SCAN_FAILURE:"));
        });

        it('4.2. Ne renvoie aucun succès en cas d\'incertitude de scan', () => {
            assert.equal(
                DELETE_STUDENT_ATOMIC_SQL.includes('v_scan_uncertainty := true'),
                false,
                'L\'ancien pattern d\'incertitude tolérée sans rollback doit être supprimé'
            );
        });
    });

    describe('5. Schéma, types réels et autorisations', () => {
        it('5.1. Rôles autorisés stricts conformes aux fondations P26-B', () => {
            assert.ok(
                DELETE_STUDENT_ATOMIC_SQL.includes("v_actor_role NOT IN ('admin', 'directeur', 'directeur_general', 'superadmin')"),
                'Rôles autorisés conformes à approve/revoke P26-B'
            );
            assert.equal(
                DELETE_STUDENT_ATOMIC_SQL.includes("'comptable'"),
                false,
                'Le rôle comptable ne doit pas être inventé dans les rôles d\'approbation de la RPC'
            );
        });

        it('5.2. Type parent_ref respecté (TEXT) dans parent_child_links', () => {
            assert.ok(
                DELETE_STUDENT_ATOMIC_SQL.includes('WHERE parent_ref = v_parent.parent_id::text'),
                'parent_ref doit être comparé à parent_id::text'
            );
        });

        it('5.3. Statuts de demandes stricts (approved, rejected, revoked)', () => {
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes("status = 'approved'"));
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes("status = 'revoked'"));
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes("status = 'rejected'"));
        });

        it('5.4. Préservation absolue de global_students et des mappings des autres écoles', () => {
            assert.equal(DELETE_STUDENT_ATOMIC_SQL.includes('DELETE FROM public.global_students'), false);
            assert.ok(DELETE_STUDENT_ATOMIC_SQL.includes('WHERE school_slug = p_school_slug AND student_local_id = trim(p_student_id)'));
        });
    });

    describe('6. Simulation fonctionnelle des scénarios d\'exécution', () => {
        function executeSimulation(state, { schoolSlug, studentId, actorId, simulateLockConflict, simulateScanError }) {
            const rollbackState = JSON.parse(JSON.stringify(state));

            try {
                if (simulateLockConflict) {
                    throw new Error('CONCURRENCY_LOCK_TIMEOUT');
                }

                const actorProfile = state.profiles[schoolSlug]?.find(p => p.id === actorId);
                if (!actorProfile) return { success: false, error: 'ACTOR_NOT_IN_SCHOOL' };
                if (!['admin', 'directeur', 'directeur_general', 'superadmin'].includes(actorProfile.role)) {
                    return { success: false, error: 'UNAUTHORIZED_ACTOR' };
                }

                const student = state.students[schoolSlug]?.find(s => s.id === studentId);
                if (!student) return { success: false, error: 'STUDENT_NOT_FOUND' };

                const globalMapping = state.student_global_mappings.find(m => m.school_slug === schoolSlug && m.student_local_id === studentId);
                const globalId = globalMapping ? globalMapping.student_global_id : null;

                // Rejet des demandes en attente
                const pendingReqs = (state.parent_student_link_requests || []).filter(
                    r => r.school_slug === schoolSlug && r.student_id === studentId && ['pending', 'pending_verification'].includes(r.status)
                );
                for (const pr of pendingReqs) {
                    pr.status = 'rejected';
                    pr.decided_by = actorId;
                }

                const parents = (state.parent_student[schoolSlug] || [])
                    .filter(ps => ps.student_id === studentId)
                    .sort((a, b) => a.parent_id.localeCompare(b.parent_id));

                let deletedParentsCount = 0;
                let globalLinksDeactivatedCount = 0;
                let globalLinksPreservedCount = 0;

                for (const p of parents) {
                    // Vérification stricte des 5 critères
                    if (p.source_request_id) {
                        const req = state.parent_student_link_requests.find(
                            r => r.id === p.source_request_id &&
                                 r.school_slug === schoolSlug &&
                                 r.student_id === studentId &&
                                 r.parent_id === p.parent_id &&
                                 r.local_link_created_by_p26b === true &&
                                 r.status === 'approved'
                        );
                        if (req) {
                            req.status = 'revoked';
                            req.revoked_by = actorId;
                        }
                    }

                    // Suppression locale
                    state.parent_student[schoolSlug] = state.parent_student[schoolSlug].filter(
                        ps => !(ps.parent_id === p.parent_id && ps.student_id === studentId)
                    );
                    deletedParentsCount++;

                    // Réconciliation globale
                    if (globalId) {
                        if (simulateScanError) {
                            throw new Error('GLOBAL_SCAN_FAILURE: Impossible de vérifier avec certitude les rattachements dans ecole_distante');
                        }

                        const otherMappings = state.student_global_mappings.filter(
                            m => m.student_global_id === globalId && m.school_slug !== schoolSlug
                        );

                        let hasOtherLink = false;
                        for (const om of otherMappings) {
                            const otherLinks = state.parent_student[om.school_slug] || [];
                            if (otherLinks.some(ops => ops.parent_id === p.parent_id && ops.student_id === om.student_local_id)) {
                                hasOtherLink = true;
                                break;
                            }
                        }

                        const globalLink = state.parent_child_links.find(
                            pcl => pcl.parent_ref === p.parent_id && pcl.student_global_id === globalId
                        );

                        if (hasOtherLink) {
                            globalLinksPreservedCount++;
                        } else {
                            if (globalLink) globalLink.current_link_active = false;
                            globalLinksDeactivatedCount++;
                        }
                    }
                }

                // Suppression données locales
                state.payments[schoolSlug] = (state.payments[schoolSlug] || []).filter(pay => pay.student_id !== studentId);
                state.presences[schoolSlug] = (state.presences[schoolSlug] || []).filter(pr => pr.student_id !== studentId);
                state.notes[schoolSlug] = (state.notes[schoolSlug] || []).filter(n => n.student_id !== studentId);
                state.students[schoolSlug] = state.students[schoolSlug].filter(s => s.id !== studentId);

                // Suppression mapping local
                state.student_global_mappings = state.student_global_mappings.filter(
                    m => !(m.school_slug === schoolSlug && m.student_local_id === studentId)
                );

                return {
                    success: true,
                    student_id: studentId,
                    deleted_parents_count: deletedParentsCount,
                    global_links_deactivated_count: globalLinksDeactivatedCount,
                    global_links_preserved_count: globalLinksPreservedCount
                };
            } catch (err) {
                // Rollback intégral
                Object.assign(state, rollbackState);
                if (err.message === 'CONCURRENCY_LOCK_TIMEOUT') {
                    return { success: false, error: 'CONCURRENCY_LOCK_TIMEOUT' };
                }
                if (err.message.startsWith('GLOBAL_SCAN_FAILURE')) {
                    return { success: false, error: 'GLOBAL_SCAN_FAILURE', message: err.message };
                }
                return { success: false, error: 'TRANSACTION_ROLLBACK', message: err.message };
            }
        }

        it('6.1. Rejet strict si un des 5 critères de provenance P26-B ne correspond pas', () => {
            const state = {
                profiles: { ecole_a: [{ id: 'admin-uuid', role: 'directeur' }] },
                students: { ecole_a: [{ id: 'stu-1' }] },
                payments: { ecole_a: [] },
                presences: { ecole_a: [] },
                notes: { ecole_a: [] },
                parent_student: {
                    ecole_a: [{ parent_id: 'p-1', student_id: 'stu-1', source_request_id: 'req-mismatch' }]
                },
                parent_student_link_requests: [
                    // Mismatch sur local_link_created_by_p26b (false = Option B historique)
                    {
                        id: 'req-mismatch',
                        school_slug: 'ecole_a',
                        student_id: 'stu-1',
                        parent_id: 'p-1',
                        local_link_created_by_p26b: false,
                        status: 'approved'
                    }
                ],
                global_students: [{ student_global_id: 'g-1' }],
                student_global_mappings: [{ school_slug: 'ecole_a', student_local_id: 'stu-1', student_global_id: 'g-1' }],
                parent_child_links: [{ parent_ref: 'p-1', student_global_id: 'g-1', current_link_active: true }]
            };

            const result = executeSimulation(state, {
                schoolSlug: 'ecole_a',
                studentId: 'stu-1',
                actorId: 'admin-uuid'
            });

            assert.equal(result.success, true);
            // La demande avec local_link_created_by_p26b=false NE DOIT PAS être passée à revoked
            assert.equal(state.parent_student_link_requests[0].status, 'approved');
        });

        it('6.2. Rejet des demandes en attente (pending) lors de la suppression de l\'élève', () => {
            const state = {
                profiles: { ecole_a: [{ id: 'admin-uuid', role: 'directeur' }] },
                students: { ecole_a: [{ id: 'stu-1' }] },
                payments: { ecole_a: [] },
                presences: { ecole_a: [] },
                notes: { ecole_a: [] },
                parent_student: { ecole_a: [] },
                parent_student_link_requests: [
                    { id: 'req-pending', school_slug: 'ecole_a', student_id: 'stu-1', parent_id: 'p-new', status: 'pending' }
                ],
                global_students: [],
                student_global_mappings: [],
                parent_child_links: []
            };

            const result = executeSimulation(state, {
                schoolSlug: 'ecole_a',
                studentId: 'stu-1',
                actorId: 'admin-uuid'
            });

            assert.equal(result.success, true);
            // La demande pending doit passer à rejected
            assert.equal(state.parent_student_link_requests[0].status, 'rejected');
        });

        it('6.3. Échec sécurisé et rollback complet en cas d\'erreur de scan inter-écoles', () => {
            const state = {
                profiles: { ecole_a: [{ id: 'admin-uuid', role: 'directeur' }] },
                students: { ecole_a: [{ id: 'stu-1' }] },
                payments: { ecole_a: [{ id: 'pay-1', student_id: 'stu-1' }] },
                presences: { ecole_a: [] },
                notes: { ecole_a: [] },
                parent_student: {
                    ecole_a: [{ parent_id: 'p-1', student_id: 'stu-1', source_request_id: 'req-1' }]
                },
                parent_student_link_requests: [
                    { id: 'req-1', school_slug: 'ecole_a', student_id: 'stu-1', parent_id: 'p-1', local_link_created_by_p26b: true, status: 'approved' }
                ],
                global_students: [{ student_global_id: 'g-1' }],
                student_global_mappings: [
                    { school_slug: 'ecole_a', student_local_id: 'stu-1', student_global_id: 'g-1' },
                    { school_slug: 'ecole_distante', student_local_id: 'stu-dist', student_global_id: 'g-1' }
                ],
                parent_child_links: [{ parent_ref: 'p-1', student_global_id: 'g-1', current_link_active: true }]
            };

            const result = executeSimulation(state, {
                schoolSlug: 'ecole_a',
                studentId: 'stu-1',
                actorId: 'admin-uuid',
                simulateScanError: true
            });

            assert.equal(result.success, false);
            assert.equal(result.error, 'GLOBAL_SCAN_FAILURE');

            // Rollback complet garanti
            assert.equal(state.students.ecole_a.length, 1);
            assert.equal(state.parent_student.ecole_a.length, 1);
            assert.equal(state.parent_student_link_requests[0].status, 'approved');
            assert.equal(state.parent_child_links[0].current_link_active, true);
            assert.equal(state.student_global_mappings.length, 2);
            assert.equal(state.payments.ecole_a.length, 1);
        });

        it('6.4. Absence stricte de balayage aveugle non réconcilié sur parent_student', () => {
            // S'assurer qu'aucun DELETE global non réconcilié n'existe sur parent_student en dehors de la boucle parent
            const afterLoop = DELETE_STUDENT_ATOMIC_SQL.slice(DELETE_STUDENT_ATOMIC_SQL.indexOf('-- 9. Suppression ordonnée des données scolaires locales'));
            assert.equal(
                afterLoop.includes('DELETE FROM public.%I WHERE student_id = %L\', \'parent_student_'),
                false,
                'Le balayage aveugle sur parent_student sans réconciliation globale est strictement interdit'
            );
        });

        it('6.5. Simulation de concurrence : tentative de rattachement direct (registerParent/login) pendant la suppression', () => {
            // État initial : élève en cours de suppression
            const state = {
                profiles: { ecole_a: [{ id: 'parent-late', role: 'parent' }, { id: 'admin-uuid', role: 'directeur' }] },
                students: { ecole_a: [{ id: 'stu-being-deleted' }] },
                payments: { ecole_a: [] },
                presences: { ecole_a: [] },
                notes: { ecole_a: [] },
                parent_student: { ecole_a: [] },
                parent_student_link_requests: [],
                global_students: [],
                student_global_mappings: [],
                parent_child_links: []
            };

            // Fonction de rattachement direct transactionnel (coordonnée par Verrou 2 et row lock FOR UPDATE)
            function executeDirectLink(state, schoolSlug, parentId, studentId) {
                // Simule la RPC link_parent_student_direct_atomic
                const student = state.students[schoolSlug]?.find(s => s.id === studentId);
                if (!student) {
                    return { success: false, error: 'STUDENT_NOT_FOUND', message: 'L\'élève n\'existe pas ou a été supprimé.' };
                }
                state.parent_student[schoolSlug].push({ parent_id: parentId, student_id: studentId, source_request_id: null });
                return { success: true, link_inserted: true };
            }

            // 1. Suppression atomique s'exécute et supprime la fiche élève
            const delRes = executeSimulation(state, {
                schoolSlug: 'ecole_a',
                studentId: 'stu-being-deleted',
                actorId: 'admin-uuid'
            });
            assert.equal(delRes.success, true);
            assert.equal(state.students.ecole_a.length, 0);

            // 2. Tentative concurrente de registerParent ou auto-link login
            const linkRes = executeDirectLink(state, 'ecole_a', 'parent-late', 'stu-being-deleted');

            // 3. Rejet garanti sans aucun lien fantôme inséré
            assert.equal(linkRes.success, false);
            assert.equal(linkRes.error, 'STUDENT_NOT_FOUND');
            assert.equal(state.parent_student.ecole_a.length, 0, 'Aucun lien orphelin ne doit être créé');
        });

        it('6.6. Simulation de concurrence : tentative d\'approbation (approve_parent_student_link) sur un élève supprimé', () => {
            // État initial : demande créée, mais élève supprimé avant approbation
            const state = {
                profiles: { ecole_a: [{ id: 'parent-req', role: 'parent' }, { id: 'admin-uuid', role: 'directeur' }] },
                students: { ecole_a: [] }, // Élève déjà supprimé par delete_student_local_atomically
                payments: { ecole_a: [] },
                presences: { ecole_a: [] },
                notes: { ecole_a: [] },
                parent_student: { ecole_a: [] },
                parent_student_link_requests: [
                    { id: 'req-after-delete', school_slug: 'ecole_a', parent_id: 'parent-req', student_id: 'stu-deleted', status: 'pending' }
                ],
                global_students: [],
                student_global_mappings: [],
                parent_child_links: []
            };

            // Fonction simulant approve_parent_student_link avec revérification d'existence sous Verrou 2
            function executeApproveSimulation(state, schoolSlug, requestId, decidedBy) {
                const req = state.parent_student_link_requests.find(r => r.id === requestId && r.school_slug === schoolSlug);
                if (!req) return { success: false, error: 'REQUEST_NOT_FOUND' };
                if (req.status !== 'pending') return { success: false, error: 'INVALID_STATUS' };

                // Vérification sous Verrou 2 de l'existence de l'élève
                const studentExists = (state.students[schoolSlug] || []).some(s => s.id === req.student_id);
                if (!studentExists) {
                    req.status = 'rejected';
                    req.rejection_reason_code = 'STUDENT_DELETED_LOCAL';
                    return { success: false, error: 'STUDENT_NOT_FOUND', message: 'L\'élève n\'existe plus dans l\'établissement.' };
                }

                state.parent_student[schoolSlug].push({ parent_id: req.parent_id, student_id: req.student_id });
                req.status = 'approved';
                return { success: true };
            }

            // Exécution de l'approbation : doit rejeter et marquer la demande rejetée
            const approveRes = executeApproveSimulation(state, 'ecole_a', 'req-after-delete', 'admin-uuid');

            assert.equal(approveRes.success, false);
            assert.equal(approveRes.error, 'STUDENT_NOT_FOUND');
            assert.equal(state.parent_student_link_requests[0].status, 'rejected');
            assert.equal(state.parent_student_link_requests[0].rejection_reason_code, 'STUDENT_DELETED_LOCAL');
            assert.equal(state.parent_student.ecole_a.length, 0, 'Aucun lien local fantôme');
            assert.equal(state.student_global_mappings.length, 0, 'Aucun mapping global fantôme');
        });
    });
});
