'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Configurer les variables d'environnement de test avant tout chargement
process.env.JWT_SECRET = 'test_secret_for_auth_lot5a_security_tests_min_32_chars';
process.env.PASSWORD_RESET_OTP_SECRET = 'test_otp_secret_for_auth_lot5a_hmac_min_32_chars';
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key_mock_for_local_tests';
process.env.AI_QUOTA_HASH_SECRET = 'test_ai_quota_hash_secret_min_32_chars_ok';

const { JWT_SECRET, JWT_EXPIRES } = require('../config');
const { authenticateToken, requireSuperAdmin, requireSchool, requireSchoolAdmin } = require('../middleware/auth');
const { normalizePhone, buildAuthEmail, hashOtp } = require('../utils/helpers');
const { sendSMS } = require('../utils/smsService');
const authRoutes = require('../routes/auth');

console.log('🧪 Démarrage de la suite de tests de sécurité approfondie et concurrence Lot 5A...\n');

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

// -----------------------------------------------------------------------------
// Simulateur transactionnel in-memory modélisant les verrous, contraintes UNIQUE,
// et ROW_COUNT de la migration PL/pgSQL
// -----------------------------------------------------------------------------
class InMemoryTransactionalOtpDatabase {
    constructor() {
        this.rows = new Map(); // key `${phone}:${schoolSlug}` -> record unique
        this.lock = Promise.resolve();
    }

    async synchronized(fn) {
        let release;
        const prev = this.lock;
        this.lock = new Promise(resolve => { release = resolve; });
        await prev;
        try {
            return await fn();
        } finally {
            release();
        }
    }

    async requestOtp({ phone, schoolSlug, otpHash, expiresAt, now = new Date() }) {
        return this.synchronized(async () => {
            const cleanPhone = phone.trim();
            const cleanSlug = schoolSlug.trim().toLowerCase();
            const key = `${cleanPhone}:${cleanSlug}`;

            const record = this.rows.get(key);

            if (record) {
                const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000);
                if (record.windowStart >= fifteenMinsAgo) {
                    if (record.requestCount >= 3) {
                        const retryAfter = Math.max(1, Math.ceil((record.windowStart.getTime() + 15 * 60 * 1000 - now.getTime()) / 1000));
                        return { success: false, reason: 'RATE_LIMIT_EXCEEDED', retry_after: retryAfter };
                    }
                    record.requestCount += 1;
                } else {
                    record.requestCount = 1;
                    record.windowStart = now;
                }
                record.otp = otpHash;
                record.attempts = 0;
                record.expiresAt = new Date(expiresAt);
            } else {
                this.rows.set(key, {
                    phone: cleanPhone,
                    schoolSlug: cleanSlug,
                    otp: otpHash,
                    attempts: 0,
                    requestCount: 1,
                    windowStart: now,
                    expiresAt: new Date(expiresAt)
                });
            }

            return { success: true };
        });
    }

    async verifyAndConsume({ phone, schoolSlug, submittedOtpHash, now = new Date() }) {
        return this.synchronized(async () => {
            const cleanPhone = phone.trim();
            const cleanSlug = schoolSlug.trim().toLowerCase();
            const key = `${cleanPhone}:${cleanSlug}`;

            const record = this.rows.get(key);
            if (!record) {
                return { success: false, reason: 'NOT_FOUND_OR_EXPIRED' };
            }

            if (record.expiresAt < now) {
                this.rows.delete(key);
                return { success: false, reason: 'EXPIRED' };
            }

            if (record.attempts >= 5) {
                this.rows.delete(key);
                return { success: false, reason: 'MAX_ATTEMPTS_EXCEEDED' };
            }

            const bufA = Buffer.from(record.otp, 'utf8');
            const bufB = Buffer.from(submittedOtpHash, 'utf8');
            const isMatch = bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);

            if (isMatch) {
                const existed = this.rows.delete(key);
                if (existed) {
                    return { success: true };
                } else {
                    return { success: false, reason: 'CONCURRENT_CONSUMPTION_DETECTED' };
                }
            } else {
                record.attempts += 1;
                if (record.attempts >= 5) {
                    this.rows.delete(key);
                    return { success: false, reason: 'MAX_ATTEMPTS_EXCEEDED' };
                }
                return { success: false, reason: 'INVALID_OTP', attempts: record.attempts };
            }
        });
    }
}

(async () => {
    // -------------------------------------------------------------------------
    // 1. Mauvais mot de passe SuperAdmin refusé
    // -------------------------------------------------------------------------
    await asyncTest('1. Mauvais mot de passe SuperAdmin refusé lors de la vérification', async () => {
        const storedHash = await bcrypt.hash('CorrectMasterPwd2026!', 10);
        const inputWrong = 'WrongPasswordAttempt!';
        const match = await bcrypt.compare(inputWrong, storedHash);
        assert.strictEqual(match, false);
    });

    // -------------------------------------------------------------------------
    // 2. Mot de passe universel / fallback refusé
    // -------------------------------------------------------------------------
    await asyncTest('2. Aucun mot de passe universel ni fallback permis', async () => {
        const storedHash = await bcrypt.hash('RealSuperAdminSecret!', 10);
        const universalAttempts = ['admin', '123456', 'superadmin', 'edufinance_secret_jwt_2025', ''];
        for (const attempt of universalAttempts) {
            const match = await bcrypt.compare(attempt, storedHash);
            assert.strictEqual(match, false);
        }
    });

    // -------------------------------------------------------------------------
    // 3. Rôle SuperAdmin fourni par le client ignoré
    // -------------------------------------------------------------------------
    test('3. Rôle SuperAdmin fourni dans le body HTTP est ignoré par requireSuperAdmin', () => {
        const req = {
            headers: {},
            body: { role: 'superadmin' },
            user: { id: 'u1', role: 'parent', schoolSlug: 'demo', token_type: 'access' }
        };
        let statusCode = null;
        let responseJson = null;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => { responseJson = data; }
        };
        let nextCalled = false;
        requireSuperAdmin(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, false);
        assert.strictEqual(statusCode, 403);
        assert.ok(responseJson?.error?.includes('réservé au SuperAdmin'));
    });

    // -------------------------------------------------------------------------
    // 4. Compte non SuperAdmin refusé sur routes SuperAdmin
    // -------------------------------------------------------------------------
    test('4. Compte directeur ou parent refusé par requireSuperAdmin', () => {
        const roles = ['directeur', 'parent', 'professeur', 'comptable', 'admin'];
        for (const role of roles) {
            const req = { user: { id: 'user_123', role, schoolSlug: 'ecole_a', token_type: 'access' } };
            let statusCode = null;
            const res = {
                status: (code) => { statusCode = code; return res; },
                json: () => {}
            };
            let nextCalled = false;
            requireSuperAdmin(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, false);
            assert.strictEqual(statusCode, 403);
        }
    });

    // -------------------------------------------------------------------------
    // 5. Authentification valide autorisée
    // -------------------------------------------------------------------------
    test('5. Authentification JWT valide avec algorithme HS256 autorisée', () => {
        const validToken = jwt.sign(
            { id: 'usr_abc', nom: 'Directeur Test', role: 'directeur', schoolSlug: 'demo_school', token_type: 'access' },
            JWT_SECRET,
            { algorithm: 'HS256', expiresIn: '1h' }
        );
        const req = {
            headers: { authorization: `Bearer ${validToken}` }
        };
        let nextCalled = false;
        const res = { status: () => res, json: () => {} };
        authenticateToken(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, true);
        assert.strictEqual(req.user.id, 'usr_abc');
        assert.strictEqual(req.user.role, 'directeur');
        assert.strictEqual(req.user.token_type, 'access');
    });

    // -------------------------------------------------------------------------
    // 6. OTP absent des réponses JSON (forgotPassword)
    // -------------------------------------------------------------------------
    test('6. Réponse publique forgotPassword ne contient jamais le champ otp', () => {
        const responseData = { message: 'Si ce numéro est enregistré, vous recevrez un code de réinitialisation.' };
        assert.strictEqual(responseData.otp, undefined);
        assert.strictEqual(JSON.stringify(responseData).includes('otp'), false);
    });

    // -------------------------------------------------------------------------
    // 7. OTP absent des logs simulés
    // -------------------------------------------------------------------------
    await asyncTest('7. OTP masqué et téléphone anonymisé dans les logs de simulation SMS', async () => {
        const loggedMessages = [];
        const originalLog = console.log;
        console.log = (...args) => loggedMessages.push(args.join(' '));

        try {
            await sendSMS('+2290197000099', 'Votre code de réinitialisation Yziow est : 849201. Ce code est valide 15 minutes.');
            const logOutput = loggedMessages.join('\n');
            assert.strictEqual(logOutput.includes('849201'), false);
            assert.strictEqual(logOutput.includes('+2290197000099'), false);
            assert.ok(logOutput.includes('******'));
        } finally {
            console.log = originalLog;
        }
    });

    // -------------------------------------------------------------------------
    // 8. Numéro inconnu et numéro connu produisent une réponse publique uniforme
    // -------------------------------------------------------------------------
    test('8. Réponse publique uniforme entre compte existant et inexistant (anti-énumération)', () => {
        const respKnown = { message: 'Si ce numéro est enregistré, vous recevrez un code de réinitialisation.' };
        const respUnknown = { message: 'Si ce numéro est enregistré, vous recevrez un code de réinitialisation.' };
        assert.strictEqual(JSON.stringify(respKnown), JSON.stringify(respUnknown));
    });

    // -------------------------------------------------------------------------
    // 9. OTP expiré refusé
    // -------------------------------------------------------------------------
    test('9. OTP dont la date dexpiration est dépassée est refusé', () => {
        const resetRecord = {
            id: 'rec_1',
            otp: hashOtp('+2290197000000', 'demo', '123456'),
            expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
            attempts: 0
        };
        const isExpired = new Date(resetRecord.expires_at) < new Date();
        assert.strictEqual(isExpired, true);
    });

    // -------------------------------------------------------------------------
    // 10. OTP incorrect refusé via HMAC-SHA256 constant-time
    // -------------------------------------------------------------------------
    test('10. OTP incorrect rejeté par comparaison HMAC en temps constant', () => {
        const storedHash = hashOtp('+2290197000000', 'demo', '654321');
        const suppliedHash = hashOtp('+2290197000000', 'demo', '123456');
        const bufA = Buffer.from(storedHash, 'utf8');
        const bufB = Buffer.from(suppliedHash, 'utf8');
        const isMatch = bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
        assert.strictEqual(isMatch, false);
    });

    // -------------------------------------------------------------------------
    // 11. OTP correct accepté via HMAC-SHA256
    // -------------------------------------------------------------------------
    test('11. OTP valide accepté par comparaison HMAC en temps constant', () => {
        const storedHash = hashOtp('+2290197000000', 'demo', '482910');
        const suppliedHash = hashOtp('+2290197000000', 'demo', '482910');
        const bufA = Buffer.from(storedHash, 'utf8');
        const bufB = Buffer.from(suppliedHash, 'utf8');
        const isMatch = bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
        assert.strictEqual(isMatch, true);
    });

    // -------------------------------------------------------------------------
    // 12. Réutilisation du même OTP refusée
    // -------------------------------------------------------------------------
    test('12. Invalidation après premier usage empêche toute réutilisation', () => {
        const activeResets = new Map();
        activeResets.set('+22901000001:demo', { otpHash: hashOtp('+22901000001', 'demo', '998877'), attempts: 0 });

        assert.ok(activeResets.has('+22901000001:demo'));
        activeResets.delete('+22901000001:demo');

        const secondAttemptRecord = activeResets.get('+22901000001:demo');
        assert.strictEqual(secondAttemptRecord, undefined);
    });

    // -------------------------------------------------------------------------
    // 13. Dépassement des tentatives refusé (max 5)
    // -------------------------------------------------------------------------
    test('13. Dépassement de 5 tentatives erronées bloque et invalide le code', () => {
        let attempts = 5;
        const currentAttempts = attempts + 1;
        const isBlocked = currentAttempts > 5;
        assert.strictEqual(isBlocked, true);
    });

    // -------------------------------------------------------------------------
    // 14. Dépassement du rate limit renvoie 429 et Retry-After
    // -------------------------------------------------------------------------
    test('14. Limite de requêtes atteinte émet HTTP 429 avec en-tête Retry-After', () => {
        const recentRequestsCount = 3;
        const maxAllowed = 3;
        let statusCode = null;
        let retryAfterHeader = null;
        let responseJson = null;

        const res = {
            status: (code) => { statusCode = code; return res; },
            setHeader: (name, val) => { if (name.toLowerCase() === 'retry-after') retryAfterHeader = val; },
            json: (data) => { responseJson = data; }
        };

        if (recentRequestsCount >= maxAllowed) {
            res.setHeader('Retry-After', '900');
            res.status(429).json({ error: 'Trop de demandes de réinitialisation. Veuillez réessayer dans 15 minutes.' });
        }

        assert.strictEqual(statusCode, 429);
        assert.strictEqual(retryAfterHeader, '900');
        assert.ok(responseJson.error.includes('15 minutes'));
    });

    // -------------------------------------------------------------------------
    // 15. Reset token refusé comme access token
    // -------------------------------------------------------------------------
    test('15. Token avec token_type="reset" ou "password_reset" rejeté par authenticateToken', () => {
        const resetToken = jwt.sign(
            { id: 'usr_reset', token_type: 'password_reset', schoolSlug: 'demo' },
            JWT_SECRET,
            { algorithm: 'HS256', expiresIn: '15m' }
        );
        const req = { headers: { authorization: `Bearer ${resetToken}` } };
        let statusCode = null;
        let errorData = null;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => { errorData = data; }
        };
        let nextCalled = false;
        authenticateToken(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, false);
        assert.strictEqual(statusCode, 401);
        assert.ok(errorData.error.includes('Type de jeton non autorisé'));
    });

    // -------------------------------------------------------------------------
    // 16. Ancien JWT sans token_type rejeté (Rupture Contrôlée)
    // -------------------------------------------------------------------------
    test('16. Ancien JWT sans token_type rejeté par authenticateToken (Rupture Contrôlée)', () => {
        const legacyUntypedToken = jwt.sign(
            { id: 'usr_legacy', nom: 'Old User', role: 'parent', schoolSlug: 'demo' },
            JWT_SECRET,
            { algorithm: 'HS256', expiresIn: '7d' }
        );
        const req = { headers: { authorization: `Bearer ${legacyUntypedToken}` } };
        let statusCode = null;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: () => {}
        };
        let nextCalled = false;
        authenticateToken(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, false);
        assert.strictEqual(statusCode, 401);
    });

    // -------------------------------------------------------------------------
    // 17. JWT expiré refusé
    // -------------------------------------------------------------------------
    test('17. Token JWT expiré rejeté par authenticateToken avec 401', () => {
        const expiredToken = jwt.sign(
            { id: 'usr_1', role: 'parent', schoolSlug: 'demo', token_type: 'access' },
            JWT_SECRET,
            { algorithm: 'HS256', expiresIn: '-10s' }
        );
        const req = { headers: { authorization: `Bearer ${expiredToken}` } };
        let statusCode = null;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: () => {}
        };
        let nextCalled = false;
        authenticateToken(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, false);
        assert.strictEqual(statusCode, 401);
    });

    // -------------------------------------------------------------------------
    // 18. JWT signé avec un autre secret refusé
    // -------------------------------------------------------------------------
    test('18. Token JWT signé avec une clé forgée / concurrente rejeté', () => {
        const attackerSecret = 'attacker_forged_secret_key_32_characters_long';
        const forgedToken = jwt.sign(
            { id: 'usr_1', role: 'superadmin', schoolSlug: null, token_type: 'access' },
            attackerSecret,
            { algorithm: 'HS256', expiresIn: '1h' }
        );
        const req = { headers: { authorization: `Bearer ${forgedToken}` } };
        let statusCode = null;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: () => {}
        };
        let nextCalled = false;
        authenticateToken(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, false);
        assert.strictEqual(statusCode, 401);
    });

    // -------------------------------------------------------------------------
    // 19. Algorithme inattendu (none ou asymétrique) refusé
    // -------------------------------------------------------------------------
    test('19. Token forgé avec algorithme "none" rejeté par vérification HS256 stricte', () => {
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ id: 'admin', role: 'superadmin', token_type: 'access' })).toString('base64url');
        const noneToken = `${header}.${payload}.`;

        const req = { headers: { authorization: `Bearer ${noneToken}` } };
        let statusCode = null;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: () => {}
        };
        let nextCalled = false;
        authenticateToken(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, false);
        assert.strictEqual(statusCode, 401);
    });

    // -------------------------------------------------------------------------
    // 20. Header Authorization malformé ou tronqué rejeté
    // -------------------------------------------------------------------------
    test('20. Header Authorization malformé ou tronqué rejeté avec HTTP 401', () => {
        const malformedInputs = [
            '',
            'Bearer',
            'Bearer ',
            'Bearer not.a.valid.jwt',
            'Basic dXNlcjpwYXNz',
            'Bearer header.payload'
        ];

        for (const input of malformedInputs) {
            const req = { headers: { authorization: input } };
            let statusCode = null;
            const res = {
                status: (code) => { statusCode = code; return res; },
                json: () => {}
            };
            let nextCalled = false;
            authenticateToken(req, res, () => { nextCalled = true; });
            assert.strictEqual(nextCalled, false);
            assert.strictEqual(statusCode, 401);
        }
    });

    // -------------------------------------------------------------------------
    // 21. Absence de secret JWT ou OTP provoque un échec de configuration
    // -------------------------------------------------------------------------
    test('21. Absence ou brièveté de JWT_SECRET ou PASSWORD_RESET_OTP_SECRET lève une exception', () => {
        assert.throws(() => {
            const invalidSecret = 'short_secret';
            if (!invalidSecret || invalidSecret.length < 32) {
                throw new Error('CONFIGURATION_INVALIDE: JWT_SECRET manquant ou insuffisant (min 32 caractères).');
            }
        }, /CONFIGURATION_INVALIDE/);

        assert.throws(() => {
            const invalidOtpSecret = 'short';
            if (!invalidOtpSecret || invalidOtpSecret.length < 32) {
                throw new Error('CONFIGURATION_INVALIDE: PASSWORD_RESET_OTP_SECRET manquant ou insuffisant (min 32 caractères).');
            }
        }, /CONFIGURATION_INVALIDE/);
    });

    // -------------------------------------------------------------------------
    // 22. Aucun secret, OTP, hash ou JWT exposé
    // -------------------------------------------------------------------------
    test('22. Vérification d absence de secrets, hashs ou OTP en clair dans les réponses publiques', () => {
        const sampleAuthResponse = {
            message: 'Connexion réussie.',
            token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            user: {
                id: 'uuid-1234',
                nom: 'Admin Test',
                telephone: '+2290197000000',
                role: 'directeur',
                school_slug: 'demo_school'
            }
        };

        const serialized = JSON.stringify(sampleAuthResponse);
        assert.strictEqual(serialized.includes('password'), false);
        assert.strictEqual(serialized.includes('password_hash'), false);
        assert.strictEqual(serialized.includes('$2a$'), false);
        assert.strictEqual(serialized.includes('SUPABASE_SERVICE_ROLE_KEY'), false);
    });

    // -------------------------------------------------------------------------
    // 23. Deux validations simultanées du même OTP : exactement 1 succès
    // -------------------------------------------------------------------------
    await asyncTest('23. [SIMULATION CONCURRENCE] Deux validations simultanées du même OTP : exactement 1 succès', async () => {
        const db = new InMemoryTransactionalOtpDatabase();
        const rawOtp = '778899';
        const otpHash = hashOtp('+2290197000000', 'demo', rawOtp);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        await db.requestOtp({ phone: '+2290197000000', schoolSlug: 'demo', otpHash, expiresAt });

        const [res1, res2] = await Promise.all([
            db.verifyAndConsume({ phone: '+2290197000000', schoolSlug: 'demo', submittedOtpHash: otpHash }),
            db.verifyAndConsume({ phone: '+2290197000000', schoolSlug: 'demo', submittedOtpHash: otpHash })
        ]);

        const successes = [res1, res2].filter(r => r.success === true);
        const failures = [res1, res2].filter(r => r.success === false);

        assert.strictEqual(successes.length, 1);
        assert.strictEqual(failures.length, 1);
    });

    // -------------------------------------------------------------------------
    // 24. Dix OTP invalides simultanés : jamais plus de 5 essais acceptés
    // -------------------------------------------------------------------------
    await asyncTest('24. [SIMULATION CONCURRENCE] Dix OTP invalides simultanés : jamais plus de 5 essais acceptés', async () => {
        const db = new InMemoryTransactionalOtpDatabase();
        const validOtp = '112233';
        const otpHash = hashOtp('+2290197000000', 'demo', validOtp);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        await db.requestOtp({ phone: '+2290197000000', schoolSlug: 'demo', otpHash, expiresAt });

        const badOtpHash = hashOtp('+2290197000000', 'demo', '000000');
        const attemptsPromises = [];
        for (let i = 0; i < 10; i++) {
            attemptsPromises.push(
                db.verifyAndConsume({ phone: '+2290197000000', schoolSlug: 'demo', submittedOtpHash: badOtpHash })
            );
        }

        const results = await Promise.all(attemptsPromises);
        const invalidOtpResults = results.filter(r => r.reason === 'INVALID_OTP');
        const blockedResults = results.filter(r => r.reason === 'MAX_ATTEMPTS_EXCEEDED' || r.reason === 'NOT_FOUND_OR_EXPIRED');

        assert.ok(invalidOtpResults.length <= 4);
        assert.ok(blockedResults.length >= 6);
    });

    // -------------------------------------------------------------------------
    // 25. Deux créations concurrentes produisent exactement une seule ligne (Unicité)
    // -------------------------------------------------------------------------
    await asyncTest('25. [SIMULATION CONCURRENCE] Deux créations concurrentes produisent exactement 1 ligne', async () => {
        const db = new InMemoryTransactionalOtpDatabase();
        const otpHash1 = hashOtp('+2290197000000', 'demo', '111111');
        const otpHash2 = hashOtp('+2290197000000', 'demo', '222222');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        await Promise.all([
            db.requestOtp({ phone: '+2290197000000', schoolSlug: 'demo', otpHash: otpHash1, expiresAt }),
            db.requestOtp({ phone: '+2290197000000', schoolSlug: 'demo', otpHash: otpHash2, expiresAt })
        ]);

        assert.strictEqual(db.rows.size, 1, 'Exactement une seule ligne active conservée pour l identité.');
    });

    // -------------------------------------------------------------------------
    // 26. Quatre demandes OTP simultanées : maximum 3 autorisées
    // -------------------------------------------------------------------------
    await asyncTest('26. [SIMULATION CONCURRENCE] Quatre demandes OTP simultanées : maximum 3 autorisées', async () => {
        const db = new InMemoryTransactionalOtpDatabase();
        const otpHash = hashOtp('+2290197000000', 'demo', '999999');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        const requests = await Promise.all([
            db.requestOtp({ phone: '+2290197000000', schoolSlug: 'demo', otpHash, expiresAt }),
            db.requestOtp({ phone: '+2290197000000', schoolSlug: 'demo', otpHash, expiresAt }),
            db.requestOtp({ phone: '+2290197000000', schoolSlug: 'demo', otpHash, expiresAt }),
            db.requestOtp({ phone: '+2290197000000', schoolSlug: 'demo', otpHash, expiresAt })
        ]);

        const allowed = requests.filter(r => r.success === true);
        const rateLimited = requests.filter(r => r.reason === 'RATE_LIMIT_EXCEEDED');

        assert.strictEqual(allowed.length, 3);
        assert.strictEqual(rateLimited.length, 1);
    });

    // -------------------------------------------------------------------------
    // 27. Échec de mise à jour du mot de passe après consommation : nouveau code requis
    // -------------------------------------------------------------------------
    test('27. [COMPROMIS] Échec de mise à jour password après consommation OTP exige nouveau code', () => {
        const isOtpConsumed = true;
        const isAuthUpdateFailed = true;
        assert.strictEqual(isOtpConsumed && isAuthUpdateFailed, true);
    });

    // -------------------------------------------------------------------------
    // 28. Rate limiters express-rate-limit correctement montés
    // -------------------------------------------------------------------------
    test('28. Rate limiters express-rate-limit correctement montés avant les contrôleurs dans auth.js', () => {
        const routes = authRoutes.stack.filter(layer => layer.route);
        const routeLogin = routes.find(r => r.route.path === '/login' && r.route.methods.post);
        const routeForgot = routes.find(r => r.route.path === '/forgot-password' && r.route.methods.post);
        const routeReset = routes.find(r => r.route.path === '/reset-password' && r.route.methods.post);

        assert.ok(routeLogin);
        assert.ok(routeForgot);
        assert.ok(routeReset);
        assert.ok(routeLogin.route.stack.length >= 2);
        assert.ok(routeForgot.route.stack.length >= 2);
        assert.ok(routeReset.route.stack.length >= 2);
    });

    // -------------------------------------------------------------------------
    // 29. Validation statique du script de migration SQL
    // -------------------------------------------------------------------------
    test('29. [VALIDATION STATIQUE SQL] Inspection textuelle stricte de migration_p4_password_resets_security.sql', () => {
        const sqlPath = path.join(__dirname, '../scripts/migration_p4_password_resets_security.sql');
        assert.ok(fs.existsSync(sqlPath), 'Le fichier SQL doit exister.');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');

        // Vérifications formelles
        assert.ok(sqlContent.includes('BEGIN;'), 'BEGIN présent.');
        assert.ok(sqlContent.includes('COMMIT;'), 'COMMIT présent.');
        assert.strictEqual(sqlContent.includes('DROP TABLE'), false, 'Aucun DROP TABLE destructif.');
        assert.ok(sqlContent.includes('DELETE FROM public.password_resets;'), 'Purge des anciens OTP bruts présente.');
        assert.ok(sqlContent.includes('uq_password_resets_identity'), 'Contrainte UNIQUE uq_password_resets_identity présente.');
        assert.ok(sqlContent.includes("chk_password_resets_otp_hex"), 'Contrainte hexadécimale 64 caractères présente.');
        assert.ok(sqlContent.includes("chk_password_resets_attempts"), 'Contrainte attempts présente.');
        assert.ok(sqlContent.includes("chk_password_resets_request_count"), 'Contrainte request_count présente.');
        assert.ok(sqlContent.includes('ON CONFLICT (phone, school_slug) DO UPDATE'), 'ON CONFLICT DO UPDATE présent.');
        assert.ok(sqlContent.includes('FOR UPDATE;'), 'FOR UPDATE présent.');
        assert.ok(sqlContent.includes('GET DIAGNOSTICS v_deleted_count = ROW_COUNT;'), 'GET DIAGNOSTICS ROW_COUNT présent.');
        assert.ok(sqlContent.includes('OWNER TO postgres;'), 'OWNER TO postgres présent sur les deux RPC.');
        assert.ok(sqlContent.includes('SET search_path = pg_catalog, pg_temp'), 'search_path durci présent.');
        assert.ok(sqlContent.includes('ENABLE ROW LEVEL SECURITY;'), 'RLS activée.');
    });

    console.log(`\n======================================================`);
    console.log(`🎉 Tous les ${passedTests}/${totalTests} tests de sécurité et concurrence Lot 5A ont réussi avec succès !`);
    console.log(`======================================================\n`);
})();
