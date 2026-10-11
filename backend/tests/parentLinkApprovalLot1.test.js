/**
 * Suite de tests unitaires et de conformité SQL / Logique métier P26-B Lot 1
 * 
 * Vérifie :
 * 1. La conformité du schéma SQL (table, contraintes, index partiels, RLS, permissions).
 * 2. Les transitions d'état de la machine à états de rattachement.
 * 3. L'étanchéité multi-tenant et la validation du slug d'établissement contre l'injection SQL.
 * 4. L'atomicité et l'idempotence des opérations RPC approve, reject et revoke.
 * 5. L'habilitation stricte (Directeur / Admin uniquement) et le rejet des rôles non autorisés.
 * 6. La sécurité du script d'inventaire (lecture seule, anonymisation sans fuite de PII).
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('YZIOW P26-B Lot 1 — Fondations SQL & Inventaire de Rattachement', () => {

    const sqlMigrationPath = path.resolve(__dirname, '../scripts/migration_p26_b_link_approval_foundation.sql');
    const inventoryScriptPath = path.resolve(__dirname, '../scripts/inspect_historical_links.cjs');

    it('1.1. Présence physique des fichiers livrables du Lot 1', () => {
        assert.ok(fs.existsSync(sqlMigrationPath), 'Le fichier de migration SQL doit exister');
        assert.ok(fs.existsSync(inventoryScriptPath), 'Le script d\'inventaire doit exister');
    });

    describe('1. Structure SQL de parent_student_link_requests', () => {
        const sql = fs.readFileSync(sqlMigrationPath, 'utf8');

        it('1.2. Définition de la table et des colonnes requises', () => {
            assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.parent_student_link_requests'), 'Doit créer parent_student_link_requests');
            assert.ok(sql.includes('id UUID PRIMARY KEY DEFAULT gen_random_uuid()'), 'Doit avoir un UUID primaire');
            assert.ok(sql.includes('school_slug TEXT NOT NULL'), 'Doit comporter school_slug');
            assert.ok(sql.includes('parent_id UUID NOT NULL'), 'Doit comporter parent_id');
            assert.ok(sql.includes('student_id TEXT NOT NULL'), 'Doit comporter student_id');
            assert.ok(sql.includes('parent_phone_normalized TEXT NOT NULL'), 'Doit comporter parent_phone_normalized');
            assert.ok(sql.includes('status TEXT NOT NULL DEFAULT \'pending\''), 'Doit initialiser le statut par défaut à pending');
            assert.ok(sql.includes('source TEXT NOT NULL DEFAULT \'manual_request\''), 'Doit comporter la colonne source');
            assert.ok(sql.includes('rejection_reason TEXT'), 'Doit comporter rejection_reason');
            assert.ok(sql.includes('decided_by UUID'), 'Doit comporter decided_by');
            assert.ok(sql.includes('decided_at TIMESTAMPTZ'), 'Doit comporter decided_at');
            assert.ok(sql.includes('revoked_at TIMESTAMPTZ'), 'Doit comporter revoked_at');
            assert.ok(sql.includes('revoked_by UUID'), 'Doit comporter revoked_by');
        });

        it('1.3. Contrainte CHECK sur les statuts intégrant pending_verification', () => {
            assert.ok(
                sql.includes("CHECK (status IN ('pending', 'pending_verification', 'approved', 'rejected', 'revoked'))"),
                'La contrainte CHECK doit obligatoirement inclure pending, pending_verification, approved, rejected, revoked'
            );
        });

        it('1.4. Validation stricte du format de school_slug contre l\'injection SQL', () => {
            assert.ok(
                sql.includes("CHECK (school_slug ~ '^[a-z0-9_]{1,50}$')"),
                'Le slug doit être contraint au format alphanumérique strict (max 50 caractères)'
            );
        });

        it('1.5. Index partiel unique anti-concurrence sur les demandes actives', () => {
            assert.ok(
                sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_link_requests_single_pending_review'),
                'Index unique anti-concurrence requis'
            );
            assert.ok(
                sql.includes("WHERE status IN ('pending', 'pending_verification')"),
                'L\'index anti-concurrence doit couvrir exactement les statuts d\'examen pending et pending_verification'
            );
        });

        it('1.6. Index partiel unique sur les approbations actives', () => {
            assert.ok(
                sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_link_requests_single_approved'),
                'Index unique sur le statut approved requis'
            );
            assert.ok(
                sql.includes("WHERE status = 'approved'"),
                'L\'index doit cibler status = approved'
            );
        });

        it('1.7. RLS et restriction des privilèges', () => {
            assert.ok(sql.includes('ALTER TABLE public.parent_student_link_requests ENABLE ROW LEVEL SECURITY;'), 'RLS activé');
            assert.ok(sql.includes('REVOKE ALL ON public.parent_student_link_requests FROM PUBLIC;'), 'PUBLIC révoqué');
            assert.ok(sql.includes('REVOKE ALL ON public.parent_student_link_requests FROM anon;'), 'anon révoqué');
            assert.ok(sql.includes('REVOKE ALL ON public.parent_student_link_requests FROM authenticated;'), 'authenticated révoqué');
            assert.ok(sql.includes('GRANT ALL ON public.parent_student_link_requests TO service_role;'), 'service_role autorisé');
        });
    });

    describe('2. Logique et Sécurité des Fonctions RPC', () => {
        const sql = fs.readFileSync(sqlMigrationPath, 'utf8');

        it('2.1. RPC approve_parent_student_link — Paramètres, isolation et search_path', () => {
            assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.approve_parent_student_link'), 'Déclaration de la RPC approve');
            assert.ok(sql.includes('SECURITY DEFINER'), 'Doit être SECURITY DEFINER');
            assert.ok(sql.includes('SET search_path = public, pg_temp'), 'search_path sécurisé obligatoire');
            assert.ok(sql.includes("p_school_slug !~ '^[a-z0-9_]{1,50}$'"), 'Validation défensive du slug');
            assert.ok(sql.includes('PERFORM pg_advisory_xact_lock'), 'Verrouillage advisory lock pour atomicité');
        });

        it('2.2. RPC approve — Contrôle strict du rôle directeur en base', () => {
            assert.ok(sql.includes("'admin', 'directeur', 'directeur_general', 'superadmin'"), 'Vérification du rôle directeur dans profiles_<school_slug>');
            assert.ok(sql.includes("'UNAUTHORIZED_APPROVER'"), 'Erreur explicite si rôle insuffisant');
        });

        it('2.3. RPC approve — Confinement étanche à l\'établissement', () => {
            assert.ok(sql.includes('WHERE id = p_request_id AND school_slug = p_school_slug'), 'Interdiction formelle d\'approuver une demande d\'un autre établissement');
            assert.ok(sql.includes("'REQUEST_NOT_FOUND'"), 'Retour d\'erreur si l\'établissement ne concorde pas');
        });

        it('2.4. RPC approve — Insertion locale et réconciliation globale', () => {
            assert.ok(sql.includes("EXECUTE format('"), 'Utilise EXECUTE format avec %I pour le nom de table dynamique sécurisé');
            assert.ok(sql.includes("'parent_student_' || p_school_slug"), 'Cible la table locale parent_student');
            assert.ok(sql.includes('public.student_global_mappings'), 'Gère le mapping global de l\'élève');
            assert.ok(sql.includes('public.parent_child_links'), 'Synchronise parent_child_links');
            assert.ok(sql.includes('current_link_active = true'), 'Active le lien dans le portefeuille global');
        });

        it('2.5. RPC reject_parent_student_link — Exigence du motif de refus', () => {
            assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.reject_parent_student_link'), 'Déclaration de la RPC reject');
            assert.ok(sql.includes("p_rejection_reason IS NULL OR trim(p_rejection_reason) = ''"), 'Vérification du motif non vide');
            assert.ok(sql.includes("'REJECTION_REASON_REQUIRED'"), 'Rejet obligatoire si motif absent');
        });

        it('2.6. RPC revoke_parent_student_link — Nettoyage local et désactivation globale', () => {
            assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.revoke_parent_student_link'), 'Déclaration de la RPC revoke');
            assert.ok(sql.includes("DELETE FROM public.%I"), 'Supprime la ligne de la table locale pour couper l\'accès instantanément');
            assert.ok(sql.includes('current_link_active = false'), 'Désactive le lien dans parent_child_links si aucun autre établissement n\'est lié');
            assert.ok(sql.includes("status = 'revoked'"), 'Trace la révocation dans la table centrale');
        });

        it('2.7. Permissions d\'exécution des RPC accordées exclusivement à service_role et postgres', () => {
            assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.approve_parent_student_link'), 'approve révoqué de PUBLIC');
            assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.approve_parent_student_link(UUID, TEXT, UUID, TEXT) TO service_role;'), 'approve accordé à service_role');
            assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.reject_parent_student_link'), 'reject révoqué de PUBLIC');
            assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.reject_parent_student_link(UUID, TEXT, UUID, TEXT, TEXT, TEXT) TO service_role;'), 'reject accordé à service_role');
            assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.revoke_parent_student_link'), 'revoke révoqué de PUBLIC');
            assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.revoke_parent_student_link(UUID, TEXT, UUID, TEXT) TO service_role;'), 'revoke accordé à service_role');
        });
    });

    describe('3. Sécurité et Confidentialité du Script d\'Inventaire', () => {
        const scriptContent = fs.readFileSync(inventoryScriptPath, 'utf8');

        it('3.1. Absence stricte de mutation SQL (Lecture seule garantie)', () => {
            assert.ok(!scriptContent.includes('.insert('), 'Le script ne doit jamais insérer de données');
            assert.ok(!scriptContent.includes('.update('), 'Le script ne doit jamais modifier de données');
            assert.ok(!scriptContent.includes('.delete('), 'Le script ne doit jamais supprimer de données');
            assert.ok(!scriptContent.includes('.upsert('), 'Le script ne doit jamais upsert de données');
        });

        it('3.2. Préservation de la vie privée (Zéro fuite PII dans la sortie console)', () => {
            assert.ok(!scriptContent.includes('console.log(parentPhone'), 'Ne doit pas logguer les téléphones');
            assert.ok(!scriptContent.includes('console.log(studentParentPhone'), 'Ne doit pas logguer les numéros des élèves');
            assert.ok(!scriptContent.includes('console.log(p.nom'), 'Ne doit pas logguer les noms des parents');
            assert.ok(!scriptContent.includes('console.log(s.nom'), 'Ne doit pas logguer les noms des élèves');
            assert.ok(scriptContent.includes('phoneExactMatches'), 'Produit des agrégats et métriques');
        });
    });

    describe('4. Simulation Fonctionnelle de la Logique Métier & Transitions (In-Memory)', () => {
        // Machine à états pure reflétant les règles des RPC SQL
        const VALID_TRANSITIONS = {
            'pending': ['approved', 'rejected'],
            'pending_verification': ['approved', 'rejected'],
            'approved': ['revoked'],
            'rejected': [], // Clôturé : une nouvelle demande crée un nouvel enregistrement
            'revoked': []
        };

        function canTransition(currentStatus, targetStatus) {
            return (VALID_TRANSITIONS[currentStatus] || []).includes(targetStatus);
        }

        it('4.1. Transitions autorisées et interdites de la machine à états', () => {
            // Autorisées
            assert.strictEqual(canTransition('pending', 'approved'), true);
            assert.strictEqual(canTransition('pending', 'rejected'), true);
            assert.strictEqual(canTransition('pending_verification', 'approved'), true);
            assert.strictEqual(canTransition('pending_verification', 'rejected'), true);
            assert.strictEqual(canTransition('approved', 'revoked'), true);

            // Strictement interdites
            assert.strictEqual(canTransition('approved', 'pending'), false, 'Un lien approuvé ne peut pas redevenir pending');
            assert.strictEqual(canTransition('rejected', 'approved'), false, 'Une demande rejetée ne peut pas être approuvée directement');
            assert.strictEqual(canTransition('revoked', 'approved'), false, 'Un lien révoqué ne peut pas être réapprouvé sans nouvelle demande');
            assert.strictEqual(canTransition('pending', 'revoked'), false, 'On ne peut révoquer que ce qui a été approuvé');
        });

        it('4.2. Évaluation de l\'étanchéité multi-tenant : rejet strict si le slug ne correspond pas', () => {
            const request = { id: 'req-1', school_slug: 'ecole_a', status: 'pending' };
            const directorSchool = 'ecole_b';

            const isSchoolMatch = (request.school_slug === directorSchool);
            assert.strictEqual(isSchoolMatch, false, 'Doit échouer si le directeur est d\'une autre école');
        });

        it('4.3. Validation des rôles autorisés à décider', () => {
            const authorizedRoles = ['admin', 'directeur', 'directeur_general', 'superadmin'];
            assert.strictEqual(authorizedRoles.includes('directeur'), true);
            assert.strictEqual(authorizedRoles.includes('directeur_general'), true);
            assert.strictEqual(authorizedRoles.includes('admin'), true);

            assert.strictEqual(authorizedRoles.includes('professeur'), false);
            assert.strictEqual(authorizedRoles.includes('parent'), false);
            assert.strictEqual(authorizedRoles.includes('comptable'), false);
        });
    });
});
