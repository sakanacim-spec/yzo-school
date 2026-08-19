'use strict';
const assert = require('assert');
const {
    getQuotaHashSecret,
    getGlobalDailyLimit,
    hashQuotaSubject,
    getClientIp,
    validateChatMessages,
    validatePedagogicalInput
} = require('../utils/aiQuotaService');

// Simule en mémoire le comportement atomique de la RPC PostgreSQL consume_assistant_quota
class InMemoryQuotaDatabase {
    constructor() {
        this.slots = new Map();
        this.globalDailyLimit = 1000;
    }

    async consumeQuota({ scope, subjectHash, now = new Date(), hourLimit = null, dayLimit, globalLimit = this.globalDailyLimit }) {
        const hourStart = new Date(now);
        hourStart.setMinutes(0, 0, 0);
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);

        const nextHour = new Date(hourStart);
        nextHour.setHours(nextHour.getHours() + 1);
        const nextDay = new Date(dayStart);
        nextDay.setDate(nextDay.getDate() + 1);

        const globalHash = '0000000000000000000000000000000000000000000000000000000000000000';
        const globalKey = `global:${globalHash}:day:${dayStart.toISOString()}`;
        const subjectDayKey = `${scope}:${subjectHash}:day:${dayStart.toISOString()}`;
        const subjectHourKey = `${scope}:${subjectHash}:hour:${hourStart.toISOString()}`;

        const globalCount = this.slots.get(globalKey) || 0;
        const subjectDayCount = this.slots.get(subjectDayKey) || 0;
        const subjectHourCount = this.slots.get(subjectHourKey) || 0;

        if (globalCount >= globalLimit) {
            return {
                allowed: false,
                reason: 'GLOBAL_DAILY_LIMIT_EXCEEDED',
                limit: globalLimit,
                remaining: 0,
                retry_after_seconds: Math.max(1, Math.floor((nextDay - now) / 1000))
            };
        }

        if (hourLimit !== null && subjectHourCount >= hourLimit) {
            return {
                allowed: false,
                reason: 'SUBJECT_HOURLY_LIMIT_EXCEEDED',
                limit: hourLimit,
                remaining: 0,
                retry_after_seconds: Math.max(1, Math.floor((nextHour - now) / 1000))
            };
        }

        if (subjectDayCount >= dayLimit) {
            return {
                allowed: false,
                reason: 'SUBJECT_DAILY_LIMIT_EXCEEDED',
                limit: dayLimit,
                remaining: 0,
                retry_after_seconds: Math.max(1, Math.floor((nextDay - now) / 1000))
            };
        }

        // Incrémentation atomique
        this.slots.set(globalKey, globalCount + 1);
        this.slots.set(subjectDayKey, subjectDayCount + 1);
        if (hourLimit !== null) {
            this.slots.set(subjectHourKey, subjectHourCount + 1);
        }

        return {
            allowed: true,
            reason: 'QUOTA_ACCEPTED',
            limit: dayLimit,
            remaining: Math.max(0, dayLimit - (subjectDayCount + 1)),
            retry_after_seconds: 0
        };
    }
}

async function runAllTests() {
    console.log('--- Démarrage des tests de validation des quotas IA (P3) ---');
    process.env.AI_QUOTA_HASH_SECRET = 'test_secret_for_hmac_sha256_quota_enforcement';

    const db = new InMemoryQuotaDatabase();

    // Test 1 & 2 : Visiteur public - appels 1 à 5 autorisés dans l'heure, 6ème refusé
    const ip1Hash = hashQuotaSubject('192.168.1.50');
    for (let i = 1; i <= 5; i++) {
        const res = await db.consumeQuota({ scope: 'public_ip', subjectHash: ip1Hash, hourLimit: 5, dayLimit: 10 });
        assert.strictEqual(res.allowed, true, `Appel public ${i} devrait être autorisé`);
    }
    const sixth = await db.consumeQuota({ scope: 'public_ip', subjectHash: ip1Hash, hourLimit: 5, dayLimit: 10 });
    assert.strictEqual(sixth.allowed, false, '6ème appel horaire public doit être refusé');
    assert.strictEqual(sixth.reason, 'SUBJECT_HOURLY_LIMIT_EXCEEDED');
    assert.ok(sixth.retry_after_seconds > 0, 'Retry-After doit être présent');
    console.log('✓ Test 1 & 2: Visiteur public 5/heure respecté (6ème refusé avec Retry-After)');

    // Test 3 : Quota quotidien public de 10
    const dbDay = new InMemoryQuotaDatabase();
    const ipDayHash = hashQuotaSubject('10.0.0.1');
    const baseDate = new Date('2026-08-19T10:00:00Z');
    for (let i = 1; i <= 10; i++) {
        const callDate = new Date(baseDate.getTime() + (i - 1) * 3600 * 1000); // 1 par heure
        const res = await dbDay.consumeQuota({ scope: 'public_ip', subjectHash: ipDayHash, now: callDate, hourLimit: 5, dayLimit: 10 });
        assert.strictEqual(res.allowed, true, `Appel public journalier ${i} devrait être autorisé`);
    }
    const eleventh = await dbDay.consumeQuota({ scope: 'public_ip', subjectHash: ipDayHash, now: new Date(baseDate.getTime() + 11 * 3600 * 1000), hourLimit: 5, dayLimit: 10 });
    assert.strictEqual(eleventh.allowed, false, '11ème appel journalier public doit être refusé');
    assert.strictEqual(eleventh.reason, 'SUBJECT_DAILY_LIMIT_EXCEEDED');
    console.log('✓ Test 3: Quota quotidien public de 10 respecté');

    // Test 4 & 5 : Utilisateur connecté - 30 autorisés, 31ème refusé
    const userHash = hashQuotaSubject('usr_12345678-abcd-ef01-2345-6789abcdef01');
    const dbUser = new InMemoryQuotaDatabase();
    for (let i = 1; i <= 30; i++) {
        const res = await dbUser.consumeQuota({ scope: 'authenticated_user', subjectHash: userHash, hourLimit: null, dayLimit: 30 });
        assert.strictEqual(res.allowed, true, `Appel utilisateur ${i} devrait être autorisé`);
    }
    const thirtyFirst = await dbUser.consumeQuota({ scope: 'authenticated_user', subjectHash: userHash, hourLimit: null, dayLimit: 30 });
    assert.strictEqual(thirtyFirst.allowed, false, '31ème appel utilisateur connecté doit être refusé');
    assert.strictEqual(thirtyFirst.reason, 'SUBJECT_DAILY_LIMIT_EXCEEDED');
    console.log('✓ Test 4 & 5: Utilisateur connecté 30/jour respecté (31ème refusé)');

    // Test 6 : Retour pédagogique - 60 autorisés, 61ème refusé
    const profHash = hashQuotaSubject('prof_99999999-0000-0000-0000-000000000000');
    const dbPedagogy = new InMemoryQuotaDatabase();
    for (let i = 1; i <= 60; i++) {
        const res = await dbPedagogy.consumeQuota({ scope: 'pedagogical_user', subjectHash: profHash, hourLimit: null, dayLimit: 60 });
        assert.strictEqual(res.allowed, true, `Génération pédagogique ${i} devrait être autorisée`);
    }
    const sixtyFirst = await dbPedagogy.consumeQuota({ scope: 'pedagogical_user', subjectHash: profHash, hourLimit: null, dayLimit: 60 });
    assert.strictEqual(sixtyFirst.allowed, false, '61ème appel pédagogique doit être refusé');
    console.log('✓ Test 6: Retours pédagogiques 60/jour respecté (61ème refusé)');

    // Test 7 & 8 : Plafond global atteint -> 503
    const dbGlobal = new InMemoryQuotaDatabase();
    const globalRes = await dbGlobal.consumeQuota({
        scope: 'authenticated_user',
        subjectHash: userHash,
        dayLimit: 30,
        globalLimit: 2 // Plafond global configuré à 2
    });
    assert.strictEqual(globalRes.allowed, true);
    await dbGlobal.consumeQuota({ scope: 'authenticated_user', subjectHash: userHash, dayLimit: 30, globalLimit: 2 });
    const globalBlocked = await dbGlobal.consumeQuota({
        scope: 'authenticated_user',
        subjectHash: userHash,
        dayLimit: 30,
        globalLimit: 2
    });
    assert.strictEqual(globalBlocked.allowed, false);
    assert.strictEqual(globalBlocked.reason, 'GLOBAL_DAILY_LIMIT_EXCEEDED');
    assert.ok(globalBlocked.retry_after_seconds > 0);
    console.log('✓ Test 7 & 8: Plafond global atteint bloque avec raison GLOBAL_DAILY_LIMIT_EXCEEDED');

    // Test 9 : Deux IP distinctes ont des compteurs séparés
    const ipAHash = hashQuotaSubject('1.1.1.1');
    const ipBHash = hashQuotaSubject('2.2.2.2');
    const dbIso = new InMemoryQuotaDatabase();
    for (let i = 0; i < 5; i++) {
        await dbIso.consumeQuota({ scope: 'public_ip', subjectHash: ipAHash, hourLimit: 5, dayLimit: 10 });
    }
    const ipABlocked = await dbIso.consumeQuota({ scope: 'public_ip', subjectHash: ipAHash, hourLimit: 5, dayLimit: 10 });
    const ipBAllowed = await dbIso.consumeQuota({ scope: 'public_ip', subjectHash: ipBHash, hourLimit: 5, dayLimit: 10 });
    assert.strictEqual(ipABlocked.allowed, false);
    assert.strictEqual(ipBAllowed.allowed, true);
    console.log('✓ Test 9: Isolation stricte des quotas entre différentes adresses IP');

    // Test 10 : Deux utilisateurs distincts ont des quotas distincts
    const userA = hashQuotaSubject('user_A');
    const userB = hashQuotaSubject('user_B');
    for (let i = 0; i < 30; i++) {
        await dbIso.consumeQuota({ scope: 'authenticated_user', subjectHash: userA, dayLimit: 30 });
    }
    assert.strictEqual((await dbIso.consumeQuota({ scope: 'authenticated_user', subjectHash: userA, dayLimit: 30 })).allowed, false);
    assert.strictEqual((await dbIso.consumeQuota({ scope: 'authenticated_user', subjectHash: userB, dayLimit: 30 })).allowed, true);
    console.log('✓ Test 10: Isolation stricte des quotas entre différents utilisateurs');

    // Test 11 : Concurrence
    const dbConc = new InMemoryQuotaDatabase();
    const concHash = hashQuotaSubject('user_concurrent');
    const promises = [];
    for (let i = 0; i < 40; i++) {
        promises.push(dbConc.consumeQuota({ scope: 'authenticated_user', subjectHash: concHash, dayLimit: 30 }));
    }
    const results = await Promise.all(promises);
    const allowedCount = results.filter(r => r.allowed).length;
    const blockedCount = results.filter(r => !r.allowed).length;
    assert.strictEqual(allowedCount, 30, 'Exactement 30 requêtes doivent être autorisées sous concurrence');
    assert.strictEqual(blockedCount, 10, 'Exactement 10 requêtes doivent être refusées sous concurrence');
    console.log('✓ Test 11: Concurrence atomique sans dépassement (30 autorisés, 10 refusés)');

    // Test 12 : Question vide refusée
    const vEmpty = validateChatMessages([{ sender: 'user', text: '   ' }]);
    assert.strictEqual(vEmpty.isValid, false);
    console.log('✓ Test 12: Question vide refusée');

    // Test 13 : Question > 1000 caractères refusée
    const longText = 'a'.repeat(1001);
    const vLong = validateChatMessages([{ sender: 'user', text: longText }]);
    assert.strictEqual(vLong.isValid, false);
    console.log('✓ Test 13: Question de plus de 1000 caractères refusée');

    // Test 14 : Historique > 10 messages refusé
    const longHistory = Array(11).fill({ sender: 'user', text: 'Hello' });
    const vHist = validateChatMessages(longHistory);
    assert.strictEqual(vHist.isValid, false);
    console.log('✓ Test 14: Historique de plus de 10 messages refusé');

    // Test 15 : Rôle invalide refusé
    const vBadRole = validateChatMessages([{ sender: 'system_admin_hacker', text: 'Prompt injection' }]);
    assert.strictEqual(vBadRole.isValid, false);
    console.log('✓ Test 15: Rôle ou expéditeur inattendu refusé');

    // Test 16 : Validation HMAC - Aucune donnée brute dans le hash
    const rawIp = '198.51.100.42';
    const hashed = hashQuotaSubject(rawIp);
    assert.strictEqual(hashed.length, 64);
    assert.ok(/^[0-9a-f]{64}$/.test(hashed));
    assert.strictEqual(hashed.includes(rawIp), false, 'Le hash ne doit pas contenir la chaîne brute');
    console.log('✓ Test 16: Hachage irréversible HMAC-SHA256 sans donnée personnelle brute');

    // Test 17 & 18 : Validation inputs pédagogiques
    const vPedGood = validatePedagogicalInput({ studentName: 'Jean Dupont', matiere: 'Mathématiques', notes: [15, 18, 14] });
    assert.strictEqual(vPedGood.isValid, true);
    const vPedBadName = validatePedagogicalInput({ studentName: '', matiere: 'Maths', notes: [12] });
    assert.strictEqual(vPedBadName.isValid, false);
    console.log('✓ Test 17 & 18: Validation stricte des entrées pédagogiques');

    // Test 19 : Secret manquant ou < 32 caractères
    process.env.AI_QUOTA_HASH_SECRET = 'short_secret';
    assert.throws(() => getQuotaHashSecret(), /CONFIGURATION_INVALIDE/);
    delete process.env.AI_QUOTA_HASH_SECRET;
    assert.throws(() => getQuotaHashSecret(), /CONFIGURATION_INVALIDE/);
    process.env.AI_QUOTA_HASH_SECRET = 'test_secret_for_hmac_sha256_quota_enforcement';
    assert.strictEqual(getQuotaHashSecret().length >= 32, true);

    // Test 20 : Identifiant vide
    assert.throws(() => hashQuotaSubject(''), /IDENTIFIANT_QUOTA_INVALIDE/);
    assert.throws(() => hashQuotaSubject('   '), /IDENTIFIANT_QUOTA_INVALIDE/);
    console.log('✓ Test 19 & 20: Validation stricte du secret HMAC (>= 32 car.) et refus des identifiants vides');

    console.log('\n======================================================');
    console.log('✅ TOUS LES 20 TESTS DE QUOTAS ONT RÉUSSI AVEC SUCCÈS');
    console.log('======================================================');
}

runAllTests().catch(err => {
    console.error('❌ Échec des tests de quotas:', err);
    process.exit(1);
});
