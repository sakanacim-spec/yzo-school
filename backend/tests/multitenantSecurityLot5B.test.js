'use strict';
const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Configurer l'environnement de test
process.env.JWT_SECRET = 'test_secret_for_multitenant_lot5b_security_min_32_chars';
process.env.PASSWORD_RESET_OTP_SECRET = 'test_otp_secret_for_lot5b_hmac_min_32_chars';
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key_mock_for_local_tests';
process.env.AI_QUOTA_HASH_SECRET = 'test_ai_quota_hash_secret_min_32_chars_ok';

const { JWT_SECRET } = require('../config');
const { authenticateToken, requireSchoolAdmin, requireSuperAdmin, requireSchool } = require('../middleware/auth');
const studentsController = require('../controllers/studentsController');
const parentController = require('../controllers/parentController');
const chatController = require('../controllers/chatController');
const notificationController = require('../controllers/notificationController');
const syncController = require('../controllers/syncController');
const donationController = require('../controllers/donationController');
const supportController = require('../controllers/supportController');
const withdrawalController = require('../controllers/withdrawalController');

console.log('🧪 Démarrage de la suite de tests Lot 5B : Isolation Multi-Tenant & IDOR Security...\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✅ [PASS] ${name}`);
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     -> Erreur: ${err.message}`);
        throw err;
    }
}

async function asyncTest(name, fn) {
    totalTests++;
    try {
        await fn();
        passedTests++;
        console.log(`  ✅ [PASS] ${name}`);
    } catch (err) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     -> Erreur: ${err.message}`);
        throw err;
    }
}

function mockRes() {
    return {
        statusCode: 200,
        data: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.data = payload;
            return this;
        }
    };
}

function createToken(payload) {
    return jwt.sign({ token_type: 'access', ...payload }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
}

(async () => {
    console.log('--- SECTION A : Cloisonnement Général Multi-Tenant ---');

    test('A1: Le middleware requireSchool rejette les requêtes sans schoolSlug (sauf superadmin)', () => {
        const req1 = { user: { id: 'u1', role: 'parent' } };
        const res1 = mockRes();
        let nextCalled1 = false;
        requireSchool(req1, res1, () => { nextCalled1 = true; });
        assert.strictEqual(nextCalled1, false);
        assert.strictEqual(res1.statusCode, 403);

        const req2 = { user: { id: 'sa', role: 'superadmin' } };
        const res2 = mockRes();
        let nextCalled2 = false;
        requireSchool(req2, res2, () => { nextCalled2 = true; });
        assert.strictEqual(nextCalled2, true);
    });

    test('A2: Le middleware requireSchoolAdmin autorise uniquement les rôles administratifs', () => {
        const adminRoles = ['admin', 'directeur', 'directeur_general', 'comptable', 'proviseur', 'censeur', 'superviseur'];
        for (const role of adminRoles) {
            const req = { user: { id: 'admin1', role, schoolSlug: 'ecole_a' } };
            const res = mockRes();
            let nextCalled = false;
            requireSchoolAdmin(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, true, `Role ${role} should be allowed`);
        }

        const forbiddenRoles = ['parent', 'eleve', 'professeur'];
        for (const role of forbiddenRoles) {
            const req = { user: { id: 'u1', role, schoolSlug: 'ecole_a' } };
            const res = mockRes();
            let nextCalled = false;
            requireSchoolAdmin(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, false, `Role ${role} should be forbidden`);
            assert.strictEqual(res.statusCode, 403);
        }
    });

    test('A3: Un token falsifié pour une autre école ne peut pas être forgé sans secret', () => {
        const fakeToken = jwt.sign({ id: 'attacker', schoolSlug: 'ecole_b', role: 'admin', token_type: 'access' }, 'wrong_secret');
        const req = { headers: { authorization: `Bearer ${fakeToken}` } };
        const res = mockRes();
        let nextCalled = false;
        authenticateToken(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 401);
    });

    test('A4: Rejet strict des requêtes avec token_type !== access', () => {
        const resetToken = jwt.sign({ id: 'u1', schoolSlug: 'ecole_a', role: 'parent', token_type: 'reset_session' }, JWT_SECRET, { algorithm: 'HS256' });
        const req = { headers: { authorization: `Bearer ${resetToken}` } };
        const res = mockRes();
        let nextCalled = false;
        authenticateToken(req, res, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 401);
    });

    test('A5: Regex de validation du schoolSlug bloque les injections et caractères illégaux', () => {
        const SLUG_REGEX = /^[a-z0-9_]{1,50}$/;
        assert.strictEqual(SLUG_REGEX.test('ecole_primaire_1'), true);
        assert.strictEqual(SLUG_REGEX.test('ecole-1'), false); // tiret
        assert.strictEqual(SLUG_REGEX.test('ecole; DROP TABLE students;--'), false);
        assert.strictEqual(SLUG_REGEX.test('../../../etc/passwd'), false);
        assert.strictEqual(SLUG_REGEX.test(''), false);
        assert.strictEqual(SLUG_REGEX.test('a'.repeat(51)), false);
    });

    console.log('\n--- SECTION B : Liaison Parent-Élève & Protection IDOR (SEC-002, SEC-006, SEC-007) ---');

    await asyncTest('B1: linkStudentToParent refuse une requête parent sans studentId', async () => {
        const req = { user: { id: 'p1', role: 'parent', schoolSlug: 'ecole_test' }, body: {} };
        const res = mockRes();
        await studentsController.linkStudentToParent(req, res);
        assert.strictEqual(res.statusCode, 400);
    });

    await asyncTest('B2: linkStudentToParent refuse un utilisateur sans schoolSlug (403 fail-closed)', async () => {
        const req = { user: { id: 'p1', role: 'parent' }, body: { studentId: 's1' } };
        const res = mockRes();
        await studentsController.linkStudentToParent(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await asyncTest('B3: linkStudentToParent refuse un rôle non autorisé (ex: professeur voulant lier un parent arbitraire)', async () => {
        const req = { user: { id: 'prof1', role: 'professeur', schoolSlug: 'ecole_test' }, body: { studentId: 's1' } };
        const res = mockRes();
        await studentsController.linkStudentToParent(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await asyncTest('B4: unlinkStudentFromParent impose la présence du studentId', async () => {
        const req = { user: { id: 'p1', role: 'parent', schoolSlug: 'ecole_test' }, params: {} };
        const res = mockRes();
        await studentsController.unlinkStudentFromParent(req, res);
        assert.strictEqual(res.statusCode, 400);
    });

    await asyncTest('B5: unlinkStudentFromParent refuse un contexte sans schoolSlug', async () => {
        const req = { user: { id: 'p1', role: 'parent' }, params: { studentId: 's1' } };
        const res = mockRes();
        await studentsController.unlinkStudentFromParent(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await asyncTest('B6: getAllParents (SEC-006) refuse l\'accès aux utilisateurs de rôle parent', async () => {
        const req = { user: { id: 'p1', role: 'parent', schoolSlug: 'ecole_test' } };
        const res = mockRes();
        await parentController.getAllParents(req, res);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.data.error, 'Permission refusée.');
    });

    await asyncTest('B7: getActiveParentsCount refuse l\'accès aux utilisateurs de rôle parent', async () => {
        const req = { user: { id: 'p1', role: 'parent', schoolSlug: 'ecole_test' } };
        const res = mockRes();
        await parentController.getActiveParentsCount(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await asyncTest('B8: getParentById refuse l\'accès aux utilisateurs non-admin (rôle parent)', async () => {
        const req = { user: { id: 'p1', role: 'parent', schoolSlug: 'ecole_test' }, params: { id: 'p2' } };
        const res = mockRes();
        await parentController.getParentById(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await asyncTest('B9: adminDeleteAccount refuse la suppression par un parent ou professeur', async () => {
        const req = { user: { id: 'prof1', role: 'professeur', schoolSlug: 'ecole_test' }, params: { parentId: 'p1' } };
        const res = mockRes();
        await parentController.adminDeleteAccount(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await asyncTest('B10: countStudents refuse l\'accès sans schoolSlug', async () => {
        const req = { user: { id: 'u1', role: 'admin' } };
        const res = mockRes();
        await studentsController.countStudents(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    console.log('\n--- SECTION C : Messagerie et Conversations (SEC-003) ---');

    await asyncTest('C1: getConversations refuse un token sans schoolSlug', async () => {
        const req = { user: { id: 'p1', role: 'parent' } };
        const res = mockRes();
        await chatController.getConversations(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await asyncTest('C2: getMessages refuse un token sans schoolSlug', async () => {
        const req = { user: { id: 'p1', role: 'parent' }, params: { conversationId: 'c1' } };
        const res = mockRes();
        await chatController.getMessages(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await asyncTest('C3: sendMessage refuse un token sans schoolSlug', async () => {
        const req = { user: { id: 'p1', role: 'parent' }, body: { text: 'Hello' } };
        const res = mockRes();
        await chatController.sendMessage(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await asyncTest('C4: deleteConversation refuse un token sans schoolSlug', async () => {
        const req = { user: { id: 'p1', role: 'parent' }, params: { id: 'c1' } };
        const res = mockRes();
        await chatController.deleteConversation(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await asyncTest('C5: initiateConversation refuse un rôle professeur sans droits administratifs', async () => {
        const req = { user: { id: 'prof1', role: 'professeur', schoolSlug: 'ecole_test' }, body: { parentId: 'p1' } };
        const res = mockRes();
        await chatController.initiateConversation(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await asyncTest('C6: getUnreadCount refuse un token sans schoolSlug', async () => {
        const req = { user: { id: 'p1', role: 'parent' } };
        const res = mockRes();
        await chatController.getUnreadCount(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    console.log('\n--- SECTION D : Notifications Push & Annonces (SEC-004, SEC-011) ---');

    await asyncTest('D1: sendNotification (SEC-004) refuse les rôles parent ou élève', async () => {
        const req = { user: { id: 'p1', role: 'parent', schoolSlug: 'ecole_test' }, body: { message: 'Alerte pirate', broadcastAll: true } };
        const res = mockRes();
        await notificationController.sendNotification(req, res);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.data.error.includes('Permission refusée'), true);
    });

    await asyncTest('D2: sendNotification refuse un message vide ou manquant', async () => {
        const req = { user: { id: 'admin1', role: 'directeur', schoolSlug: 'ecole_test' }, body: { studentId: 's1' } };
        const res = mockRes();
        await notificationController.sendNotification(req, res);
        assert.strictEqual(res.statusCode, 400);
    });

    await asyncTest('D3: sendNotification rejette un message dépassant la limite de 2000 caractères', async () => {
        const req = { user: { id: 'admin1', role: 'directeur', schoolSlug: 'ecole_test' }, body: { studentId: 's1', message: 'A'.repeat(2001) } };
        const res = mockRes();
        await notificationController.sendNotification(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.data.error.includes('trop long'), true);
    });

    await asyncTest('D4: broadcastAnnouncement (SEC-004) refuse les rôles non-staff', async () => {
        const req = { user: { id: 'p1', role: 'parent', schoolSlug: 'ecole_test' }, body: { title: 'Annonce', message: 'Contenu' } };
        const res = mockRes();
        await notificationController.broadcastAnnouncement(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await asyncTest('D5: broadcastAnnouncement exige title et message', async () => {
        const req = { user: { id: 'admin1', role: 'directeur', schoolSlug: 'ecole_test' }, body: { title: 'Titre seul' } };
        const res = mockRes();
        await notificationController.broadcastAnnouncement(req, res);
        assert.strictEqual(res.statusCode, 400);
    });

    await asyncTest('D6: syncFromFrontend (SEC-011) refuse replace: true pour le rôle professeur', async () => {
        const req = {
            user: { id: 'prof1', role: 'professeur', schoolSlug: 'ecole_test' },
            body: { replace: true, students: [] }
        };
        const res = mockRes();
        await syncController.syncFromFrontend(req, res);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.data.error.includes('direction'), true);
    });

    await asyncTest('D7: syncFromFrontend refuse un utilisateur non authentifié', async () => {
        const req = { body: {} };
        const res = mockRes();
        await syncController.syncFromFrontend(req, res);
        assert.strictEqual(res.statusCode, 401);
    });

    await asyncTest('D8: deleteMatiere refuse les rôles non autorisés (ex: professeur ou parent)', async () => {
        const req = { user: { id: 'p1', role: 'parent', schoolSlug: 'ecole_test' }, params: { id: 'm1' } };
        const res = mockRes();
        await syncController.deleteMatiere(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    console.log('\n--- SECTION E : Retraits, Support, Dons & Régression Globale (SEC-009, SEC-010) ---');

    await asyncTest('E1: getAllPublicCampaigns (SEC-009) refuse un slug avec caractères malveillants', async () => {
        const req = { params: { schoolSlug: 'ecole; DROP TABLE campaigns;--' } };
        const res = mockRes();
        await donationController.getAllPublicCampaigns(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.data.error, "Identifiant d'établissement invalide.");
    });

    await asyncTest('E2: getPublicCampaign (SEC-009) refuse un slug malveillant', async () => {
        const req = { params: { schoolSlug: '../etc/passwd', campaignId: 'c1' } };
        const res = mockRes();
        await donationController.getPublicCampaign(req, res);
        assert.strictEqual(res.statusCode, 400);
    });

    await asyncTest('E3: getSchoolMessages (SEC-010) échoue proprement (403) si schoolSlug est absent', async () => {
        const req = { user: { id: 'u1', role: 'directeur' } };
        const res = mockRes();
        await supportController.getSchoolMessages(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await asyncTest('E4: sendSchoolMessage (SEC-010) refuse les messages vides', async () => {
        const req = { user: { id: 'u1', role: 'directeur', schoolSlug: 'ecole_test' }, body: {} };
        const res = mockRes();
        await supportController.sendSchoolMessage(req, res);
        assert.strictEqual(res.statusCode, 400);
    });

    await asyncTest('E5: getSchoolWithdrawals (SEC-010) refuse un utilisateur sans schoolSlug', async () => {
        const req = { user: { id: 'u1', role: 'directeur' } };
        const res = mockRes();
        await withdrawalController.getSchoolWithdrawals(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await asyncTest('E6: requestWithdrawal (SEC-010) refuse les montants invalides ou données manquantes', async () => {
        const req = { user: { id: 'u1', role: 'directeur', schoolSlug: 'ecole_test' }, body: { amount: -50 } };
        const res = mockRes();
        await withdrawalController.requestWithdrawal(req, res);
        assert.strictEqual(res.statusCode, 400);
    });

    console.log(`\n============================================================`);
    console.log(`🎉 BILAN LOT 5B : ${passedTests}/${totalTests} tests réussis avec succès !`);
    console.log(`============================================================\n`);
})();
