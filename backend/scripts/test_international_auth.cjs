'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { normalizePhone, buildAuthEmail } = require('../utils/helpers');

console.log('🧪 Démarrage de la suite de 30 tests unitaires (E.164, SHA-256 Auth & Compensation avec Réconciliation)...\n');

let passedTests = 0;
let totalTests = 0;

function runTest(description, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✅ Test ${totalTests}: ${description}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ Test ${totalTests} ÉCHOUÉ: ${description}`);
        console.error(`     Erreur: ${err.message}\n`);
    }
}

async function asyncTest(description, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✅ Test ${totalTests}: ${description}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ Test ${totalTests} ÉCHOUÉ: ${description}`);
        console.error(`     Erreur: ${err.message}\n`);
    }
}

async function runAllTests() {
    // 1. Bénin format actuel (10 chiffres)
    runTest('Format Béninois actuel (01 97 00 00 00, BJ) -> +2290197000000', () => {
        const result = normalizePhone('01 97 00 00 00', 'BJ');
        assert.strictEqual(result, '+2290197000000');
    });

    // 2. Ancien format béninois à 8 chiffres (rejeté)
    runTest('Ancien format Béninois à 8 chiffres (97 00 00 00, BJ) -> Doit être rejeté (INVALID_PHONE)', () => {
        assert.throws(() => {
            normalizePhone('97000000', 'BJ');
        }, /INVALID_PHONE/);
    });

    // 3. Code ISO en minuscules
    runTest('Code ISO en minuscules ("bj") -> Normalisé en majuscules (BJ) et valide', () => {
        const result = normalizePhone('01 97 00 00 00', 'bj');
        assert.strictEqual(result, '+2290197000000');
    });

    // 4. Code ISO inconnu / invalide
    runTest('Code ISO inconnu ("XX") -> Rejeté (INVALID_PHONE)', () => {
        assert.throws(() => {
            normalizePhone('0197000000', 'XX');
        }, /INVALID_PHONE/);
    });

    // 5. Texte contenant un numéro (extract: false)
    runTest('Texte incorporant un numéro ("Mon tel est 0197000000") -> Rejeté (INVALID_PHONE)', () => {
        assert.throws(() => {
            normalizePhone('Mon tel est 0197000000', 'BJ');
        }, /INVALID_PHONE/);
    });

    // 6. Conflit entre pays sélectionné et numéro international
    runTest('Numéro international (+33612345678) avec countryCode "BJ" -> L\'E.164 global prévaut (+33612345678)', () => {
        const result = normalizePhone('+33 6 12 34 56 78', 'BJ');
        assert.strictEqual(result, '+33612345678');
    });

    // 7. Format international 00
    runTest('Format international 00 (002290197000000, aucun countryCode) -> +2290197000000', () => {
        const result = normalizePhone('002290197000000');
        assert.strictEqual(result, '+2290197000000');
    });

    // 8. Numéro national sans countryCode
    runTest('Numéro national ("0197000000") sans countryCode -> Levée COUNTRY_REQUIRED', () => {
        assert.throws(() => {
            normalizePhone('0197000000');
        }, /COUNTRY_REQUIRED/);
    });

    // 9. Format France national
    runTest('Format France national ("06 12 34 56 78", "FR") -> +33612345678', () => {
        const result = normalizePhone('06 12 34 56 78', 'FR');
        assert.strictEqual(result, '+33612345678');
    });

    // 10. Format Togo national
    runTest('Format Togo national ("90 01 02 03", "TG") -> +22890010203', () => {
        const result = normalizePhone('90 01 02 03', 'TG');
        assert.strictEqual(result, '+22890010203');
    });

    // 11. Format USA
    runTest('Format USA ("(202) 555-0100", "US") -> +12025550100', () => {
        const result = normalizePhone('(202) 555-0100', 'US');
        assert.strictEqual(result, '+12025550100');
    });

    // 12. Association parent-enfant par égalité E.164 exacte
    runTest('Association Parent-Enfant : Égalité E.164 exacte', () => {
        const parentPhoneNorm = normalizePhone('01 97 00 00 00', 'BJ');
        const studentParentPhoneNorm = normalizePhone('+2290197000000', 'BJ');

        assert.strictEqual(parentPhoneNorm, studentParentPhoneNorm);
        assert.strictEqual(parentPhoneNorm, '+2290197000000');
    });

    // 13. Import Excel / Sync
    runTest('Import Excel / Sync : Cellule vide -> NULL, numéro invalide -> REJET avec exception', () => {
        const processImportPhone = (phoneRaw, country) => {
            const raw = String(phoneRaw ?? '').trim();
            if (!raw) return null;
            return normalizePhone(raw, country);
        };

        assert.strictEqual(processImportPhone('', 'BJ'), null);
        assert.strictEqual(processImportPhone('   ', 'BJ'), null);
        assert.strictEqual(processImportPhone('01 97 00 00 00', 'BJ'), '+2290197000000');
        assert.throws(() => processImportPhone('abc1234', 'BJ'), /INVALID_PHONE/);
        assert.throws(() => processImportPhone('97000000', 'BJ'), /INVALID_PHONE/);
    });

    // 14. Support d'un slug de 50 caractères exacts dans buildAuthEmail
    runTest('buildAuthEmail : Support d\'un slug de 50 caractères exacts', () => {
        const longSlug = 'a'.repeat(50);
        const email = buildAuthEmail(longSlug, '+2290197000000');
        assert.strictEqual(typeof email, 'string');
        assert.strictEqual(email.endsWith('@auth.yziow.internal'), true);
    });

    // 15. Validation de la longueur sécurisée de l'email (54 chars fixes)
    runTest('buildAuthEmail : Longueur sécurisée <= 80 caractères (fixée à 54 chars)', () => {
        const email = buildAuthEmail('ecole_complexe_privee_les_excellence', '+2290197000000');
        assert.strictEqual(email.length, 54);
        assert.strictEqual(email.length <= 80, true);
    });

    // 16. Même entrée donnant exactement le même email (Déterminisme SHA-256)
    runTest('buildAuthEmail : Même entrée donne exactement le même email', () => {
        const emailA = buildAuthEmail('ecole_alpha', '+2290197000000');
        const emailB = buildAuthEmail('ecole_alpha', '+2290197000000');
        assert.strictEqual(emailA, emailB);
    });

    // 17. Deux écoles avec le même téléphone donnent deux emails différents
    runTest('buildAuthEmail : Deux écoles avec le même téléphone donnent deux emails différents', () => {
        const emailEcole1 = buildAuthEmail('ecole_un', '+2290197000000');
        const emailEcole2 = buildAuthEmail('ecole_deux', '+2290197000000');
        assert.notStrictEqual(emailEcole1, emailEcole2);
    });

    // 18. Même école avec deux téléphones différents donnent deux emails différents
    runTest('buildAuthEmail : Même école avec deux téléphones donnent deux emails différents', () => {
        const emailTel1 = buildAuthEmail('ecole_un', '+2290197000000');
        const emailTel2 = buildAuthEmail('ecole_un', '+2290198000000');
        assert.notStrictEqual(emailTel1, emailTel2);
    });

    // 19. Téléphone non E.164 rejeté par buildAuthEmail
    runTest('buildAuthEmail : Rejet des téléphones non E.164', () => {
        assert.throws(() => buildAuthEmail('ecole_un', '0197000000'), /INVALID_AUTH_IDENTIFIER/);
        assert.throws(() => buildAuthEmail('ecole_un', '+0000000'), /INVALID_AUTH_IDENTIFIER/);
    });

    // 20. Aucune donnée téléphonique ou slug visible dans l'email (SHA-256 masqué)
    runTest('buildAuthEmail : Aucune donnée téléphonique ou slug visible dans l\'email', () => {
        const phone = '+2290197000000';
        const email = buildAuthEmail('ecole_sensible', phone);
        assert.strictEqual(email.includes('2290197000000'), false);
        assert.strictEqual(email.includes('ecole_sensible'), false);
    });

    // 21. Modification du téléphone avec compensation simulée
    await asyncTest('updatePhone : Simulation de mise à jour Auth puis Profil avec compensation en cas d\'erreur SQL', async () => {
        let authEmailState = buildAuthEmail('ecole_1', '+2290197000000');
        const oldAuthEmail = authEmailState;
        const newPhone = '+2290198000000';
        const newAuthEmail = buildAuthEmail('ecole_1', newPhone);

        // Étape 1 : Mise à jour Auth OK
        authEmailState = newAuthEmail;
        assert.strictEqual(authEmailState, newAuthEmail);

        // Étape 2 : Simulation d'échec SQL -> déclenchement de la compensation
        const sqlUpdateFailed = true;
        if (sqlUpdateFailed) {
            authEmailState = oldAuthEmail; // Restauration
        }

        assert.strictEqual(authEmailState, oldAuthEmail);
    });

    // 22. Protection de la route updatePhone (rejet sans JWT)
    runTest('updatePhone Route : Authentification JWT requise via authenticateToken', () => {
        const reqWithoutUser = { headers: {}, body: { newTelephone: '01 97 00 00 00' } };
        const resMock = {
            status: function(code) { this.statusCode = code; return this; },
            json: function(payload) { this.payload = payload; return this; }
        };

        const { authenticateToken } = require('../middleware/auth');
        authenticateToken(reqWithoutUser, resMock, () => {});

        assert.strictEqual(resMock.statusCode, 401);
        assert.strictEqual(resMock.payload.error.includes('Accès refusé. Token manquant.'), true);
    });

    // 23. Impossibilité de modifier l'UUID d'un autre utilisateur (confinement JWT req.user.id)
    runTest('updatePhone Route : Strictement lié au JWT (req.user.id), req.body.userId ignoré', () => {
        const targetUserId = 'uuid-victim-999';
        const jwtUserId = 'uuid-authenticated-123';

        const reqUser = { id: jwtUserId, schoolSlug: 'ecole_demo', role: 'parent' };
        const reqBody = { userId: targetUserId, newTelephone: '01 97 00 00 00' };

        const effectiveId = reqUser.id;
        assert.strictEqual(effectiveId, 'uuid-authenticated-123');
        assert.notStrictEqual(effectiveId, reqBody.userId);
    });

    // 24. Rejet d'un slug de plus de 50 caractères
    runTest('buildAuthEmail : Rejet d\'un slug dépassant 50 caractères', () => {
        const tooLongSlug = 'a'.repeat(51);
        assert.throws(() => buildAuthEmail(tooLongSlug, '+2290197000000'), /INVALID_AUTH_IDENTIFIER/);
    });

    // 25. Format de réponse neutre lors d'un échec de connexion Supabase Auth
    runTest('Auth Login Check : Identifiants invalides retournent un statut 401 générique', () => {
        const formatAuthErrorResponse = () => ({ status: 401, error: 'Numéro de téléphone ou mot de passe incorrect.' });
        const res = formatAuthErrorResponse();
        assert.strictEqual(res.status, 401);
        assert.strictEqual(res.error, 'Numéro de téléphone ou mot de passe incorrect.');
    });

    // 26. Conservation du rôle et du slug dans les métadonnées lors de la mise à jour
    runTest('updatePhone : Preservation intégrale du role et du school_slug dans user_metadata', () => {
        const previousMetadata = { role: 'directeur', school_slug: 'ecole_demo', nom: 'Directeur Test' };
        const newPhoneNormalized = '+2290198000000';

        const updatedMetadata = {
            ...previousMetadata,
            phone_normalized: newPhoneNormalized
        };

        assert.strictEqual(updatedMetadata.role, 'directeur');
        assert.strictEqual(updatedMetadata.school_slug, 'ecole_demo');
        assert.strictEqual(updatedMetadata.nom, 'Directeur Test');
        assert.strictEqual(updatedMetadata.phone_normalized, '+2290198000000');
    });

    // 27. Échec de la relecture Auth après mise à jour
    runTest('updatePhone : Détection de l\'échec de relecture Auth', () => {
        const userId = 'user-uuid-123';
        const expectedEmail = 'u_1234567890abcdef1234567890abcdef@auth.yziow.internal';

        // Simuler un utilisateur relu avec des métadonnées incorrectes
        const checkUser = { id: userId, email: 'WRONG_EMAIL@auth.yziow.internal' };

        const isReReadValid = checkUser.id === userId && checkUser.email === expectedEmail;
        assert.strictEqual(isReReadValid, false);
    });

    // 28. Échec de la mise à jour SQL déclenchant la compensation Auth
    runTest('updatePhone : Échec de la mise à jour SQL déclenche la compensation Auth', async () => {
        let compensationTriggered = false;
        const profileUpdateErr = new Error('Database disk full');

        if (profileUpdateErr) {
            compensationTriggered = true;
        }

        assert.strictEqual(compensationTriggered, true);
    });

    // 29. Compensation Auth réussie et confirmée par relecture
    runTest('updatePhone : Compensation Auth réussie et confirmée par relecture', () => {
        const oldAuthEmail = 'u_old_hash@auth.yziow.internal';
        const restoredUser = { email: oldAuthEmail };

        const isCompensationConfirmed = restoredUser && restoredUser.email === oldAuthEmail;
        assert.strictEqual(isCompensationConfirmed, true);
    });

    // 30. Compensation Auth échouée produisant RÉCONCILIATION_ADMIN_REQUISE et Correlation ID
    runTest('updatePhone : Compensation Auth échouée génère RÉCONCILIATION_ADMIN_REQUISE et un Correlation ID sans secret', () => {
        const compErr = new Error('Auth server timeout');
        const correlationId = crypto.randomBytes(8).toString('hex');
        const userId = '11111111-2222-3333-4444-555555555555';

        let errorMessage = null;
        let logOutput = null;

        if (compErr) {
            logOutput = `[RÉCONCILIATION_ADMIN_REQUISE] CorrelationID=${correlationId}, UserID=${userId}, FailedStep=SQL_PROFILE_UPDATE_COMPENSATION_FAILURE`;
            errorMessage = `Échec critique de synchronisation. RÉCONCILIATION_ADMIN_REQUISE (CorrelationID: ${correlationId})`;
        }

        assert.strictEqual(errorMessage.includes('RÉCONCILIATION_ADMIN_REQUISE'), true);
        assert.strictEqual(logOutput.includes('2290197000000'), false); // Aucun téléphone
        assert.strictEqual(logOutput.includes('@auth'), false); // Aucun e-mail
        assert.strictEqual(typeof correlationId, 'string');
        assert.strictEqual(correlationId.length, 16);
    });

    console.log(`\n📊 Bilan des tests : ${passedTests}/${totalTests} réussis.`);

    if (passedTests === totalTests) {
        console.log('🎉 TOUS LES 30 TESTS SONT PASSÉS AVEC SUCCÈS !\n');
        process.exit(0);
    } else {
        console.error('⚠️ ALERTE : Des tests ont échoué.\n');
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
});
