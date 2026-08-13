'use strict';

const assert = require('assert');
const { normalizePhone } = require('../utils/helpers');

console.log('🧪 Démarrage des tests de normalisation et d\'authentification E.164...\n');

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

// 1. Bénin format actuel (10 chiffres)
runTest('Format Béninois actuel (01 97 00 00 00, BJ) -> +2290197000000', () => {
    const result = normalizePhone('01 97 00 00 00', 'BJ');
    assert.strictEqual(result, '+2290197000000');
});

// 2. Ancien format béninois à 8 chiffres (rejeté car le plan de numérotation béninois impose 10 chiffres)
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

// 12. Test d'association parent-enfant par égalité E.164 exacte
runTest('Association Parent-Enfant : Égalité E.164 exacte', () => {
    const parentPhoneNorm = normalizePhone('01 97 00 00 00', 'BJ');
    const studentParentPhoneNorm = normalizePhone('+2290197000000', 'BJ');
    
    assert.strictEqual(parentPhoneNorm, studentParentPhoneNorm);
    assert.strictEqual(parentPhoneNorm, '+2290197000000');
});

// 13. Test de traitement pour import Excel / Sync (cellule vide -> NULL, numéro invalide -> REJET/QUARANTAINE)
runTest('Import Excel / Sync : Cellule vide -> NULL, numéro invalide -> REJET avec exception', () => {
    const processImportPhone = (phoneRaw, country) => {
        const raw = String(phoneRaw ?? '').trim();
        if (!raw) return null; // Cellule vide -> NULL
        return normalizePhone(raw, country); // Levée d'exception si invalide (quarantaine/rejet de la ligne)
    };

    // Cellule vide -> NULL (Acceptée)
    assert.strictEqual(processImportPhone('', 'BJ'), null);
    assert.strictEqual(processImportPhone('   ', 'BJ'), null);

    // Numéro valide -> E.164
    assert.strictEqual(processImportPhone('01 97 00 00 00', 'BJ'), '+2290197000000');

    // Numéro présent mais invalide -> Levée d'exception (Rejet de la ligne)
    assert.throws(() => processImportPhone('abc1234', 'BJ'), /INVALID_PHONE/);
    assert.throws(() => processImportPhone('97000000', 'BJ'), /INVALID_PHONE/);
});

console.log(`\n📊 Bilan des tests : ${passedTests}/${totalTests} réussis.`);

if (passedTests === totalTests) {
    console.log('🎉 TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS !\n');
    process.exit(0);
} else {
    console.error('⚠️ ALERTE : Des tests ont échoué.\n');
    process.exit(1);
}
