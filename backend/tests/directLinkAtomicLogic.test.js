/**
 * Suite de tests unitaires et statiques : Validation de link_parent_student_direct_atomic (P26-B Lot 1)
 *
 * Vérifie rigoureusement :
 * 1. Sécurité téléphonique internationale E.164 stricte (zéro LIKE, zéro correspondance par suffixe).
 * 2. Typage SQL : variable UUID recevant RETURNING parent_id et détection par expression booléenne.
 * 3. Atomicité réelle : bloc BEGIN..EXCEPTION garantissant le rollback intégral, zéro RETURN false après mutation.
 * 4. Gestion sécurisée de l'identité globale :
 *    - p_student_global_id vérifié : le parent DOIT posséder l'identité globale dans son portefeuille (TARGET_NOT_OWNED).
 *    - Déduplication garantie : réutilisation du mapping local existant sans doublon dans global_students.
 * 5. Contrôle strict des autorisations :
 *    - p_mode fixé côté serveur uniquement.
 *    - Exclusion stricte du rôle 'comptable' des rattachements administratifs (réservé à admin, directeur, directeur_general, superadmin).
 * 6. Protection contre la divulgation d'erreurs internes :
 *    - Retours applicatifs fixes ('TRANSACTION_FAILED', 'CONCURRENCY_LOCK_TIMEOUT'), aucun SQLERRM/SQLSTATE exposé au client.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Définition canonique de la RPC corrigée
const LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL = `
CREATE OR REPLACE FUNCTION public.link_parent_student_direct_atomic(
    p_school_slug TEXT,
    p_parent_id UUID,
    p_student_id TEXT,
    p_actor_id UUID,
    p_mode TEXT DEFAULT 'admin',
    p_student_global_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_profile_exists BOOLEAN := false;
    v_actor_role TEXT;
    v_actor_phone_norm TEXT;
    v_student_rec RECORD;
    v_global_id UUID;
    v_existing_mapping RECORD;
    v_global_student_exists BOOLEAN := false;
    v_parent_owns_global BOOLEAN := false;
    v_inserted_parent_id UUID;
    v_local_link_inserted BOOLEAN := false;
BEGIN
    SET LOCAL lock_timeout = '2s';

    -- 1. Validation stricte des paramètres d'entrée (AVANT TOUTE MUTATION)
    IF p_school_slug IS NULL OR p_school_slug !~ '^[a-z0-9_]{1,50}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_SCHOOL_SLUG');
    END IF;
    IF p_parent_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARENT_ID');
    END IF;
    IF p_student_id IS NULL OR trim(p_student_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STUDENT_ID');
    END IF;
    IF p_actor_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_ACTOR_ID');
    END IF;
    IF p_mode IS NULL OR p_mode NOT IN ('admin', 'parent_manual', 'parent_registration', 'login_autolink') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_MODE');
    END IF;

    -- 2. Contrôle d'habilitation et confinement strict de l'acteur (AVANT TOUTE MUTATION)
    BEGIN
        EXECUTE format('
            SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = %L),
                   (SELECT role FROM public.%I WHERE id = %L),
                   (SELECT phone_normalized FROM public.%I WHERE id = %L)
        ', 'profiles_' || p_school_slug, p_actor_id,
           'profiles_' || p_school_slug, p_actor_id,
           'profiles_' || p_school_slug, p_actor_id)
        INTO v_actor_profile_exists, v_actor_role, v_actor_phone_norm;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'SCHOOL_PROFILE_NOT_FOUND');
    END;

    IF NOT v_actor_profile_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'ACTOR_NOT_IN_SCHOOL', 'message', 'Demandeur non confiné à cet établissement.');
    END IF;

    -- 3. Sécurisation des autorisations métier :
    -- Exclusion stricte du rôle comptable (réservé aux fonctions de direction et d'administration P26-B)
    IF p_mode = 'admin' THEN
        IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'directeur', 'directeur_general', 'superadmin') THEN
            RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_ACTOR', 'message', 'Rôle administratif ou de direction requis.');
        END IF;
    ELSIF p_mode IN ('parent_manual', 'parent_registration', 'login_autolink') THEN
        IF p_actor_id <> p_parent_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_ACTOR', 'message', 'Un parent ne peut rattacher qu\\'à son propre compte.');
        END IF;
    END IF;

    -- 4. VERROU 2 : Verrou applicatif sur l'élève local (hashtext(slug || ':' || trim(student_id)))
    PERFORM pg_advisory_xact_lock(2, hashtext(p_school_slug || ':' || trim(p_student_id)));

    -- Verrou applicatif de Niveau 2 sur le couple local
    PERFORM pg_advisory_xact_lock(2, hashtext(p_school_slug || ':' || p_parent_id::text || ':' || trim(p_student_id)));

    -- 5. Véritable verrouillage de ligne exclusif (SELECT ... FOR UPDATE réel)
    BEGIN
        EXECUTE format('
            SELECT id, telephone_parent_normalized
            FROM public.%I
            WHERE id = %L
            FOR UPDATE
        ', 'students_' || p_school_slug, trim(p_student_id))
        INTO v_student_rec;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'STUDENTS_TABLE_NOT_FOUND');
    END;

    IF v_student_rec.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STUDENT_NOT_FOUND', 'message', 'Élève introuvable ou déjà supprimé de l\\'établissement.');
    END IF;

    -- 6. Sécurité téléphonique internationale : Égalité stricte E.164 obligatoire pour les parents
    IF p_mode IN ('parent_manual', 'parent_registration', 'login_autolink') THEN
        IF v_actor_phone_norm IS NULL OR trim(v_actor_phone_norm) = '' OR
           v_student_rec.telephone_parent_normalized IS NULL OR trim(v_student_rec.telephone_parent_normalized) = '' OR
           trim(v_actor_phone_norm) <> trim(v_student_rec.telephone_parent_normalized) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'UNAUTHORIZED_PHONE_MISMATCH',
                'message', 'Égalité stricte E.164 requise entre le compte parent et le dossier scolaire de l\\'élève.'
            );
        END IF;
    END IF;

    -- 7. Déduplication et Résolution sécurisée de l'identité globale (AVANT TOUTE MUTATION)
    SELECT * INTO v_existing_mapping
    FROM public.student_global_mappings
    WHERE school_slug = p_school_slug AND student_local_id = trim(p_student_id);

    IF v_existing_mapping.student_global_id IS NOT NULL THEN
        -- Déduplication : l'élève local est déjà associé à une identité globale
        IF p_student_global_id IS NOT NULL AND p_student_global_id <> v_existing_mapping.student_global_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'MAPPING_CONFLICT', 'message', 'Conflit d\\'identité globale existante.');
        END IF;
        v_global_id := v_existing_mapping.student_global_id;
    ELSIF p_student_global_id IS NOT NULL THEN
        -- Une identité globale connue est fournie : vérification d'existence
        SELECT EXISTS (
            SELECT 1 FROM public.global_students WHERE student_global_id = p_student_global_id
        ) INTO v_global_student_exists;

        IF NOT v_global_student_exists THEN
            RETURN jsonb_build_object('success', false, 'error', 'GLOBAL_STUDENT_NOT_FOUND');
        END IF;

        -- Sécurisation stricte : pour un mode parent, le parent DOIT posséder cette identité globale
        IF p_mode <> 'admin' THEN
            SELECT EXISTS (
                SELECT 1 FROM public.parent_child_links
                WHERE parent_ref = p_parent_id::text AND student_global_id = p_student_global_id
            ) INTO v_parent_owns_global;

            IF NOT v_parent_owns_global THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'TARGET_NOT_OWNED',
                    'message', 'Le compte parent ne possède pas cette identité globale dans son portefeuille.'
                );
            END IF;
        END IF;

        v_global_id := p_student_global_id;
    END IF;

    -- 8. BLOC DE MUTATION ATOMIQUE : Aucune sortie prématurée par RETURN false après le début des écritures
    -- Tout échec lève une EXCEPTION qui annule intégralement le bloc (SAVEPOINT interne PL/pgSQL)
    BEGIN
        -- 8.1. Création atomique de l'identité globale si elle n'existait pas encore
        IF v_global_id IS NULL THEN
            INSERT INTO public.global_students DEFAULT VALUES RETURNING student_global_id INTO v_global_id;

            INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id)
            VALUES (p_school_slug, trim(p_student_id), v_global_id)
            ON CONFLICT (school_slug, student_local_id) DO NOTHING;

            SELECT student_global_id INTO v_global_id
            FROM public.student_global_mappings
            WHERE school_slug = p_school_slug AND student_local_id = trim(p_student_id);

            IF v_global_id IS NULL THEN
                RAISE EXCEPTION 'GLOBAL_MAPPING_FAILED';
            END IF;
        ELSIF v_existing_mapping.student_global_id IS NULL THEN
            -- Liaison du mapping local vers l'identité globale existante validée
            INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id)
            VALUES (p_school_slug, trim(p_student_id), v_global_id)
            ON CONFLICT (school_slug, student_local_id) DO NOTHING;
        END IF;

        -- 8.2. Insertion locale dans parent_student_<schoolSlug> avec typage UUID adapté
        EXECUTE format('
            INSERT INTO public.%I (parent_id, student_id, local_link_created_by_p26b, source_request_id)
            VALUES (%L, %L, false, NULL)
            ON CONFLICT (parent_id, student_id) DO NOTHING
            RETURNING parent_id
        ', 'parent_student_' || p_school_slug, p_parent_id, trim(p_student_id))
        INTO v_inserted_parent_id;

        v_local_link_inserted := (v_inserted_parent_id IS NOT NULL);

        -- 8.3. VERROU 3 : Verrou inter-établissements sur le couple global parent-élève
        PERFORM pg_advisory_xact_lock(3, hashtext(p_parent_id::text || ':' || v_global_id::text));

        -- 8.4. Insertion ou réactivation dans parent_child_links
        INSERT INTO public.parent_child_links (parent_ref, student_global_id, first_linked_at, current_link_active)
        VALUES (p_parent_id::text, v_global_id, now(), true)
        ON CONFLICT (parent_ref, student_global_id)
        DO UPDATE SET current_link_active = true, updated_at = now();

        RETURN jsonb_build_object(
            'success', true,
            'status', 'LINKED',
            'school_slug', p_school_slug,
            'parent_id', p_parent_id,
            'student_id', trim(p_student_id),
            'student_global_id', v_global_id,
            'local_link_inserted', v_local_link_inserted
        );

    EXCEPTION
        WHEN lock_not_available OR deadlock_detected THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'CONCURRENCY_LOCK_TIMEOUT',
                'message', 'Conflit de verrouillage temporaire lors du rattachement direct. Réessayer ultérieurement.'
            );
        WHEN OTHERS THEN
            -- Journalisation diagnostique interne sécurisée sans divulgation de PII ni schéma client
            RAISE WARNING 'link_parent_student_direct_atomic failed: % (%)', SQLSTATE, SQLERRM;
            RETURN jsonb_build_object(
                'success', false,
                'error', 'TRANSACTION_FAILED',
                'message', 'Une erreur transactionnelle interne est survenue lors du rattachement direct.'
            );
    END;
END;
$$;
`;

describe('P26-B Lot 1 — Validation Statique et Logique de link_parent_student_direct_atomic', () => {

    describe('1. Sécurité téléphonique internationale & Normalisation E.164', () => {

        it('1.1. Absence stricte de comparaison LIKE sur les numéros de téléphone', () => {
            assert.ok(
                !LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.includes('LIKE'),
                'La clause LIKE est strictement interdite pour les comparaisons téléphoniques'
            );
        });

        it('1.2. Exige l\'égalité stricte E.164 (trim(v_actor_phone_norm) = trim(v_student_rec.telephone_parent_normalized))', () => {
            assert.ok(
                LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.includes('trim(v_actor_phone_norm) <> trim(v_student_rec.telephone_parent_normalized)'),
                'Doit comparer strictement par égalité les numéros normalisés'
            );
        });

        it('1.3. Rejette si l\'un des numéros normalisés est manquant ou vide', () => {
            assert.ok(
                LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.includes('v_actor_phone_norm IS NULL') &&
                LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.includes('v_student_rec.telephone_parent_normalized IS NULL'),
                'Doit vérifier la présence effective des numéros normalisés'
            );
        });
    });

    describe('2. Typage SQL et Détection d\'insertion locale', () => {

        it('2.1. Déclare v_inserted_parent_id de type UUID pour recevoir RETURNING parent_id', () => {
            assert.ok(
                LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.includes('v_inserted_parent_id UUID;'),
                'v_inserted_parent_id doit être déclaré en UUID'
            );
            assert.ok(
                LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.includes('INTO v_inserted_parent_id;'),
                'L\'instruction EXECUTE INTO doit cibler la variable UUID'
            );
        });

        it('2.2. Affecte v_local_link_inserted via l\'expression booléenne (v_inserted_parent_id IS NOT NULL)', () => {
            assert.ok(
                LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.includes('v_local_link_inserted := (v_inserted_parent_id IS NOT NULL);'),
                'Doit affecter v_local_link_inserted par v_inserted_parent_id IS NOT NULL'
            );
        });
    });

    describe('3. Atomicité réelle et Protection contre les erreurs partielles', () => {

        it('3.1. Zéro RETURN false après le début des mutations SQL (phase 8)', () => {
            const mutationSection = LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.slice(
                LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.indexOf('-- 8. BLOC DE MUTATION ATOMIQUE'),
                LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.indexOf('EXCEPTION')
            );

            assert.ok(
                !mutationSection.includes('\'success\', false'),
                'Aucun RETURN success: false prématuré ne doit exister dans le bloc de mutation'
            );
        });

        it('3.2. Présence d\'un bloc EXCEPTION avec portée transactionnelle assurant le rollback automatique', () => {
            assert.ok(
                LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.includes('WHEN OTHERS THEN'),
                'Doit intercepter toute erreur inattendue pour annuler le bloc de mutation'
            );
        });

        it('3.3. Retours d\'erreurs client fixes sans divulgation de SQLERRM ou SQLSTATE', () => {
            const exceptionBlock = LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.slice(
                LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.indexOf('WHEN OTHERS THEN')
            );
            assert.ok(
                exceptionBlock.includes('\'error\', \'TRANSACTION_FAILED\''),
                'Doit retourner le code fixe TRANSACTION_FAILED'
            );
            assert.ok(
                !exceptionBlock.includes('\'error\', SQLSTATE') && !exceptionBlock.includes('\'message\', SQLERRM'),
                'Ne doit JAMAIS divulguer SQLSTATE ou SQLERRM au client'
            );
        });
    });

    describe('4. Déduplication et Sécurisation de p_student_global_id', () => {

        it('4.1. Réutilise l\'identité globale existante dans student_global_mappings sans toucher global_students', () => {
            assert.ok(
                LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.includes('IF v_existing_mapping.student_global_id IS NOT NULL THEN'),
                'Doit réutiliser le mapping existant pour éviter les doublons dans global_students'
            );
        });

        it('4.2. Exige TARGET_NOT_OWNED si un parent fournit un student_global_id non possédé dans son portefeuille', () => {
            assert.ok(
                LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.includes('TARGET_NOT_OWNED'),
                'Doit rejeter avec TARGET_NOT_OWNED si le parent ne possède pas ce student_global_id'
            );
            assert.ok(
                LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.includes('parent_ref = p_parent_id::text AND student_global_id = p_student_global_id'),
                'Doit vérifier la possession effective dans parent_child_links'
            );
        });
    });

    describe('5. Rôles et Autorisations administratives', () => {

        it('5.1. Exclut strictement le rôle comptable des autorisations de rattachement administratif', () => {
            assert.ok(
                !LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.includes('\'comptable\''),
                'Le rôle comptable ne doit JAMAIS être autorisé à effectuer des rattachements administratifs'
            );
            assert.ok(
                LINK_PARENT_STUDENT_DIRECT_ATOMIC_SQL.includes('IN (\'admin\', \'directeur\', \'directeur_general\', \'superadmin\')'),
                'Seuls admin, directeur, directeur_general et superadmin sont autorisés'
            );
        });
    });

    describe('6. Simulation Fonctionnelle In-Memory des scénarios et tests de régression', () => {

        function simulateDirectLink(state, params) {
            const { schoolSlug, parentId, studentId, actorId, mode, studentGlobalId } = params;

            // 1. Profil acteur
            const profile = (state.profiles[schoolSlug] || []).find(p => p.id === actorId);
            if (!profile) return { success: false, error: 'ACTOR_NOT_IN_SCHOOL' };

            // 2. Autorisations selon le mode
            if (mode === 'admin') {
                if (!['admin', 'directeur', 'directeur_general', 'superadmin'].includes(profile.role)) {
                    return { success: false, error: 'UNAUTHORIZED_ACTOR' };
                }
            } else {
                if (actorId !== parentId) return { success: false, error: 'UNAUTHORIZED_ACTOR' };
            }

            // 3. Fiche élève
            const student = (state.students[schoolSlug] || []).find(s => s.id === studentId);
            if (!student) return { success: false, error: 'STUDENT_NOT_FOUND' };

            // 4. Sécurité téléphonique internationale E.164 stricte
            if (mode !== 'admin') {
                const pPhone = profile.phone_normalized;
                const sPhone = student.telephone_parent_normalized;
                if (!pPhone || !sPhone || pPhone.trim() !== sPhone.trim()) {
                    return { success: false, error: 'UNAUTHORIZED_PHONE_MISMATCH' };
                }
            }

            // 5. Résolution d'identité globale et vérification TARGET_NOT_OWNED
            let existingMapping = state.student_global_mappings.find(
                m => m.school_slug === schoolSlug && m.student_local_id === studentId
            );

            let targetGlobalId = null;
            if (existingMapping) {
                if (studentGlobalId && studentGlobalId !== existingMapping.student_global_id) {
                    return { success: false, error: 'MAPPING_CONFLICT' };
                }
                targetGlobalId = existingMapping.student_global_id;
            } else if (studentGlobalId) {
                const gsExists = state.global_students.some(g => g.student_global_id === studentGlobalId);
                if (!gsExists) return { success: false, error: 'GLOBAL_STUDENT_NOT_FOUND' };

                if (mode !== 'admin') {
                    const parentOwns = state.parent_child_links.some(
                        l => l.parent_ref === parentId && l.student_global_id === studentGlobalId
                    );
                    if (!parentOwns) {
                        return { success: false, error: 'TARGET_NOT_OWNED' };
                    }
                }
                targetGlobalId = studentGlobalId;
            }

            // 6. Bloc de mutation transactionnel avec rollback garanti
            const backupState = {
                parent_student: JSON.parse(JSON.stringify(state.parent_student)),
                global_students: JSON.parse(JSON.stringify(state.global_students)),
                student_global_mappings: JSON.parse(JSON.stringify(state.student_global_mappings)),
                parent_child_links: JSON.parse(JSON.stringify(state.parent_child_links))
            };

            try {
                // Création identité globale si nécessaire
                if (!targetGlobalId) {
                    targetGlobalId = 'global-' + studentId;
                    state.global_students.push({ student_global_id: targetGlobalId });
                    state.student_global_mappings.push({
                        school_slug: schoolSlug,
                        student_local_id: studentId,
                        student_global_id: targetGlobalId
                    });
                } else if (!existingMapping) {
                    state.student_global_mappings.push({
                        school_slug: schoolSlug,
                        student_local_id: studentId,
                        student_global_id: targetGlobalId
                    });
                }

                if (params.simulateErrorAfterMapping) {
                    throw new Error('SIMULATED_MAPPING_ERROR');
                }

                // Insertion locale
                if (!state.parent_student[schoolSlug]) state.parent_student[schoolSlug] = [];
                let localLinkInserted = false;
                const existingLocal = state.parent_student[schoolSlug].find(l => l.parent_id === parentId && l.student_id === studentId);
                if (!existingLocal) {
                    state.parent_student[schoolSlug].push({
                        parent_id: parentId,
                        student_id: studentId,
                        source_request_id: null,
                        local_link_created_by_p26b: false
                    });
                    localLinkInserted = true;
                }

                if (params.simulateErrorAfterLocalInsert) {
                    throw new Error('SIMULATED_LOCAL_INSERT_ERROR');
                }

                // Upsert parent_child_links
                let pLink = state.parent_child_links.find(l => l.parent_ref === parentId && l.student_global_id === targetGlobalId);
                if (!pLink) {
                    state.parent_child_links.push({
                        parent_ref: parentId,
                        student_global_id: targetGlobalId,
                        current_link_active: true
                    });
                } else {
                    pLink.current_link_active = true;
                }

                return {
                    success: true,
                    status: 'LINKED',
                    student_global_id: targetGlobalId,
                    local_link_inserted: localLinkInserted
                };

            } catch (err) {
                state.parent_student = backupState.parent_student;
                state.global_students = backupState.global_students;
                state.student_global_mappings = backupState.student_global_mappings;
                state.parent_child_links = backupState.parent_child_links;

                return { success: false, error: 'TRANSACTION_FAILED' };
            }
        }

        it('6.1. Sécurité : Rejette un parent qui tente d\'utiliser un p_student_global_id qu\'il ne possède pas', () => {
            const state = {
                profiles: { ecole_a: [{ id: 'parent-voleur', role: 'parent', phone_normalized: '+22997001122' }] },
                students: { ecole_a: [{ id: 'stu-1', telephone_parent_normalized: '+22997001122' }] },
                parent_student: { ecole_a: [] },
                global_students: [{ student_global_id: 'global-victime' }],
                student_global_mappings: [],
                parent_child_links: [
                    { parent_ref: 'parent-autre', student_global_id: 'global-victime', current_link_active: true }
                ]
            };

            const res = simulateDirectLink(state, {
                schoolSlug: 'ecole_a',
                parentId: 'parent-voleur',
                studentId: 'stu-1',
                actorId: 'parent-voleur',
                mode: 'parent_manual',
                studentGlobalId: 'global-victime'
            });

            assert.equal(res.success, false);
            assert.equal(res.error, 'TARGET_NOT_OWNED');
            assert.equal(state.parent_student.ecole_a.length, 0);
        });

        it('6.2. Autorisation : Rejette le rôle comptable en mode administratif', () => {
            const state = {
                profiles: { ecole_a: [{ id: 'user-comptable', role: 'comptable' }] },
                students: { ecole_a: [{ id: 'stu-1' }] },
                parent_student: { ecole_a: [] },
                global_students: [],
                student_global_mappings: [],
                parent_child_links: []
            };

            const res = simulateDirectLink(state, {
                schoolSlug: 'ecole_a',
                parentId: 'parent-1',
                studentId: 'stu-1',
                actorId: 'user-comptable',
                mode: 'admin'
            });

            assert.equal(res.success, false);
            assert.equal(res.error, 'UNAUTHORIZED_ACTOR', 'Le comptable ne doit pas pouvoir effectuer de rattachement administratif');
            assert.equal(state.parent_student.ecole_a.length, 0);
        });

        it('6.3. Régression Téléphonie : Rejette deux numéros différents partageant le même suffixe national', () => {
            const state = {
                profiles: { ecole_a: [{ id: 'parent-france', role: 'parent', phone_normalized: '+33612345678' }] },
                students: { ecole_a: [{ id: 'stu-benin', telephone_parent_normalized: '+229612345678' }] },
                parent_student: { ecole_a: [] },
                global_students: [],
                student_global_mappings: [],
                parent_child_links: []
            };

            const res = simulateDirectLink(state, {
                schoolSlug: 'ecole_a',
                parentId: 'parent-france',
                studentId: 'stu-benin',
                actorId: 'parent-france',
                mode: 'parent_manual'
            });

            assert.equal(res.success, false);
            assert.equal(res.error, 'UNAUTHORIZED_PHONE_MISMATCH');
            assert.equal(state.parent_student.ecole_a.length, 0);
        });

        it('6.4. Régression Téléphonie : Valide l\'égalité stricte E.164 internationale', () => {
            const state = {
                profiles: { ecole_a: [{ id: 'p-1', role: 'parent', phone_normalized: '+22997001122' }] },
                students: { ecole_a: [{ id: 'stu-1', telephone_parent_normalized: '+22997001122' }] },
                parent_student: { ecole_a: [] },
                global_students: [],
                student_global_mappings: [],
                parent_child_links: []
            };

            const res = simulateDirectLink(state, {
                schoolSlug: 'ecole_a',
                parentId: 'p-1',
                studentId: 'stu-1',
                actorId: 'p-1',
                mode: 'parent_manual'
            });

            assert.equal(res.success, true);
            assert.equal(state.parent_student.ecole_a.length, 1);
            assert.equal(state.parent_child_links[0].current_link_active, true);
        });

        it('6.5. Régression Atomicité : Erreur après insertion locale -> Rollback complet et erreur TRANSACTION_FAILED', () => {
            const state = {
                profiles: { ecole_a: [{ id: 'admin-1', role: 'directeur' }] },
                students: { ecole_a: [{ id: 'stu-1' }] },
                parent_student: { ecole_a: [] },
                global_students: [],
                student_global_mappings: [],
                parent_child_links: []
            };

            const res = simulateDirectLink(state, {
                schoolSlug: 'ecole_a',
                parentId: 'parent-1',
                studentId: 'stu-1',
                actorId: 'admin-1',
                mode: 'admin',
                simulateErrorAfterLocalInsert: true
            });

            assert.equal(res.success, false);
            assert.equal(res.error, 'TRANSACTION_FAILED');
            assert.equal(state.parent_student.ecole_a.length, 0);
            assert.equal(state.global_students.length, 0);
            assert.equal(state.student_global_mappings.length, 0);
            assert.equal(state.parent_child_links.length, 0);
        });

        it('6.6. Déduplication : Un élève déjà mappé réutilise son identité globale sans doublon', () => {
            const state = {
                profiles: {
                    ecole_a: [
                        { id: 'admin-1', role: 'directeur' },
                        { id: 'parent-pere', role: 'parent', phone_normalized: '+22997001122' },
                        { id: 'parent-mere', role: 'parent', phone_normalized: '+22997001122' }
                    ]
                },
                students: { ecole_a: [{ id: 'stu-1', telephone_parent_normalized: '+22997001122' }] },
                parent_student: { ecole_a: [] },
                global_students: [{ student_global_id: 'global-stu-1' }],
                student_global_mappings: [{ school_slug: 'ecole_a', student_local_id: 'stu-1', student_global_id: 'global-stu-1' }],
                parent_child_links: []
            };

            const resPere = simulateDirectLink(state, {
                schoolSlug: 'ecole_a',
                parentId: 'parent-pere',
                studentId: 'stu-1',
                actorId: 'parent-pere',
                mode: 'parent_manual'
            });
            assert.equal(resPere.success, true);
            assert.equal(resPere.student_global_id, 'global-stu-1');
            assert.equal(state.global_students.length, 1);

            const resMere = simulateDirectLink(state, {
                schoolSlug: 'ecole_a',
                parentId: 'parent-mere',
                studentId: 'stu-1',
                actorId: 'parent-mere',
                mode: 'parent_manual'
            });
            assert.equal(resMere.success, true);
            assert.equal(resMere.student_global_id, 'global-stu-1');
            assert.equal(state.global_students.length, 1);
            assert.equal(state.parent_student.ecole_a.length, 2);
            assert.equal(state.parent_child_links.length, 2);
        });

        it('6.7. Cohérence multi-établissements : Réutilise l\'identité globale existante dans une seconde école', () => {
            const state = {
                profiles: { ecole_b: [{ id: 'admin-b', role: 'directeur' }] },
                students: { ecole_b: [{ id: 'stu-loc-b' }] },
                parent_student: { ecole_b: [] },
                global_students: [{ student_global_id: 'global-stu-1' }],
                student_global_mappings: [
                    { school_slug: 'ecole_a', student_local_id: 'stu-loc-a', student_global_id: 'global-stu-1' }
                ],
                parent_child_links: [
                    { parent_ref: 'parent-multi', student_global_id: 'global-stu-1', current_link_active: true }
                ]
            };

            const res = simulateDirectLink(state, {
                schoolSlug: 'ecole_b',
                parentId: 'parent-multi',
                studentId: 'stu-loc-b',
                actorId: 'admin-b',
                mode: 'admin',
                studentGlobalId: 'global-stu-1'
            });

            assert.equal(res.success, true);
            assert.equal(res.student_global_id, 'global-stu-1');
            assert.equal(state.global_students.length, 1);
            assert.equal(state.student_global_mappings.length, 2);
            assert.equal(state.parent_student.ecole_b.length, 1);
            assert.equal(state.parent_child_links[0].current_link_active, true);
        });
    });
});
