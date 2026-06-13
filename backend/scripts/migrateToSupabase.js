const fs = require('fs');
const path = require('path');
const { supabase } = require('../utils/supabase');
const bcrypt = require('bcryptjs');

const DATA_PATH = path.join(__dirname, '..', 'data', 'edufinance_db.json');

async function migrate() {
    try {
        console.log('🚀 Début de la migration optimisée vers Supabase...');

        if (!fs.existsSync(DATA_PATH)) {
            console.error('❌ Fichier JSON introuvable à l\'emplacement :', DATA_PATH);
            return;
        }

        const db = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
        console.log(`📊 Données locales : ${db.students.length} élèves, ${db.payments.length} paiements.`);

        // 0. NETTOYAGE (Optionnel mais recommandé pour éviter les doublons)
        console.log('🧹 Nettoyage des anciennes données Supabase...');
        await supabase.from('payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('students').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        // On ne supprime pas les profils pour garder les accès admins, 
        // mais on supprimera les profils parents
        await supabase.from('profiles').delete().eq('role', 'parent');
        console.log('✨ Supabase est propre, prêt pour l\'import.');

        // 1. Migration des Parents (Profiles)
        console.log('👥 Migration des parents...');
        const parentBatches = [];
        for (const parent of db.parents) {
            const parentObj = {
                nom: parent.nom,
                telephone: parent.telephone,
                password: parent.password,
                role: 'parent'
            };

            // On ne garde l'ID que si c'est un UUID valide (format Supabase)
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parent.id);
            if (isUuid) {
                parentObj.id = parent.id;
            }

            parentBatches.push(parentObj);
        }

        if (parentBatches.length > 0) {
            const { error } = await supabase.from('profiles').upsert(parentBatches, { onConflict: 'telephone' });
            if (error) console.error('❌ Erreur migration parents:', error.message);
            else console.log(`✅ ${parentBatches.length} parents migrés.`);
        }

        // 2. Migration des Admins (Profiles)
        console.log('🛡️ Création des comptes administratifs...');
        const adminAccounts = [
            { nom: 'Directeur Général', telephone: '0001', role: 'directeur', pass: 'admin123' },
            { nom: 'Comptable Principal', telephone: '0002', role: 'comptable', pass: 'compta123' },
            { nom: 'Proviseur', telephone: '0003', role: 'proviseur', pass: 'proviseur123' }
        ];

        for (const adm of adminAccounts) {
            const hashed = await bcrypt.hash(adm.pass, 10);
            await supabase.from('profiles').upsert({
                nom: adm.nom,
                telephone: adm.telephone,
                password: hashed,
                role: adm.role
            }, { onConflict: 'telephone' });
        }
        console.log('✅ Comptes admins créés.');

        // 3. Migration des Élèves (Batch de 100)
        console.log('🎓 Migration des élèves...');
        const studentData = db.students.map(s => ({
            id: s.id,
            nom: s.nom,
            prenom: s.prenom,
            classe: s.classe,
            cycle: s.cycle,
            ecolage: s.ecolage,
            deja_paye: s.deja_paye,
            restant: s.restant,
            status: s.status,
            telephone_parent: s.telephone
        }));

        for (let i = 0; i < studentData.length; i += 100) {
            const batch = studentData.slice(i, i + 100);
            const { error } = await supabase.from('students').upsert(batch);
            if (error) console.error(`❌ Erreur batch élèves ${i}:`, error.message);
            else console.log(`   - Progrès : ${Math.min(i + 100, studentData.length)}/${studentData.length} élèves`);
        }

        // 4. Migration des Paiements (Batch de 100)
        console.log('💰 Migration des paiements...');
        const paymentData = db.payments.map(p => ({
            id: p.id,
            student_id: p.student_id,
            montant: p.montant,
            date: p.date,
            recu: p.recu,
            note: p.note
        }));

        for (let i = 0; i < paymentData.length; i += 100) {
            const batch = paymentData.slice(i, i + 100);
            const { error } = await supabase.from('payments').upsert(batch);
            if (error) console.error(`❌ Erreur batch paiements ${i}:`, error.message);
            else console.log(`   - Progrès : ${Math.min(i + 100, paymentData.length)}/${paymentData.length} paiements`);
        }

        console.log('✅ Migration terminée avec succès !');
    } catch (err) {
        console.error('💥 Erreur fatale pendant la migration:', err.message);
    }
}

migrate();
