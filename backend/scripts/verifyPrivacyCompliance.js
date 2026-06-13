const { createSchool } = require('../controllers/superAdminController');
const { register: registerParent } = require('../controllers/authController');
const { supabase } = require('../utils/supabase');
const crypto = require('crypto');

function mockResponse() {
    const res = {
        statusCode: 200,
        headers: {},
        jsonPayload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.jsonPayload = data;
            return this;
        }
    };
    return res;
}

async function runTests() {
    let failed = false;
    
    console.log('\n--- 1. TEST REJET ÉCOLE SANS CONSENTEMENTS ---');
    try {
        const req = {
            body: {
                name: "Test School No Consent",
                slug: "test-noconsent-school",
                admin_nom: "Director Test",
                admin_telephone: "99001122",
                admin_password: "password123",
                accepted_terms: false, // Fails validation
                accepted_privacy_policy: true,
                marketing_consent: false
            },
            headers: { 'x-forwarded-for': '127.0.0.1' }
        };
        const res = mockResponse();
        await createSchool(req, res);
        
        if (res.statusCode === 400 && res.jsonPayload.error.includes("conditions")) {
            console.log("✅ OK: Création d'école rejetée sans CGU.");
        } else {
            console.error(`❌ ÉCHEC: Attendu code 400 avec message d'erreur, reçu ${res.statusCode}:`, res.jsonPayload);
            failed = true;
        }
    } catch (err) {
        console.error("❌ ÉCHEC avec erreur:", err);
        failed = true;
    }

    console.log('\n--- 2. TEST REJET PARENT SANS CONSENTEMENTS ---');
    try {
        const req = {
            body: {
                nom: "Parent Test No Consent",
                telephone: "99334455",
                password: "password123",
                school_slug: "demo",
                accepted_terms: true,
                accepted_privacy_policy: false, // Fails validation
                marketing_consent: false,
                parent_photo_authorization: false
            },
            headers: { 'x-forwarded-for': '127.0.0.1' }
        };
        const res = mockResponse();
        await registerParent(req, res);

        if (res.statusCode === 400 && res.jsonPayload.error.includes("données")) {
            console.log("✅ OK: Inscription parent rejetée sans consentement de traitement de données.");
        } else {
            console.error(`❌ ÉCHEC: Attendu code 400 avec message d'erreur, reçu ${res.statusCode}:`, res.jsonPayload);
            failed = true;
        }
    } catch (err) {
        console.error("❌ ÉCHEC avec erreur:", err);
        failed = true;
    }

    console.log('\n--- 3. TEST CRÉATION D\'ÉCOLE ET ENREGISTREMENT ---');
    const testSlug = "schooltest" + Math.floor(Math.random() * 100000);
    try {
        const req = {
            body: {
                name: "Test School Compliant",
                slug: testSlug,
                admin_nom: "Compliant Director",
                admin_telephone: "99" + Math.floor(Math.random() * 1000000),
                admin_password: "password123",
                accepted_terms: true,
                accepted_privacy_policy: true,
                marketing_consent: true
            },
            headers: { 'x-forwarded-for': '1.2.3.4' }
        };
        const res = mockResponse();
        await createSchool(req, res);

        if (res.statusCode === 201) {
            console.log("✅ OK: École créée avec succès.");
            
            // Vérification dans supabase
            const { data: dbSchool } = await supabase
                .from('schools')
                .select('*')
                .eq('slug', testSlug)
                .single();

            const expectedHash = crypto.createHash('sha256').update('1.2.3.4').digest('hex');

            if (dbSchool.accepted_terms && dbSchool.accepted_privacy_policy && dbSchool.marketing_consent) {
                console.log("✅ OK: Consentements sauvegardés sur la table globale schools.");
            } else {
                console.error("❌ ÉCHEC: Les consentements ne correspondent pas:", dbSchool);
                failed = true;
            }

            if (dbSchool.signup_ip_hash === expectedHash) {
                console.log("✅ OK: IP Hachée (SHA-256) validée.");
            } else {
                console.error(`❌ ÉCHEC: IP Hachée incorrecte. Attendu ${expectedHash}, reçu ${dbSchool.signup_ip_hash}`);
                failed = true;
            }

            if (dbSchool.consented_at && !isNaN(Date.parse(dbSchool.consented_at))) {
                console.log(`✅ OK: consented_at présent et valide (${dbSchool.consented_at})`);
            } else {
                console.error("❌ ÉCHEC: consented_at manquant ou invalide:", dbSchool.consented_at);
                failed = true;
            }
            
            // Vérification de la création de l'admin
            const { data: dbAdmin } = await supabase
                .from(`profiles_${testSlug}`)
                .select('*')
                .eq('telephone', req.body.admin_telephone)
                .single();
                
            if (dbAdmin.accepted_terms && dbAdmin.accepted_privacy_policy && dbAdmin.marketing_consent && dbAdmin.signup_ip_hash === expectedHash) {
                console.log("✅ OK: Admin créé dans profiles_<school_slug> avec les bons consentements et IP hash.");
            } else {
                console.error("❌ ÉCHEC: Profil de l'admin incomplet dans profiles_<school_slug>:", dbAdmin);
                failed = true;
            }
        } else {
            console.error(`❌ ÉCHEC: Attendu code 201, reçu ${res.statusCode}:`, res.jsonPayload);
            failed = true;
        }
    } catch (err) {
        console.error("❌ ÉCHEC avec erreur:", err);
        failed = true;
    }

    console.log('\n--- 4. TEST INSCRIPTION PARENT COMPLIANTE ---');
    try {
        const parentPhone = "99" + Math.floor(Math.random() * 1000000);
        const req = {
            body: {
                nom: "Parent Compliant",
                telephone: parentPhone,
                password: "password123",
                school_slug: testSlug,
                accepted_terms: true,
                accepted_privacy_policy: true,
                marketing_consent: true,
                parent_photo_authorization: true
            },
            headers: { 'x-forwarded-for': '4.3.2.1' }
        };
        const res = mockResponse();
        await registerParent(req, res);

        if (res.statusCode === 201) {
            console.log("✅ OK: Compte parent créé avec succès.");

            const { data: dbParent } = await supabase
                .from(`profiles_${testSlug}`)
                .select('*')
                .eq('telephone', parentPhone)
                .single();

            const expectedHash = crypto.createHash('sha256').update('4.3.2.1').digest('hex');

            if (dbParent.accepted_terms && dbParent.accepted_privacy_policy && dbParent.marketing_consent && dbParent.parent_photo_authorization) {
                console.log("✅ OK: Consentements sauvegardés sur la table profiles_<school_slug>.");
            } else {
                console.error("❌ ÉCHEC: Les consentements parent ne correspondent pas:", dbParent);
                failed = true;
            }

            if (dbParent.signup_ip_hash === expectedHash) {
                console.log("✅ OK: IP Parent Hachée (SHA-256) validée.");
            } else {
                console.error(`❌ ÉCHEC: IP Hachée parent incorrecte. Attendu ${expectedHash}, reçu ${dbParent.signup_ip_hash}`);
                failed = true;
            }

            if (dbParent.consented_at && !isNaN(Date.parse(dbParent.consented_at))) {
                console.log(`✅ OK: consented_at parent présent et valide (${dbParent.consented_at})`);
            } else {
                console.error("❌ ÉCHEC: consented_at parent manquant ou invalide:", dbParent.consented_at);
                failed = true;
            }
        } else {
            console.error(`❌ ÉCHEC: Attendu code 201, reçu ${res.statusCode}:`, res.jsonPayload);
            failed = true;
        }
    } catch (err) {
        console.error("❌ ÉCHEC avec erreur:", err);
        failed = true;
    }

    // Nettoyage après test
    if (testSlug) {
        console.log(`\n🧹 Nettoyage de l'école de test: ${testSlug}`);
        try {
            const { data: sch } = await supabase.from('schools').select('id').eq('slug', testSlug).single();
            if (sch) {
                await supabase.rpc('drop_school_tables', { school_slug: testSlug });
                await supabase.from('schools').delete().eq('id', sch.id);
                console.log(`✅ Nettoyage réussi.`);
            }
        } catch (e) {
            console.warn(`Avertissement de nettoyage:`, e.message);
        }
    }

    console.log('\n================================================');
    if (failed) {
        console.error('❌ ÉCHEC DES TESTS DE CONFORMITÉ PRIVACY.');
        process.exit(1);
    } else {
        console.log('🎉 TOUS LES TESTS DE CONFORMITÉ SONT RÉUSSIS !');
        process.exit(0);
    }
}

// Lancer après un court délai pour laisser la connexion Supabase s'initialiser
setTimeout(runTests, 2000);
