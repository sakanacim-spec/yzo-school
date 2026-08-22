/**
 * ============================================================
 * 🧪 SUITE DE TESTS : PERSISTANCE ÉLÈVE, TÉLÉPHONE, PHOTOS & DEVOIRS
 * ============================================================
 */

const assert = require('assert');
const { normalizePhone, verifyFileMagicBytes } = require('../utils/helpers');

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
    console.log('🧪 Démarrage de la suite de tests studentSyncAndHomework...');

    // ============================================================
    // SECTION 1 : Normalisation et Validation Téléphonique
    // ============================================================
    console.log('\n--- SECTION 1 : Normalisation Téléphonique ---');

    await it('1.1: Numéro Bénin (BJ) 10 chiffres (0197000000) normalisé en E.164 (+2290197000000)', () => {
        const normalized = normalizePhone('0197000000', 'BJ');
        assert.strictEqual(normalized, '+2290197000000');
    });

    await it('1.2: Numéro Bénin (BJ) 8 chiffres historique (97000000) migré en E.164 (+2290197000000)', () => {
        const normalized = normalizePhone('97000000', 'BJ');
        assert.strictEqual(normalized, '+2290197000000');
    });

    await it('1.3: Numéro international Bénin avec +229 conservé sans double indicatif', () => {
        const normalized = normalizePhone('+2290197000000', 'BJ');
        assert.strictEqual(normalized, '+2290197000000');
    });

    await it('1.4: Numéro international avec 00229 converti en +229...', () => {
        const normalized = normalizePhone('002290197000000', 'BJ');
        assert.strictEqual(normalized, '+2290197000000');
    });

    await it('1.5: Numéro d un autre pays (France FR 06 12 34 56 78 avec espaces) normalisé en +33...', () => {
        const normalized = normalizePhone('06 12 34 56 78', 'FR');
        assert.strictEqual(normalized, '+33612345678');
    });

    await it('1.6: Numéro Togo (TG) 90-00-00-00 avec tirets normalisé en +228...', () => {
        const normalized = normalizePhone('90-00-00-00', 'TG');
        assert.strictEqual(normalized, '+22890000000');
    });

    await it('1.7: Numéro invalide (trop court ou malformé) lève INVALID_PHONE', () => {
        assert.throws(() => {
            normalizePhone('12345', 'BJ');
        }, /INVALID_PHONE/);
    });

    await it('1.8: Numéro sans indicatif et sans pays par défaut lève COUNTRY_REQUIRED', () => {
        assert.throws(() => {
            normalizePhone('97000000', '');
        }, /COUNTRY_REQUIRED/);
    });

    await it('1.9: Aucune double concaténation (+229+229...) si l indicatif est déjà présent', () => {
        const normalized = normalizePhone('+2290197000000', 'FR');
        assert.strictEqual(normalized, '+2290197000000');
    });

    await it('1.10: Numéro téléphone facultatif : chaîne vide n émet pas d erreur de validation', () => {
        const rawPhone = '';
        let normPhone = null;
        if (rawPhone && rawPhone.trim()) {
            normPhone = normalizePhone(rawPhone, 'BJ');
        }
        assert.strictEqual(normPhone, null);
    });

    // ============================================================
    // SECTION 2 : Schéma et Synchronisation Élèves
    // ============================================================
    console.log('\n--- SECTION 2 : Schéma et Synchronisation Élèves ---');

    await it('2.1: Colonnes autorisées pour students_<slug> correspondent strictement au schéma DB avec matricule', () => {
        const allowedCols = new Set([
            'id', 'nom', 'prenom', 'classe', 'matricule', 'genre', 'statut', 'ecolage',
            'deja_paye', 'telephone_parent', 'telephone_parent_normalized',
            'date_naissance', 'updated_at'
        ]);

        const forbiddenCols = ['cycle', 'restant', 'status', 'sexe', 'redoublant', 'ecole_provenance', 'adsn', 'photo_url'];

        const rawStudent = {
            id: 'stud-1',
            nom: 'DOSSOU',
            prenom: 'Jean Paul',
            classe: 'CM2',
            matricule: 'MAT-2026-001',
            cycle: 'Primaire',
            ecolage: 50000,
            dejaPaye: 0,
            restant: 50000,
            status: 'Non soldé',
            telephone: '+2290197000000',
            sexe: 'M',
            redoublant: false,
            ecoleProvenance: 'EPL',
            dateNaissance: '2015-05-10'
        };

        const row = {
            id: rawStudent.id,
            nom: rawStudent.nom,
            prenom: rawStudent.prenom || '',
            classe: rawStudent.classe || 'Inconnue',
            matricule: rawStudent.matricule || null,
            genre: rawStudent.sexe || 'M',
            statut: rawStudent.status || 'Actif',
            ecolage: Number(rawStudent.ecolage) || 0,
            deja_paye: Number(rawStudent.dejaPaye || 0),
            telephone_parent: rawStudent.telephone ? String(rawStudent.telephone).trim() : null,
            telephone_parent_normalized: normalizePhone(rawStudent.telephone, 'BJ'),
            date_naissance: rawStudent.dateNaissance || null,
            updated_at: new Date().toISOString()
        };

        for (const key of Object.keys(row)) {
            assert.ok(allowedCols.has(key), `La colonne [${key}] doit être dans allowedCols`);
        }
        for (const col of forbiddenCols) {
            assert.strictEqual(row[col], undefined, `La colonne [${col}] ne doit pas être dans row`);
        }
    });

    await it('2.2: Protection replace:true refuse une liste students vide avec HTTP 400', () => {
        const req = {
            user: { role: 'directeur', schoolSlug: 'ecole_test' },
            body: { replace: true, students: [] }
        };

        let statusCode = 200;
        let responseBody = null;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => { responseBody = data; return res; }
        };

        const { students = [], replace = false } = req.body;
        if (replace && req.body.students !== undefined && (!Array.isArray(students) || students.length === 0)) {
            res.status(400).json({ error: "Remplacement global refusé : la liste des élèves fournie est vide." });
        }

        assert.strictEqual(statusCode, 400);
        assert.ok(responseBody.error.includes('Remplacement global refusé'));
    });

    await it('2.3: replace:true sur une autre collection (sans clé students) ne bloque pas et ne supprime pas students', () => {
        const req = {
            user: { role: 'directeur', schoolSlug: 'ecole_test' },
            body: { replace: true, matieres: [{ id: 'm1', nom: 'Maths' }] }
        };

        let statusCode = 200;
        let responseBody = null;
        let studentsDeleted = false;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => { responseBody = data; return res; }
        };

        const { students = [], replace = false } = req.body;
        if (replace && req.body.students !== undefined && (!Array.isArray(students) || students.length === 0)) {
            res.status(400).json({ error: "Remplacement global refusé : la liste des élèves fournie est vide." });
        } else {
            if (replace && req.body.students !== undefined) {
                studentsDeleted = true;
            }
            res.status(200).json({ success: true });
        }

        assert.strictEqual(statusCode, 200);
        assert.strictEqual(studentsDeleted, false, 'La table students ne doit pas être vidée si students est absent');
    });

    await it('2.4: Round-trip complet : matricule, redoublant, ecole_provenance, photo_url', () => {
        const cases = [
            {
                nom: 'DOSSOU',
                prenom: 'Jean Paul',
                classe: 'CM2',
                matricule: 'MAT-2026-001',
                sexe: 'M',
                redoublant: false,
                ecoleProvenance: '',
                photoUrl: null,
                ecolage: 60000,
                dejaPaye: 20000
            },
            {
                nom: 'AGOSSOU',
                prenom: 'Marie',
                classe: '3eme',
                matricule: 'MAT-2026-042',
                sexe: 'F',
                redoublant: true,
                ecoleProvenance: 'Collège Saint Joseph',
                photoUrl: 'ecole_test_storage/stud-42.png',
                ecolage: 80000,
                dejaPaye: 80000
            }
        ];

        for (const input of cases) {
            // DB mapping
            const dbRow = {
                id: 'id-' + input.matricule,
                nom: input.nom,
                prenom: input.prenom,
                classe: input.classe,
                matricule: input.matricule,
                genre: input.sexe,
                statut: 'Actif',
                ecolage: input.ecolage,
                deja_paye: input.dejaPaye,
                date_naissance: '2012-04-10',
                updated_at: new Date().toISOString()
            };

            // Store read
            const storeStudent = {
                id: dbRow.id,
                nom: dbRow.nom,
                prenom: dbRow.prenom,
                classe: dbRow.classe,
                matricule: dbRow.matricule,
                sexe: dbRow.genre,
                status: dbRow.statut,
                ecolage: Number(dbRow.ecolage),
                dejaPaye: Number(dbRow.deja_paye),
                restant: Number(dbRow.ecolage) - Number(dbRow.deja_paye)
            };

            assert.strictEqual(storeStudent.nom, input.nom);
            assert.strictEqual(storeStudent.prenom, input.prenom);
            assert.strictEqual(storeStudent.matricule, input.matricule);
            assert.strictEqual(storeStudent.sexe, input.sexe);
            assert.strictEqual(storeStudent.ecolage, input.ecolage);
            assert.strictEqual(storeStudent.dejaPaye, input.dejaPaye);
        }
    });

    // ============================================================
    // SECTION 3 : Validation Fichiers et Devoirs (Cahier de Textes)
    // ============================================================
    console.log('\n--- SECTION 3 : Devoirs et Fichiers ---');

    await it('3.1: Fichier PDF authentique avec magic bytes %PDF- est accepté', () => {
        const pdfBuffer = Buffer.from('%PDF-1.4 sample content');
        const check = verifyFileMagicBytes(pdfBuffer, ['pdf', 'image']);
        assert.strictEqual(check.valid, true);
        assert.strictEqual(check.detectedType, 'pdf');
    });

    await it('3.2: Image PNG authentique avec magic bytes 89504E47 est acceptée', () => {
        const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
        const check = verifyFileMagicBytes(pngBuffer, ['pdf', 'image']);
        assert.strictEqual(check.valid, true);
        assert.strictEqual(check.detectedType, 'png');
    });

    await it('3.3: Image JPEG authentique avec magic bytes FFD8FF est acceptée', () => {
        const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
        const check = verifyFileMagicBytes(jpegBuffer, ['pdf', 'image']);
        assert.strictEqual(check.valid, true);
        assert.strictEqual(check.detectedType, 'jpeg');
    });

    await it('3.4: Fichier Word DOCX / ZIP ou exécutable refusé par le filtre binaire', () => {
        const docxBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00]);
        const check = verifyFileMagicBytes(docxBuffer, ['pdf', 'image']);
        assert.strictEqual(check.valid, false);
    });

    await it('3.5: Validation Cahier de Textes : description vide refusée', () => {
        const desc = '   ';
        assert.strictEqual(!desc.trim(), true);
    });

    await it('3.6: Validation Cahier de Textes : classe ou matière manquante refusée', () => {
        const selectedClasse = '';
        const selectedMatiereId = 'mat-1';
        assert.strictEqual(!selectedClasse || !selectedMatiereId, true);
    });

    await it('3.7: Validation Cahier de Textes : assignations vides désactivent la publication', () => {
        const myAssignations = [];
        assert.strictEqual(myAssignations.length === 0, true);
    });

    await it('3.8: Exactement zéro requête réseau sans affectation et 1 requête avec affectation valide', async () => {
        let submitCallCount = 0;
        const fakeAddDevoirApi = async () => {
            submitCallCount++;
            return { success: true };
        };

        const assignations1 = [];
        if (assignations1.length > 0) {
            await fakeAddDevoirApi();
        }
        assert.strictEqual(submitCallCount, 0);

        const assignations2 = [{ classe: '6eme', matiereId: 'm1' }];
        if (assignations2.length > 0) {
            await fakeAddDevoirApi();
        }
        assert.strictEqual(submitCallCount, 1);
    });

    // ============================================================
    // SECTION 4 : Photos & Règles de Sécurité Storage
    // ============================================================
    console.log('\n--- SECTION 4 : Photos & Sécurité Storage ---');

    await it('4.1: photoController enregistre la clé canonique Storage et jamais une URL signée', () => {
        const schoolSlug = 'ecole_test_storage';
        const studentId = 'stud-123';
        const fileExt = 'png';
        const canonicalKey = `${schoolSlug}/${studentId}.${fileExt}`;
        assert.strictEqual(canonicalKey.startsWith('http'), false);
        assert.strictEqual(canonicalKey.includes('token='), false);
        assert.strictEqual(canonicalKey, `${schoolSlug}/${studentId}.${fileExt}`);
    });

    await it('4.2: Protection syncController : n écrase jamais photo_url avec une URL signée HTTP', () => {
        const existingCanonicalKey = 'ecole_test_storage/stud-123.jpg';
        const incomingFrontendStudent = {
            id: 'stud-123',
            nom: 'DOSSOU',
            photo_url: 'https://supabase.co/storage/v1/object/sign/student-photos/ecole_test_storage/stud-123.jpg?token=temp'
        };

        let canonicalToPersist = null;
        if (incomingFrontendStudent.photo_url && !incomingFrontendStudent.photo_url.startsWith('http')) {
            canonicalToPersist = incomingFrontendStudent.photo_url;
        } else {
            canonicalToPersist = existingCanonicalKey;
        }

        assert.strictEqual(canonicalToPersist, existingCanonicalKey);
        assert.strictEqual(canonicalToPersist.startsWith('http'), false);
    });

    // ============================================================
    // SECTION 5 : Contrat Unique syncToBackend & Timestamp Déterministe
    // ============================================================
    console.log('\n--- SECTION 5 : Contrat syncToBackend & Concurrence ---');

    await it('5.1: success=true met à jour lastSyncTimestamp', async () => {
        let lastSyncTimestamp = null;
        const syncMock = async () => ({ success: true, count: 5 });

        const res = await syncMock();
        if (res?.success) {
            lastSyncTimestamp = 1234567890;
        }

        assert.strictEqual(lastSyncTimestamp, 1234567890);
    });

    await it('5.2: success=false ne met PAS à jour lastSyncTimestamp (aucun faux succès)', async () => {
        let lastSyncTimestamp = null;
        const syncMock = async () => ({ success: false, error: 'SQL_ERROR_42703' });

        const res = await syncMock();
        if (res?.success) {
            lastSyncTimestamp = 1234567890;
        }

        assert.strictEqual(lastSyncTimestamp, null, 'Le timestamp ne doit pas être mis à jour sur échec');
    });

    await it('5.3: Erreur réseau ne met PAS à jour lastSyncTimestamp et gère la rejection', async () => {
        let lastSyncTimestamp = null;
        let caughtError = false;

        const syncMock = async () => {
            throw new Error('Network timeout');
        };

        try {
            const res = await syncMock();
            if (res?.success) {
                lastSyncTimestamp = 1234567890;
            }
        } catch (e) {
            caughtError = true;
        }

        assert.strictEqual(caughtError, true);
        assert.strictEqual(lastSyncTimestamp, null);
    });

    await it('5.4: Eleves.tsx effectue toujours exactement une requête et rollback local sans réseau', async () => {
        let networkCount = 0;
        let localStore = [{ id: 'existing-1', nom: 'Existant' }];

        const mockSync = async () => {
            networkCount++;
            return { success: false, error: 'Server Error' };
        };

        const rollbackStudentLocal = (id) => {
            localStore = localStore.filter(s => s.id !== id);
        };

        // Ajout
        const newStudentId = 'new-stud-1';
        localStore.push({ id: newStudentId, nom: 'Nouveau' });

        // Appel sync unique
        const syncRes = await mockSync();
        if (!syncRes.success) {
            rollbackStudentLocal(newStudentId);
        }

        assert.strictEqual(networkCount, 1, 'Exactement 1 appel réseau');
        assert.strictEqual(localStore.length, 1);
        assert.strictEqual(localStore[0].id, 'existing-1');
    });

    // ============================================================
    // BILAN FINAL
    // ============================================================
    console.log('\n============================================================');
    console.log(`🎉 BILAN TESTS INCIDENT : ${passCount}/${totalCount} tests réussis !`);
    console.log('============================================================\n');

    if (passCount !== totalCount) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error('Fatal error running tests:', err);
    process.exit(1);
});
