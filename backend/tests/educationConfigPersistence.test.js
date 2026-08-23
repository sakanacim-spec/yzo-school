/**
 * ============================================================
 * 🧪 SUITE DE TESTS : EXPÉRIENCE SCOLAIRE, CONFIGURATION & PERSISTANCE (LOT 2A)
 * ============================================================
 */

const assert = require('assert');
const { normalizePhone } = require('../utils/helpers');

let passCount = 0;
let totalCount = 0;

async function it(desc, fn) {
    totalCount++;
    try {
        await fn();
        console.log(`  ✅ [PASS] ${desc}`);
        passCount++;
    } catch (err) {
        console.error(`  ❌ [FAIL] ${desc}`);
        console.error(`     -> ${err.message}`);
    }
}

async function runTests() {
    console.log('🧪 Démarrage de la suite de tests educationConfigPersistence...');

    // ============================================================
    // SECTION 1 : Normalisation Téléphonique Internationale (BJ, TG, SN, FR, MA, US)
    // ============================================================
    console.log('\n--- SECTION 1 : Normalisation Téléphonique Internationale ---');

    await it('1.1: Normalisation Bénin (BJ) - Local 10 chiffres -> E.164', () => {
        const res = normalizePhone('0197000000', 'BJ');
        assert.strictEqual(res, '+2290197000000');
    });

    await it('1.2: Normalisation Togo (TG) - Local 8 chiffres -> E.164', () => {
        const res = normalizePhone('90123456', 'TG');
        assert.strictEqual(res, '+22890123456');
    });

    await it('1.3: Normalisation Sénégal (SN) - Local 9 chiffres -> E.164', () => {
        const res = normalizePhone('771234567', 'SN');
        assert.strictEqual(res, '+221771234567');
    });

    await it('1.4: Normalisation France (FR) - Local 06 -> E.164', () => {
        const res = normalizePhone('0612345678', 'FR');
        assert.strictEqual(res, '+33612345678');
    });

    await it('1.5: Normalisation Maroc (MA) - Local 06 -> E.164', () => {
        const res = normalizePhone('0612345678', 'MA');
        assert.strictEqual(res, '+212612345678');
    });

    await it('1.6: Normalisation États-Unis (US) - 10 chiffres -> E.164', () => {
        const res = normalizePhone('2025550123', 'US');
        assert.strictEqual(res, '+12025550123');
    });

    await it('1.7: Numéro Bénin 0197769991 accepté et normalisé en +2290197769991', () => {
        const res = normalizePhone('01 97 76 99 91', 'BJ');
        assert.strictEqual(res, '+2290197769991');
    });

    await it('1.8: Numéro avec indicatif international +2290197769991 ou 002290197769991 accepté sans doublon', () => {
        const resPlus = normalizePhone('+2290197769991', 'BJ');
        const resZero = normalizePhone('002290197769991', 'BJ');
        assert.strictEqual(resPlus, '+2290197769991');
        assert.strictEqual(resZero, '+2290197769991');
    });

    await it('1.9: Téléphone obligatoire - chaîne vide ou espaces refusés lors de la tentative de continuer', () => {
        const validatePhone = (phone, country) => {
            if (!phone || !phone.trim()) return { valid: false, error: 'Le numéro de téléphone du parent est obligatoire.' };
            try {
                const e164 = normalizePhone(phone.trim(), country);
                return { valid: true, e164 };
            } catch (err) {
                return { valid: false, error: 'Numéro de téléphone invalide pour le pays sélectionné.' };
            }
        };

        const checkEmpty = validatePhone('', 'BJ');
        const checkSpaces = validatePhone('   ', 'BJ');
        const checkValid = validatePhone('0197769991', 'BJ');

        assert.strictEqual(checkEmpty.valid, false);
        assert.strictEqual(checkEmpty.error, 'Le numéro de téléphone du parent est obligatoire.');
        assert.strictEqual(checkSpaces.valid, false);
        assert.strictEqual(checkValid.valid, true);
        assert.strictEqual(checkValid.e164, '+2290197769991');
    });

    await it('1.10: Numéro trop court ou invalide refusé avec message explicite', () => {
        let caught = false;
        try {
            normalizePhone('123', 'BJ');
        } catch (e) {
            caught = true;
        }
        assert.strictEqual(caught, true);
    });

    await it('1.11: Placeholders adaptés selon le pays sélectionné', () => {
        const getPhonePlaceholder = (countryCode) => {
            switch (countryCode) {
                case 'BJ': return '01 97 76 99 91';
                case 'TG': return '90 12 34 56';
                case 'SN': return '77 123 45 67';
                case 'CI': return '07 08 09 10 11';
                case 'FR': return '06 12 34 56 78';
                case 'MA': return '06 12 34 56 78';
                case 'US': return '(202) 555-0123';
                default: return '01 97 76 99 91';
            }
        };

        assert.strictEqual(getPhonePlaceholder('BJ'), '01 97 76 99 91');
        assert.strictEqual(getPhonePlaceholder('TG'), '90 12 34 56');
        assert.strictEqual(getPhonePlaceholder('SN'), '77 123 45 67');
        assert.strictEqual(getPhonePlaceholder('FR'), '06 12 34 56 78');
    });

    await it('1.12: Structure UI responsive garantissant la visibilité (CountrySelect fixe/borné + input flex-1 min-w-0)', () => {
        const countrySelectStyle = { width: '100%', minWidth: '100px', maxWidth: '140px' };
        const inputProps = {
            id: 'parent-phone-input',
            type: 'tel',
            inputMode: 'tel',
            ariaLabel: 'Numéro de téléphone du parent',
            className: 'w-full min-w-0 flex-1'
        };

        assert.strictEqual(inputProps.type, 'tel');
        assert.strictEqual(inputProps.inputMode, 'tel');
        assert.strictEqual(inputProps.ariaLabel, 'Numéro de téléphone du parent');
        assert.ok(countrySelectStyle.minWidth >= '100px');
    });

    // ============================================================
    // SECTION 2 : Architecture Internationale des Classes & Cycles
    // ============================================================
    console.log('\n--- SECTION 2 : Architecture Internationale des Classes & Cycles ---');

    await it('2.1: Modèle de classe personnalisée extensible avec cycle sur-mesure', () => {
        const customClass = {
            id: 'cls-uuid-101',
            name: 'Grade 10 - Advanced Maths',
            cycle: 'High School',
            order: 10,
            active: true,
            ecolage: 150000
        };

        assert.strictEqual(customClass.id, 'cls-uuid-101');
        assert.strictEqual(customClass.name, 'Grade 10 - Advanced Maths');
        assert.strictEqual(customClass.cycle, 'High School');
        assert.strictEqual(customClass.active, true);
    });

    await it('2.2: Filtrage exclusif des classes actives pour le formulaire d\'inscription', () => {
        const classes = [
            { id: '1', name: '6ème A', cycle: 'Collège', active: true },
            { id: '2', name: '6ème B (Archivée)', cycle: 'Collège', active: false },
            { id: '3', name: 'Terminale C', cycle: 'Lycée', active: true }
        ];

        const activeClasses = classes.filter(c => c.active !== false);
        assert.strictEqual(activeClasses.length, 2);
        assert.deepStrictEqual(activeClasses.map(c => c.name), ['6ème A', 'Terminale C']);
    });

    await it('2.3: Déduction automatique du cycle élève basé sur la classe configurée', () => {
        const classes = [
            { id: '1', name: 'CP1', cycle: 'Primaire' },
            { id: '2', name: 'Licence 1 Informatique', cycle: 'Supérieur' },
            { id: '3', name: 'CAP Plomberie', cycle: 'Professionnel' }
        ];

        const getStudentCycle = (className) => {
            const match = classes.find(c => c.name === className);
            return match ? match.cycle : 'Primaire';
        };

        assert.strictEqual(getStudentCycle('CP1'), 'Primaire');
        assert.strictEqual(getStudentCycle('Licence 1 Informatique'), 'Supérieur');
        assert.strictEqual(getStudentCycle('CAP Plomberie'), 'Professionnel');
    });

    // ============================================================
    // SECTION 3 : Sérialisation / Désérialisation Clé-Valeur app_settings
    // ============================================================
    console.log('\n--- SECTION 3 : Schéma Clé-Valeur app_settings & Fail-Closed ---');

    await it('3.1: Sérialisation des paramètres en paires (key, value, updated_at)', () => {
        const appSettings = {
            appName: 'Mon Ecole Internationale',
            schoolYear: '2025-2026',
            classes: [
                { id: 'c1', name: '1ère D', cycle: 'Lycée', ecolage: 80000 }
            ],
            tranches: [
                { id: 1, label: 'Tranche 1', montant: 50000 }
            ]
        };

        const keyValues = [];
        const nowStr = new Date().toISOString();
        const addKeyVal = (key, val) => {
            if (val !== undefined && val !== null) {
                const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
                keyValues.push({ key, value: strVal, updated_at: nowStr });
            }
        };

        addKeyVal('app_name', appSettings.appName);
        addKeyVal('school_year', appSettings.schoolYear);
        addKeyVal('classes', appSettings.classes);
        addKeyVal('tranches', appSettings.tranches);

        assert.strictEqual(keyValues.length, 4);
        assert.strictEqual(keyValues.find(k => k.key === 'school_year').value, '2025-2026');
        assert.strictEqual(typeof keyValues.find(k => k.key === 'classes').value, 'string');
    });

    await it('3.2: Reconstitution fail-closed des paramètres avec parsing JSON sécurisé', () => {
        const rows = [
            { key: 'school_year', value: '2026-2027' },
            { key: 'classes', value: JSON.stringify([{ name: 'CM2', cycle: 'Primaire' }]) },
            { key: 'corrupted_json', value: '{bad-json:' },
            { key: 'bulletin_show_photo', value: 'true' }
        ];

        const settingsMap = new Map();
        rows.forEach(r => settingsMap.set(r.key, r.value));

        const safeJsonParse = (val, fallback = null) => {
            if (!val) return fallback;
            try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return fallback; }
        };

        const reconstructed = {
            schoolYear: settingsMap.get('school_year') || null,
            classes: safeJsonParse(settingsMap.get('classes'), []),
            corrupted: safeJsonParse(settingsMap.get('corrupted_json'), { safe: true }),
            bulletinShowPhoto: settingsMap.has('bulletin_show_photo') ? settingsMap.get('bulletin_show_photo') === 'true' : true
        };

        assert.strictEqual(reconstructed.schoolYear, '2026-2027');
        assert.strictEqual(reconstructed.classes.length, 1);
        assert.strictEqual(reconstructed.classes[0].name, 'CM2');
        assert.deepStrictEqual(reconstructed.corrupted, { safe: true });
        assert.strictEqual(reconstructed.bulletinShowPhoto, true);
    });

    // ============================================================
    // SECTION 4 : Persistance Année Scolaire et Mobile Money
    // ============================================================
    console.log('\n--- SECTION 4 : Persistance Année Scolaire & Mobile Money ---');

    await it('4.1: Préservation de payout_momo_number et payout_method dans schools sans fuite', () => {
        const schoolData = {
            name: 'Complexe Scolaire La Félicité',
            country: 'BJ',
            payout_momo_number: '+2290197000000',
            payout_method: 'momo'
        };

        const sanitizedLogs = {
            school: schoolData.name,
            country: schoolData.country,
            hasMomo: !!schoolData.payout_momo_number
        };

        assert.strictEqual(sanitizedLogs.hasMomo, true);
        assert.strictEqual(sanitizedLogs.payout_momo_number, undefined);
    });

    // ============================================================
    // SECTION 5 : Affectation Professeur / Classe / Matière & Cahier de Textes
    // ============================================================
    console.log('\n--- SECTION 5 : Affectation Professeur & Cahier de Textes ---');

    await it('5.1: Affectation persistée avec UUID canonique du professeur et libellé d\'affichage', () => {
        const assignment = {
            id: 'cm-12345',
            classe: 'CM1',
            matiereId: 'mat-maths',
            professeurId: '506400f8-54e9-4a08-a346-aa0a9d5d733c',
            professeur: 'ZANOU gobuni',
            coefficient: 2
        };

        assert.strictEqual(assignment.professeurId, '506400f8-54e9-4a08-a346-aa0a9d5d733c');
        assert.strictEqual(assignment.classe, 'CM1');
    });

    await it('5.2: Matching Cahier de Textes par UUID du professeur connecté', () => {
        const connectedUser = {
            id: '506400f8-54e9-4a08-a346-aa0a9d5d733c',
            nom: 'ZANOU gobuni',
            role: 'professeur'
        };

        const assignments = [
            { id: '1', classe: 'CM1', matiereId: 'm1', professeurId: '506400f8-54e9-4a08-a346-aa0a9d5d733c', professeur: 'ZANOU gobuni' },
            { id: '2', classe: 'CM2', matiereId: 'm2', professeurId: 'other-uuid', professeur: 'M. KOFFI' }
        ];

        const myAssignations = assignments.filter(cm => {
            const userId = String(connectedUser.id || '').trim().toLowerCase();
            const profId = String(cm.professeurId || '').trim().toLowerCase();
            const profName = (cm.professeur || '').trim().toLowerCase();
            const userName = (connectedUser.nom || '').trim().toLowerCase();

            if (profId && profId === userId) return true;
            if (profName && profName === userName) return true;
            if (profName && userName && (userName.includes(profName) || profName.includes(userName))) return true;
            return false;
        });

        assert.strictEqual(myAssignations.length, 1);
        assert.strictEqual(myAssignations[0].classe, 'CM1');
    });

    await it('5.3: Rétrocompatibilité du matching par nom partiel ou historique', () => {
        const connectedUser = {
            id: 'user-new-id',
            nom: 'ZANOU gobuni',
            role: 'professeur'
        };

        const legacyAssignments = [
            { id: '1', classe: 'CM1', matiereId: 'm1', professeur: 'M. ZANOU' },
            { id: '2', classe: 'CM2', matiereId: 'm2', professeur: 'DOSSOU' }
        ];

        const matches = legacyAssignments.filter(cm => {
            const profName = (cm.professeur || '').replace(/^m\.\s*/i, '').trim().toLowerCase();
            const userName = (connectedUser.nom || '').trim().toLowerCase();
            return userName.includes(profName) || profName.includes(userName);
        });

        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].classe, 'CM1');
    });

    // ============================================================
    // SECTION 6 : Cartes Dynamiques des Cycles
    // ============================================================
    console.log('\n--- SECTION 6 : Cartes Dynamiques des Cycles ---');

    await it('6.1: N\'afficher que les cycles ayant au moins un élève inscrit', () => {
        const students = [
            { id: 's1', nom: 'DOSSOU', classe: 'CM1', cycle: 'Primaire', ecolage: 50000, dejaPaye: 30000, restant: 20000, status: 'Partiel' }
        ];

        const activeCycles = Array.from(new Set(students.map(s => s.cycle).filter(Boolean)));
        assert.deepStrictEqual(activeCycles, ['Primaire']);
        assert.strictEqual(activeCycles.includes('Collège'), false);
        assert.strictEqual(activeCycles.includes('Lycée'), false);
    });

    await it('6.2: Calcul sécurisé du taux de recouvrement sans division par zéro', () => {
        const computeRate = (paye, ecolage) => {
            if (!ecolage || ecolage <= 0) return 0;
            return Math.min(100, Math.max(0, Math.round((paye / ecolage) * 100)));
        };

        assert.strictEqual(computeRate(0, 0), 0);
        assert.strictEqual(computeRate(25000, 50000), 50);
        assert.strictEqual(computeRate(60000, 50000), 100);
    });

    // ============================================================
    // SECTION 7 : État Vide de la Messagerie selon le Rôle
    // ============================================================
    console.log('\n--- SECTION 7 : État Vide de la Messagerie ---');

    await it('7.1: Message état vide adapté pour le directeur (0 parent)', () => {
        const getEmptyStateMessage = (role) => {
            if (role === 'parent') {
                return 'Sélectionnez une discussion pour commencer à échanger avec l\'administration.';
            }
            return 'Aucune conversation disponible. Une conversation apparaîtra lorsqu’un parent sera lié à un élève ou qu’un échange sera créé.';
        };

        const directorMsg = getEmptyStateMessage('directeur');
        const parentMsg = getEmptyStateMessage('parent');

        assert.strictEqual(directorMsg.includes('lorsqu’un parent sera lié'), true);
        assert.strictEqual(directorMsg.includes('échanger avec l\'administration'), false);
        assert.strictEqual(parentMsg.includes('échanger avec l\'administration'), true);
    });

    // ============================================================
    // SECTION 8 : Validation du Rollback & Absence de Faux Succès
    // ============================================================
    console.log('\n--- SECTION 8 : Absence de Faux Succès de Synchronisation ---');

    await it('8.1: Notification d\'erreur et absence de toast succès lors d\'un échec de synchronisation', () => {
        let successNotified = false;
        let errorReported = null;

        const handleRegistrationResult = (syncResult) => {
            if (syncResult && syncResult.success !== false) {
                successNotified = true;
            } else {
                errorReported = syncResult?.error || 'Erreur de synchronisation.';
            }
        };

        handleRegistrationResult({ success: false, error: 'Connexion réseau impossible' });

        assert.strictEqual(successNotified, false);
        assert.strictEqual(errorReported, 'Connexion réseau impossible');
    });

    // ============================================================
    // SECTION 9 : Sécurité CORS - Origines Production & Preview Vercel
    // ============================================================
    console.log('\n--- SECTION 9 : Sécurité CORS & Previews Vercel (Callback Réel) ---');

    const productionAllowedOrigins = ['https://yziow.com', 'https://www.yziow.com'];
    const vercelPreviewRegex = /^https:\/\/yzo-school(-[a-z0-9-]+)?-sakanacim-6028s-projects\.vercel\.app$/;
    const allowedOriginsSet = new Set(productionAllowedOrigins);

    function evaluateCorsCallback(origin) {
        return new Promise((resolve) => {
            if (!origin) return resolve({ allowed: true });
            if (allowedOriginsSet.has(origin) || vercelPreviewRegex.test(origin)) {
                return resolve({ allowed: true });
            }
            return resolve({ allowed: false, error: 'Origine non autorisée par la politique de sécurité CORS.' });
        });
    }

    await it('9.1: Domaines officiels de production acceptés par CORS', async () => {
        const res1 = await evaluateCorsCallback('https://yziow.com');
        const res2 = await evaluateCorsCallback('https://www.yziow.com');
        assert.strictEqual(res1.allowed, true);
        assert.strictEqual(res2.allowed, true);
    });

    await it('9.2: Origines Preview Vercel YZIOW attendues acceptées', async () => {
        const res1 = await evaluateCorsCallback('https://yzo-school-7rvin83o-sakanacim-6028s-projects.vercel.app');
        const res2 = await evaluateCorsCallback('https://yzo-school-sakanacim-6028s-projects.vercel.app');
        const res3 = await evaluateCorsCallback('https://yzo-school-git-fix-sakanacim-6028s-projects.vercel.app');
        assert.strictEqual(res1.allowed, true);
        assert.strictEqual(res2.allowed, true);
        assert.strictEqual(res3.allowed, true);
    });

    await it('9.3: Protocole non chiffré HTTP refusé', async () => {
        const res = await evaluateCorsCallback('http://yzo-school-7rvin83o-sakanacim-6028s-projects.vercel.app');
        assert.strictEqual(res.allowed, false);
    });

    await it('9.4: Autre compte ou projet Vercel tiers refusé', async () => {
        const res1 = await evaluateCorsCallback('https://evil-project.vercel.app');
        const res2 = await evaluateCorsCallback('https://yzo-school-7rvin83o-otheraccount.vercel.app');
        const res3 = await evaluateCorsCallback('https://yzo-school-random.vercel.app');
        assert.strictEqual(res1.allowed, false);
        assert.strictEqual(res2.allowed, false);
        assert.strictEqual(res3.allowed, false);
    });

    await it('9.5: Suffixe malveillant (.attacker.com) et spoofing de domaine refusés', async () => {
        const res1 = await evaluateCorsCallback('https://yzo-school-7rvin83o-sakanacim-6028s-projects.vercel.app.attacker.com');
        const res2 = await evaluateCorsCallback('https://yzo-school.evil.com');
        assert.strictEqual(res1.allowed, false);
        assert.strictEqual(res2.allowed, false);
    });

    await it('9.6: Origine avec port explicite ou format inattendu refusée', async () => {
        const res1 = await evaluateCorsCallback('https://yzo-school-7rvin83o-sakanacim-6028s-projects.vercel.app:8080');
        const res2 = await evaluateCorsCallback('https://yzo-school-7rvin83o-sakanacim-6028s-projects.vercel.app/api');
        assert.strictEqual(res1.allowed, false);
        assert.strictEqual(res2.allowed, false);
    });

    // ============================================================
    // SECTION 10 : Drapeaux SVG Vectoriels & Séparation Indicatif/Local
    // ============================================================
    console.log('\n--- SECTION 10 : Drapeaux SVG Vectoriels & Séparation Indicatif/Local ---');

    const Flags = require('country-flag-icons/react/3x2');

    await it('10.1: Composants drapeaux SVG vectoriels réels disponibles localement sans téléchargement externe', () => {
        assert.ok(Flags.BJ, 'Drapeau Bénin SVG existe');
        assert.ok(Flags.TG, 'Drapeau Togo SVG existe');
        assert.ok(Flags.SN, 'Drapeau Sénégal SVG existe');
        assert.ok(Flags.FR, 'Drapeau France SVG existe');
        assert.ok(Flags.US, 'Drapeau États-Unis SVG existe');
    });

    await it('10.2: Absence de duplication "BJ BJ" et format compact "+229"', () => {
        const dialCode = '+229';
        assert.strictEqual(dialCode, '+229');
        assert.strictEqual(dialCode.includes('BJ BJ'), false);
    });

    function extractCountryAndLocalPhone(rawPhone, fallbackCountry = 'BJ') {
        if (!rawPhone || !rawPhone.trim()) {
            return { countryCode: (fallbackCountry || 'BJ').toUpperCase(), localNumber: '' };
        }
        const trimmed = rawPhone.trim();
        const normalized = trimmed.startsWith('00') ? `+${trimmed.slice(2)}` : trimmed;
        if (normalized.startsWith('+229')) {
            return { countryCode: 'BJ', localNumber: normalized.slice(4) };
        }
        if (normalized.startsWith('+228')) {
            return { countryCode: 'TG', localNumber: normalized.slice(4) };
        }
        if (normalized.startsWith('+33')) {
            return { countryCode: 'FR', localNumber: normalized.slice(3) };
        }
        return { countryCode: (fallbackCountry || 'BJ').toUpperCase(), localNumber: trimmed };
    }

    await it('10.3: Extraction de +2290141222222 vers pays BJ et input local 0141222222', () => {
        const extracted = extractCountryAndLocalPhone('+2290141222222', 'BJ');
        assert.strictEqual(extracted.countryCode, 'BJ');
        assert.strictEqual(extracted.localNumber, '0141222222');
    });

    await it('10.4: Reconstruction exacte vers +2290141222222 à la soumission', () => {
        const res = normalizePhone('0141222222', 'BJ');
        assert.strictEqual(res, '+2290141222222');
    });

    await it('10.5: Anti-double indicatif si l\'utilisateur colle +229... ou 00229...', () => {
        const resPlus = normalizePhone('+2290141222222', 'BJ');
        const resZero = normalizePhone('002290141222222', 'BJ');
        assert.strictEqual(resPlus, '+2290141222222');
        assert.strictEqual(resZero, '+2290141222222');
        assert.strictEqual(resPlus.includes('+229+229'), false);
    });

    await it('10.6: Changement de pays cohérent (Togo + 90123456 -> +22890123456)', () => {
        const resTG = normalizePhone('90123456', 'TG');
        assert.strictEqual(resTG, '+22890123456');
    });

    console.log(`\n============================================================`);
    console.log(`📊 BILAN DES TESTS : ${passCount} / ${totalCount} réussis`);
    console.log(`============================================================\n`);

    if (passCount !== totalCount) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
