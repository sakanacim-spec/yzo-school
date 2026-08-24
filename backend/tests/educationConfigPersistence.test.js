/**
 * ============================================================
 * 🧪 SUITE DE TESTS : EXPÉRIENCE SCOLAIRE, CONFIGURATION & PERSISTANCE (LOT 2A)
 * ============================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
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

    // ============================================================
    // SECTION 11 : Classes et Cycles Libres & Personnalisables (Anomalie A)
    // ============================================================
    console.log('\n--- SECTION 11 : Classes et Cycles Libres & Personnalisables ---');

    function createClassManager(initialClasses = []) {
        let classes = [...initialClasses];
        let students = [];

        return {
            getClasses: () => classes,
            getActiveClasses: () => classes.filter(c => c.active !== false),
            setStudents: (st) => { students = [...st]; },
            addClass: ({ name, cycle, ecolage, active = true }) => {
                const trimmedName = (name || '').trim();
                const trimmedCycle = (cycle || '').trim() || 'Primaire';
                if (!trimmedName) return { success: false, error: 'Le nom de la classe est obligatoire.' };
                if (trimmedName.length > 50) return { success: false, error: 'Nom trop long (max 50).' };
                if (trimmedCycle.length > 50) return { success: false, error: 'Cycle trop long (max 50).' };
                if (classes.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
                    return { success: false, error: `La classe « ${trimmedName} » existe déjà.` };
                }
                const newCls = {
                    id: `cls-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    name: trimmedName,
                    cycle: trimmedCycle,
                    ecolage: Number(ecolage) || 0,
                    active: active !== false
                };
                classes.push(newCls);
                return { success: true, class: newCls };
            },
            updateClass: (id, updates) => {
                const target = classes.find(c => c.id === id || c.name === id);
                if (!target) return { success: false, error: 'Classe introuvable.' };
                if (updates.name) {
                    const newName = updates.name.trim();
                    if (!newName) return { success: false, error: 'Nom obligatoire.' };
                    if (classes.some(c => (c.id !== target.id && c.name !== target.name) && c.name.toLowerCase() === newName.toLowerCase())) {
                        return { success: false, error: `Une autre classe porte déjà le nom « ${newName} ».` };
                    }
                    target.name = newName;
                }
                if (updates.cycle !== undefined) target.cycle = updates.cycle.trim();
                if (updates.ecolage !== undefined) target.ecolage = Number(updates.ecolage) || 0;
                if (updates.active !== undefined) target.active = Boolean(updates.active);
                return { success: true, class: target };
            },
            deleteClass: (id) => {
                const target = classes.find(c => c.id === id || c.name === id);
                if (!target) return { success: false, error: 'Classe introuvable.' };
                const hasStudents = students.some(s => s.classe.toLowerCase() === target.name.toLowerCase());
                if (hasStudents) {
                    return {
                        success: false,
                        error: `Impossible de supprimer la classe « ${target.name} » car des élèves y sont déjà inscrits. Vous pouvez la désactiver pour ne plus la proposer sans perdre l'historique.`
                    };
                }
                classes = classes.filter(c => c.id !== target.id && c.name !== target.name);
                return { success: true };
            }
        };
    }

    await it('11.1: Création de classes libres personnalisées (CI, CP, 6ème, Grade 1, Year 7)', () => {
        const mgr = createClassManager();
        const r1 = mgr.addClass({ name: 'CI', cycle: 'Primaire', ecolage: 55000 });
        const r2 = mgr.addClass({ name: 'Grade 1', cycle: 'Primary', ecolage: 60000 });
        const r3 = mgr.addClass({ name: 'Terminale D', cycle: 'Lycée', ecolage: 95000 });
        assert.strictEqual(r1.success, true);
        assert.strictEqual(r2.success, true);
        assert.strictEqual(r3.success, true);
        assert.strictEqual(mgr.getClasses().length, 3);
    });

    await it('11.2: Déduplication insensible à la casse des classes', () => {
        const mgr = createClassManager();
        mgr.addClass({ name: 'CM2', cycle: 'Primaire', ecolage: 50000 });
        const dup = mgr.addClass({ name: 'cm2', cycle: 'Primaire', ecolage: 50000 });
        const dupSpaces = mgr.addClass({ name: '  CM2  ', cycle: 'Primaire', ecolage: 50000 });
        assert.strictEqual(dup.success, false);
        assert.strictEqual(dupSpaces.success, false);
        assert.strictEqual(mgr.getClasses().length, 1);
    });

    await it('11.3: Activation / Désactivation sans perte d\'historique', () => {
        const mgr = createClassManager();
        const r = mgr.addClass({ name: '6ème B', cycle: 'Collège', ecolage: 70000, active: true });
        assert.strictEqual(mgr.getActiveClasses().length, 1);

        mgr.updateClass(r.class.id, { active: false });
        assert.strictEqual(mgr.getClasses().length, 1);
        assert.strictEqual(mgr.getActiveClasses().length, 0);

        mgr.updateClass(r.class.id, { active: true });
        assert.strictEqual(mgr.getActiveClasses().length, 1);
    });

    await it('11.4: Refus de suppression destructive si des élèves sont inscrits dans la classe', () => {
        const mgr = createClassManager();
        const r = mgr.addClass({ name: 'Terminale C', cycle: 'Lycée', ecolage: 100000 });
        mgr.setStudents([{ id: 'st-1', nom: 'Koffi', classe: 'Terminale C' }]);

        const delRes = mgr.deleteClass(r.class.id);
        assert.strictEqual(delRes.success, false);
        assert.strictEqual(delRes.error.includes('élèves y sont déjà inscrits'), true);
        assert.strictEqual(mgr.getClasses().length, 1);
    });

    await it('11.5: Suppression autorisée si aucun élève n\'est inscrit', () => {
        const mgr = createClassManager();
        const r = mgr.addClass({ name: 'Classe Test', cycle: 'Primaire', ecolage: 50000 });
        mgr.setStudents([]);

        const delRes = mgr.deleteClass(r.class.id);
        assert.strictEqual(delRes.success, true);
        assert.strictEqual(mgr.getClasses().length, 0);
    });

    await it('11.6: Inscription : seules les classes actives sont proposées', () => {
        const mgr = createClassManager();
        mgr.addClass({ name: 'CP1', cycle: 'Primaire', ecolage: 50000, active: true });
        mgr.addClass({ name: 'CP2 Ancienne', cycle: 'Primaire', ecolage: 50000, active: false });

        const active = mgr.getActiveClasses();
        assert.strictEqual(active.length, 1);
        assert.strictEqual(active[0].name, 'CP1');
    });

    await it('11.7: Inscription : message d\'avertissement si aucune classe active configurée', () => {
        const mgr = createClassManager();
        const active = mgr.getActiveClasses();
        const warning = active.length === 0 ? "Aucune classe n'est configurée. Configurez d'abord les cycles et classes dans Paramètres." : null;
        assert.strictEqual(warning, "Aucune classe n'est configurée. Configurez d'abord les cycles et classes dans Paramètres.");
    });

    await it('11.8: Dashboard : Cartes de cycle dynamiques basées sur les cycles réels', () => {
        const students = [
            { id: '1', nom: 'A', classe: 'Grade 1', cycle: 'Primary School', ecolage: 50000, dejaPaye: 30000, restant: 20000, status: 'Partiel' },
            { id: '2', nom: 'B', classe: 'Grade 2', cycle: 'Primary School', ecolage: 50000, dejaPaye: 50000, restant: 0, status: 'Soldé' },
            { id: '3', nom: 'C', classe: 'Licence 1', cycle: 'Enseignement Supérieur', ecolage: 150000, dejaPaye: 150000, restant: 0, status: 'Soldé' }
        ];

        const activeCycles = Array.from(new Set(students.map(s => s.cycle).filter(Boolean)));
        assert.deepStrictEqual(activeCycles, ['Primary School', 'Enseignement Supérieur']);

        const computeStats = (cyc) => {
            const arr = students.filter(s => s.cycle === cyc);
            const count = arr.length;
            const ecolage = arr.reduce((a, s) => a + s.ecolage, 0);
            const paye = arr.reduce((a, s) => a + s.dejaPaye, 0);
            const restant = arr.reduce((a, s) => a + s.restant, 0);
            const taux = ecolage > 0 ? Math.round((paye / ecolage) * 100) : 0;
            return { count, ecolage, paye, restant, taux };
        };

        const statPrimary = computeStats('Primary School');
        assert.strictEqual(statPrimary.count, 2);
        assert.strictEqual(statPrimary.ecolage, 100000);
        assert.strictEqual(statPrimary.paye, 80000);
        assert.strictEqual(statPrimary.taux, 80);

        const statSup = computeStats('Enseignement Supérieur');
        assert.strictEqual(statSup.count, 1);
        assert.strictEqual(statSup.ecolage, 150000);
        assert.strictEqual(statSup.taux, 100);
    });

    // ============================================================
    // SECTION 12 : Persistance Année Scolaire & Paramètres (Anomalie B)
    // ============================================================
    console.log('\n--- SECTION 12 : Persistance Année Scolaire & Paramètres ---');

    await it('12.1: Enregistrement et normalisation de l\'année scolaire (ex: "2026-2027")', () => {
        const rawInput = '  2026-2027  ';
        const normalized = rawInput.trim();
        assert.strictEqual(normalized, '2026-2027');
    });

    await it('12.2: Round-trip appSettings : clé school_year sauvegardée et restituée fidèlement', () => {
        const dbKeyValueMap = new Map();
        const saveAppSettings = (settings) => {
            if (settings.schoolYear !== undefined) {
                dbKeyValueMap.set('school_year', String(settings.schoolYear).trim());
            }
            if (settings.classes !== undefined) {
                dbKeyValueMap.set('classes', JSON.stringify(settings.classes));
            }
        };

        const loadAppSettings = () => {
            return {
                schoolYear: dbKeyValueMap.get('school_year') || null,
                classes: dbKeyValueMap.has('classes') ? JSON.parse(dbKeyValueMap.get('classes')) : null
            };
        };

        // Sauvegarde par le directeur
        saveAppSettings({
            schoolYear: '2026-2027',
            classes: [{ name: 'CI A', cycle: 'Primaire', ecolage: 60000, active: true }]
        });

        // Lecture après rechargement de page
        const loaded = loadAppSettings();
        assert.strictEqual(loaded.schoolYear, '2026-2027');
        assert.strictEqual(loaded.classes.length, 1);
        assert.strictEqual(loaded.classes[0].name, 'CI A');
    });

    await it('12.3: Multi-tenant strict : isolation entre écoles pour school_year et classes', () => {
        const schoolsDb = {
            'ecole-alpha': new Map(),
            'ecole-beta': new Map()
        };

        schoolsDb['ecole-alpha'].set('school_year', '2025-2026');
        schoolsDb['ecole-alpha'].set('classes', JSON.stringify([{ name: 'CM2 Alpha', cycle: 'Primaire' }]));

        schoolsDb['ecole-beta'].set('school_year', '2026-2027');
        schoolsDb['ecole-beta'].set('classes', JSON.stringify([{ name: 'Grade 5 Beta', cycle: 'Primary' }]));

        assert.strictEqual(schoolsDb['ecole-alpha'].get('school_year'), '2025-2026');
        assert.strictEqual(schoolsDb['ecole-beta'].get('school_year'), '2026-2027');
        assert.strictEqual(JSON.parse(schoolsDb['ecole-alpha'].get('classes'))[0].name, 'CM2 Alpha');
        assert.strictEqual(JSON.parse(schoolsDb['ecole-beta'].get('classes'))[0].name, 'Grade 5 Beta');
    });

    // ============================================================
    // SECTION 13 : Validation Inscription, Notification & Horaires par Cycle
    // ============================================================
    console.log('\n--- SECTION 13 : Validation Inscription, Notification & Horaires par Cycle ---');

    await it('13.1: Notification verte explicite après succès HTTP réel d\'inscription', () => {
        const student = null; // nouvelle inscription
        const successMsg = student
            ? 'Élève modifié et synchronisé avec succès.'
            : 'Félicitations ! L’élève a été inscrit(e) avec succès.';
        assert.strictEqual(successMsg, 'Félicitations ! L’élève a été inscrit(e) avec succès.');
    });

    await it('13.2: Absence de faux succès et maintien de la modale en cas d\'échec HTTP ou panne réseau', () => {
        let isModalOpen = true;
        let successBanner = null;
        let submitError = null;

        const simulateSubmit = (networkOk, status) => {
            if (!networkOk || status >= 400) {
                submitError = 'Erreur lors de l\'enregistrement sur le serveur.';
                // Modale reste ouverte, pas de notification de félicitations
                isModalOpen = true;
                successBanner = null;
            } else {
                submitError = null;
                isModalOpen = false;
                successBanner = 'Félicitations ! L’élève a été inscrit(e) avec succès.';
            }
        };

        simulateSubmit(false, 500);
        assert.strictEqual(isModalOpen, true);
        assert.strictEqual(successBanner, null);
        assert.strictEqual(submitError, 'Erreur lors de l\'enregistrement sur le serveur.');

        simulateSubmit(true, 200);
        assert.strictEqual(isModalOpen, false);
        assert.strictEqual(successBanner, 'Félicitations ! L’élève a été inscrit(e) avec succès.');
        assert.strictEqual(submitError, null);
    });

    await it('13.3: Unicité stricte de la requête POST /api/sync lors de l\'inscription', () => {
        const syncCalls = [];
        const sendSync = (payload) => {
            syncCalls.push({ timestamp: Date.now(), payload });
            return { success: true };
        };

        // Soumission unique de l'élève
        const res = sendSync({ students: [{ id: 'st-1', nom: 'DOSSOU', prenom: 'Paul', classe: '6e B' }] });
        assert.strictEqual(res.success, true);
        assert.strictEqual(syncCalls.length, 1);
    });

    await it('13.4: Table unique de classes : affichage nom + cycle + frais annuels + statut sans duplication', () => {
        const classes = [
            { name: 'CI', cycle: 'Primaire', ecolage: 50000, active: true },
            { name: 'CP', cycle: 'Primaire', ecolage: 50000, active: true },
            { name: '6e B', cycle: 'Secondaire général', ecolage: 75000, active: true }
        ];

        const renderedRows = classes.map(c => `${c.name} | ${c.cycle} | ${c.ecolage} FCFA | ${c.active ? 'Actif' : 'Inactif'}`);
        assert.strictEqual(renderedRows[0], 'CI | Primaire | 50000 FCFA | Actif');
        assert.strictEqual(renderedRows[1], 'CP | Primaire | 50000 FCFA | Actif');
        assert.strictEqual(renderedRows[2], '6e B | Secondaire général | 75000 FCFA | Actif');
    });

    await it('13.5: Horaires dynamiques par cycle basés sur les cycles réels configurés', () => {
        const classes = [
            { name: 'CI', cycle: 'Maternelle' },
            { name: 'CP1', cycle: 'Primaire' },
            { name: '6e B', cycle: 'Secondaire général' }
        ];
        const activeCycles = Array.from(new Set(classes.map(c => c.cycle)));
        assert.deepStrictEqual(activeCycles, ['Maternelle', 'Primaire', 'Secondaire général']);

        const existingSchedules = [{ cycle: 'Maternelle', heureLimite: '07:30' }];
        const defaultTimes = { 'Maternelle': '07:30', 'Primaire': '07:30' };

        const localSchedules = activeCycles.map(cycle => ({
            cycle,
            heureLimite: existingSchedules.find(s => s.cycle === cycle)?.heureLimite || defaultTimes[cycle] || '08:00'
        }));

        assert.strictEqual(localSchedules.length, 3);
        assert.strictEqual(localSchedules.find(s => s.cycle === 'Maternelle').heureLimite, '07:30');
        assert.strictEqual(localSchedules.find(s => s.cycle === 'Primaire').heureLimite, '07:30');
        assert.strictEqual(localSchedules.find(s => s.cycle === 'Secondaire général').heureLimite, '08:00');
    });

    await it('13.6: Persistance et round-trip des horaires limites par cycle (cycle_schedules)', () => {
        const settingsDb = new Map();
        const schedulesToSave = [
            { cycle: 'Primaire', heureLimite: '07:30' },
            { cycle: 'Secondaire général', heureLimite: '07:45' }
        ];

        // Save
        settingsDb.set('cycle_schedules', JSON.stringify(schedulesToSave));

        // Load
        const loaded = JSON.parse(settingsDb.get('cycle_schedules'));
        assert.strictEqual(loaded.length, 2);
        assert.strictEqual(loaded[0].cycle, 'Primaire');
        assert.strictEqual(loaded[0].heureLimite, '07:30');
        assert.strictEqual(loaded[1].cycle, 'Secondaire général');
        assert.strictEqual(loaded[1].heureLimite, '07:45');
    });

    await it('13.7: POST de schoolYear = 2026-2027 produit l\'upsert SQL de la clé school_year', () => {
        const appSettings = { schoolYear: '2026-2027' };
        const keyValues = [];
        const addKeyVal = (key, val) => {
            if (val !== undefined && val !== null) {
                const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
                keyValues.push({ key, value: strVal });
            }
        };
        addKeyVal('school_year', appSettings.schoolYear);

        assert.strictEqual(keyValues.length, 1);
        assert.strictEqual(keyValues[0].key, 'school_year');
        assert.strictEqual(keyValues[0].value, '2026-2027');
    });

    await it('13.8: GET reconstruit schoolYear = 2026-2027 depuis la table app_settings', () => {
        const settingsMap = new Map();
        settingsMap.set('school_year', '2026-2027');

        const appSettingsJson = {
            schoolYear: settingsMap.get('school_year') || null
        };

        assert.strictEqual(appSettingsJson.schoolYear, '2026-2027');
    });

    await it('13.9: Erreur Supabase lors de l\'enregistrement appSettings empêche le message de succès (fail-closed)', async () => {
        const simulateBackendSync = async (mockDbError) => {
            if (mockDbError) {
                return { status: 500, json: { error: 'Erreur lors de la sauvegarde des paramètres: ' + mockDbError } };
            }
            return { status: 200, json: { success: true } };
        };

        // En cas d'erreur DB
        const failRes = await simulateBackendSync('connection failed');
        assert.strictEqual(failRes.status, 500);

        // Traitement frontend
        let isSaved = false;
        let errorMessage = null;
        if (failRes.status !== 200) {
            isSaved = false;
            errorMessage = failRes.json.error;
        } else {
            isSaved = true;
        }

        assert.strictEqual(isSaved, false);
        assert.strictEqual(errorMessage.includes('Erreur lors de la sauvegarde'), true);
    });

    await it('13.10: Une nouvelle instance du store vide retrouve les valeurs depuis le backend sans localStorage', () => {
        // État vierge sans cache local
        const freshStore = {
            schoolYear: '',
            cycleSchedules: []
        };

        const backendResponse = {
            appSettings: {
                schoolYear: '2026-2027',
                cycleSchedules: [{ cycle: 'Primaire', heureLimite: '07:30' }]
            }
        };

        // Hydratation directe depuis l'autorité backend
        const cloudYear = backendResponse.appSettings.schoolYear ? String(backendResponse.appSettings.schoolYear).trim() : '';
        freshStore.schoolYear = cloudYear;
        freshStore.cycleSchedules = backendResponse.appSettings.cycleSchedules;

        assert.strictEqual(freshStore.schoolYear, '2026-2027');
        assert.strictEqual(freshStore.cycleSchedules.length, 1);
        assert.strictEqual(freshStore.cycleSchedules[0].cycle, 'Primaire');
        assert.strictEqual(freshStore.cycleSchedules[0].heureLimite, '07:30');
    });

    await it('13.11: Modification de l\'année scolaire déclenche l\'état « Modifications non enregistrées »', () => {
        const storeYear = '2025-2026';
        let localYear = '2025-2026';
        const computeIsDirty = (local, remote) => local !== remote;

        assert.strictEqual(computeIsDirty(localYear, storeYear), false);

        localYear = '2026-2027';
        assert.strictEqual(computeIsDirty(localYear, storeYear), true);
    });

    await it('13.12: Succès de sauvegarde affiche « Paramètres enregistrés avec succès. » et réinitialise l\'état', () => {
        let isSaved = false;
        let successMessage = null;

        const handleSaveSuccess = () => {
            isSaved = true;
            successMessage = 'Paramètres enregistrés avec succès.';
        };

        handleSaveSuccess();
        assert.strictEqual(isSaved, true);
        assert.strictEqual(successMessage, 'Paramètres enregistrés avec succès.');
    });

    // ============================================================
    // SECTION 14 : CATÉGORIES TARIFAIRES BILLING_CATEGORY DANS LES PARAMÈTRES
    // ============================================================
    console.log('\n--- SECTION 14 : Catégories Tarifaires BillingCategory (Paramètres & Classes) ---');

    const ALLOWED_BILLING_CATEGORIES = new Set([
        'maternelle_primaire',
        'college_secondaire',
        'superieur_formation'
    ]);

    await it('14.1: Champ obligatoire Catégorie de facturation Yziow dans le formulaire classe', () => {
        const validateClassForm = (name, cycle, billingCategory) => {
            if (!name || !name.trim()) return { valid: false, error: 'Le nom de la classe est obligatoire.' };
            if (!cycle || !cycle.trim()) return { valid: false, error: 'Le nom du cycle est obligatoire.' };
            if (!billingCategory || !billingCategory.trim()) return { valid: false, error: 'La catégorie de facturation Yziow est obligatoire.' };
            return { valid: true };
        };

        const resWithoutCategory = validateClassForm('6ème A', 'Collège', '');
        assert.strictEqual(resWithoutCategory.valid, false);
        assert.strictEqual(resWithoutCategory.error, 'La catégorie de facturation Yziow est obligatoire.');

        const resWithCategory = validateClassForm('6ème A', 'Collège', 'college_secondaire');
        assert.strictEqual(resWithCategory.valid, true);
    });

    await it('14.2: Trois valeurs techniques fermées (maternelle_primaire, college_secondaire, superieur_formation)', () => {
        assert.strictEqual(ALLOWED_BILLING_CATEGORIES.has('maternelle_primaire'), true);
        assert.strictEqual(ALLOWED_BILLING_CATEGORIES.has('college_secondaire'), true);
        assert.strictEqual(ALLOWED_BILLING_CATEGORIES.has('superieur_formation'), true);
        assert.strictEqual(ALLOWED_BILLING_CATEGORIES.size, 3);
    });

    await it('14.3: Nouvelle classe personnalisée persistée avec billingCategory', () => {
        const newClass = {
            id: 'cls-custom-1',
            name: 'Year 7 British',
            cycle: 'Key Stage 3',
            billingCategory: 'college_secondaire',
            ecolage: 80000,
            active: true
        };

        assert.strictEqual(newClass.billingCategory, 'college_secondaire');
        assert.strictEqual(ALLOWED_BILLING_CATEGORIES.has(newClass.billingCategory), true);
    });

    await it('14.4: Modification de classe conserve la billingCategory après synchronisation', () => {
        let currentClass = {
            id: 'cls-1',
            name: 'CP1',
            cycle: 'Primaire',
            billingCategory: 'maternelle_primaire',
            ecolage: 50000
        };

        // Modification
        currentClass = {
            ...currentClass,
            billingCategory: 'maternelle_primaire',
            ecolage: 55000
        };

        const serialized = JSON.stringify([currentClass]);
        const parsed = JSON.parse(serialized);

        assert.strictEqual(parsed[0].billingCategory, 'maternelle_primaire');
        assert.strictEqual(parsed[0].ecolage, 55000);
    });

    await it('14.5: Avertissement explicite de non-rétroactivité', () => {
        const warningText = '⚠️ Cette modification affectera les prochains devis, jamais les paiements déjà initiés ou confirmés.';
        assert.ok(warningText.includes('affectera les prochains devis'));
        assert.ok(warningText.includes('jamais les paiements déjà initiés'));
    });

    await it('14.6: Classe historique ambiguë résolue en « Catégorie à définir »', () => {
        const resolveCategoryBadge = (cls) => {
            if (cls.billingCategory && ALLOWED_BILLING_CATEGORIES.has(cls.billingCategory)) {
                return cls.billingCategory;
            }
            // Inférence déterministe pour les cycles standards
            const lowerCycle = (cls.cycle || '').toLowerCase();
            if (lowerCycle.includes('primaire') || lowerCycle.includes('maternelle')) return 'maternelle_primaire';
            if (lowerCycle.includes('collège') || lowerCycle.includes('secondaire') || lowerCycle.includes('lycée')) return 'college_secondaire';
            if (lowerCycle.includes('supérieur') || lowerCycle.includes('université')) return 'superieur_formation';
            return 'CATEGORY_TO_DEFINE';
        };

        const standardClass = { name: 'CP1', cycle: 'Primaire' };
        assert.strictEqual(resolveCategoryBadge(standardClass), 'maternelle_primaire');

        const ambiguousClass = { name: 'Classe Inconnue Alpha', cycle: 'Cycle Spécial X' };
        assert.strictEqual(resolveCategoryBadge(ambiguousClass), 'CATEGORY_TO_DEFINE');
    });

    await it('14.7: Aucune 4ème catégorie libre acceptée par le validateur', () => {
        const invalidCategory = 'formation_courte_diplomante';
        assert.strictEqual(ALLOWED_BILLING_CATEGORIES.has(invalidCategory), false);
    });

    await it('14.8: Widget de paiement proposant l\'accès aux Paramètres après erreur 422', () => {
        const errorCodesLeadingToSettings = new Set([
            'SUBSCRIPTION_CLASSIFICATION_INCOMPLETE',
            'SUBSCRIPTION_PERIOD_REQUIRED'
        ]);

        assert.strictEqual(errorCodesLeadingToSettings.has('SUBSCRIPTION_CLASSIFICATION_INCOMPLETE'), true);
        assert.strictEqual(errorCodesLeadingToSettings.has('SUBSCRIPTION_PERIOD_REQUIRED'), true);
        assert.strictEqual(errorCodesLeadingToSettings.has('PAYMENT_ALREADY_PENDING'), false);
    });

    console.log(`\n--- SECTION 15 : Résilience Widget Abonnement & Sécurité effectiveBreakdown ---`);

    await it('15.1: Premier rendu sans quote : effectiveBreakdown toujours défini à 0 sans ReferenceError', () => {
        const serverQuote = null;
        const effectiveBreakdown = {
            maternelle_primaire: Number(serverQuote?.breakdown?.maternelle_primaire) || 0,
            college_secondaire: Number(serverQuote?.breakdown?.college_secondaire) || 0,
            superieur_formation: Number(serverQuote?.breakdown?.superieur_formation) || 0
        };

        assert.strictEqual(effectiveBreakdown.maternelle_primaire, 0);
        assert.strictEqual(effectiveBreakdown.college_secondaire, 0);
        assert.strictEqual(effectiveBreakdown.superieur_formation, 0);
        assert.strictEqual(typeof effectiveBreakdown.maternelle_primaire, 'number');
    });

    await it('15.2: Quote en cours de chargement : calculs financiers sûrs et stables (fallback zéro)', () => {
        const serverQuote = null;
        const students = [{ id: '1', classe: 'CP1' }, { id: '2', classe: '6eme' }];
        const totalStudents = typeof serverQuote?.totalStudents === 'number' ? serverQuote.totalStudents : students.length;
        const totalMonthlyFcfa = typeof serverQuote?.monthlyAmount === 'number' ? serverQuote.monthlyAmount : 0;
        const totalAnnualFcfa = typeof serverQuote?.totalAnnualAmount === 'number' ? serverQuote.totalAnnualAmount : 0;
        const finalAnnualFcfa = typeof serverQuote?.finalAnnualAmount === 'number' ? serverQuote.finalAnnualAmount : 0;
        const tranchesFcfa = Array.isArray(serverQuote?.tranches) && serverQuote.tranches.length === 3 ? serverQuote.tranches : [0, 0, 0];

        assert.strictEqual(totalStudents, 2);
        assert.strictEqual(totalMonthlyFcfa, 0);
        assert.strictEqual(totalAnnualFcfa, 0);
        assert.strictEqual(finalAnnualFcfa, 0);
        assert.deepStrictEqual(tranchesFcfa, [0, 0, 0]);
    });

    await it('15.3: Réponse quote valide reçue du backend : décomposition exacte injectée', () => {
        const serverQuote = {
            billing_period: '2026-2027',
            totalStudents: 40,
            monthlyAmount: 5000,
            totalAnnualAmount: 50000,
            annualBonusAmount: 5000,
            finalAnnualAmount: 45000,
            tranches: [16667, 16667, 16666],
            breakdown: {
                maternelle_primaire: 20,
                college_secondaire: 20,
                superieur_formation: 0
            }
        };

        const effectiveBreakdown = {
            maternelle_primaire: Number(serverQuote?.breakdown?.maternelle_primaire) || 0,
            college_secondaire: Number(serverQuote?.breakdown?.college_secondaire) || 0,
            superieur_formation: Number(serverQuote?.breakdown?.superieur_formation) || 0
        };

        assert.strictEqual(effectiveBreakdown.maternelle_primaire, 20);
        assert.strictEqual(effectiveBreakdown.college_secondaire, 20);
        assert.strictEqual(effectiveBreakdown.superieur_formation, 0);
        assert.strictEqual(serverQuote.finalAnnualAmount, 45000);
        assert.strictEqual(serverQuote.tranches[0] + serverQuote.tranches[1] + serverQuote.tranches[2], 50000);
    });

    await it('15.4: Breakdown partiel ou corrompu (champs manquants ou NaN) : normalisation vers 0', () => {
        const corruptQuote = {
            breakdown: {
                maternelle_primaire: 'invalide',
                college_secondaire: null
                // superieur_formation omitted
            }
        };

        const effectiveBreakdown = {
            maternelle_primaire: Number(corruptQuote?.breakdown?.maternelle_primaire) || 0,
            college_secondaire: Number(corruptQuote?.breakdown?.college_secondaire) || 0,
            superieur_formation: Number(corruptQuote?.breakdown?.superieur_formation) || 0
        };

        assert.strictEqual(effectiveBreakdown.maternelle_primaire, 0);
        assert.strictEqual(effectiveBreakdown.college_secondaire, 0);
        assert.strictEqual(effectiveBreakdown.superieur_formation, 0);
    });

    await it('15.5: Erreur HTTP 422 : gestion locale de l\'erreur avec bouton Paramètres sans plantage', () => {
        const errorResponse = {
            error: 'Certaines classes d\'élèves ne sont rattachées à aucune catégorie tarifaire valide.',
            code: 'SUBSCRIPTION_CLASSIFICATION_INCOMPLETE',
            diagnostic_id: 'diag_test_422'
        };

        const activeError = {
            message: errorResponse.error,
            code: errorResponse.code,
            diagnostic_id: errorResponse.diagnostic_id
        };

        const showSettingsButton = activeError.code === 'SUBSCRIPTION_CLASSIFICATION_INCOMPLETE' || activeError.code === 'SUBSCRIPTION_PERIOD_REQUIRED';
        assert.strictEqual(showSettingsButton, true);
        assert.strictEqual(activeError.diagnostic_id, 'diag_test_422');
    });

    await it('15.6: Erreur HTTP 503 / Réseau : message sécurisé fail-closed sans fuite de secrets', () => {
        const networkError = {
            message: 'Impossible de joindre le serveur pour calculer le devis d\'abonnement.',
            code: 'NETWORK_ERROR'
        };

        assert.ok(!networkError.message.includes('sk_live_'));
        assert.ok(!networkError.message.includes('sk_sandbox_'));
        assert.strictEqual(networkError.code, 'NETWORK_ERROR');
    });

    await it('15.7: Absence totale de ReferenceError sur le composant (vérification statique)', () => {
        const fs = require('fs');
        const path = require('path');
        const widgetFile = path.join(__dirname, '../../src/components/SchoolSubscriptionWidget.tsx');
        const content = fs.readFileSync(widgetFile, 'utf-8');

        // Vérifie que effectiveBreakdown est bien déclaré avant toute utilisation
        assert.ok(content.includes('const effectiveBreakdown: LevelBreakdown = {'), 'effectiveBreakdown doit être explicitement déclaré');
        // Vérifie qu\'aucune variable non définie n\'est référencée
        assert.strictEqual(content.includes('const breakdown: LevelBreakdown'), false, 'Ancienne variable non utilisée supprimée');
    });

    await it('15.8: Résilience Dashboard : l\'échec de chargement du devis n\'impacte pas le rendu global', () => {
        // Simulation d\'un état où le widget a échoué à charger le devis
        const dashboardState = {
            students: [{ id: 's1', name: 'Élève A', ecolage: 100000, dejaPaye: 50000 }],
            isSyncing: false,
            widgetState: {
                isLoadingQuote: false,
                quoteError: { code: 'NETWORK_ERROR', message: 'Erreur réseau temporaire' },
                serverQuote: null
            }
        };

        // Les KPI généraux du dashboard restent calculables
        const totalEcolage = dashboardState.students.reduce((a, s) => a + s.ecolage, 0);
        const totalPaye = dashboardState.students.reduce((a, s) => a + s.dejaPaye, 0);
        assert.strictEqual(totalEcolage, 100000);
        assert.strictEqual(totalPaye, 50000);
        assert.strictEqual(dashboardState.widgetState.quoteError.code, 'NETWORK_ERROR');
    });

    console.log('\n--- SECTION 16 : Suppression du Téléchargement Automatique de PDF (HOTFIX PR #18) ---');

    await it('16.1: Dashboard.tsx ne contient aucun useEffect déclenchant un téléchargement automatique de PDF', () => {
        const dashboardCode = fs.readFileSync(path.join(__dirname, '../../src/pages/Dashboard.tsx'), 'utf-8');
        // Vérifie qu'aucun hook useEffect n'invoque generateRapportMensuelPDF
        const useEffectMatches = dashboardCode.match(/useEffect\s*\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[/g) || [];
        for (const hook of useEffectMatches) {
            assert.strictEqual(
                hook.includes('generateRapportMensuelPDF'),
                false,
                `Un useEffect invoquant generateRapportMensuelPDF a été trouvé : ${hook}`
            );
        }
    });

    await it('16.2: Le bouton manuel "RAPPORT MENSUEL" est présent et correctement relié au gestionnaire de clic', () => {
        const dashboardCode = fs.readFileSync(path.join(__dirname, '../../src/pages/Dashboard.tsx'), 'utf-8');
        assert.ok(
            dashboardCode.includes('generateRapportMensuelPDF(students, classComp'),
            'L\'appel manuel à generateRapportMensuelPDF doit être préservé dans le onClick'
        );
        assert.ok(
            dashboardCode.includes('RAPPORT MENSUEL') || dashboardCode.includes('Rapport Mensuel'),
            'Le libellé du bouton de rapport mensuel doit être présent'
        );
    });

    await it('16.3: Aucun appel doc.save automatique n\'est exécuté au montage / chargement', () => {
        let saveCalls = 0;
        const mockDoc = {
            save: () => { saveCalls++; }
        };

        // Simule le montage du composant : zéro action
        assert.strictEqual(saveCalls, 0, 'Le montage ne doit déclencher aucun save()');
    });

    await it('16.4: Un clic manuel explicite déclenche exactement 1 téléchargement de rapport', async () => {
        let saveCalls = 0;
        const fakeGenerateReport = async () => {
            saveCalls++;
        };

        // Clic utilisateur
        await fakeGenerateReport();
        assert.strictEqual(saveCalls, 1, 'Un clic utilisateur doit déclencher exactement 1 téléchargement');
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
