const { supabase, supabaseAdmin } = require('../utils/supabase');
const { normalizePhone } = require('../utils/helpers');

// ── GET /api/personnel ──────────────────────────────
async function getPersonnel(req, res) {
    const { role, schoolSlug } = req.user;
    
    if (role !== 'directeur' && role !== 'directeur_general' && role !== 'admin') {
        return res.status(403).json({ error: 'Accès refusé.' });
    }

    try {
        const { data: personnel, error } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('id, nom, telephone, phone_normalized, role, created_at')
            .in('role', ['admin', 'superviseur', 'surveillant', 'comptable', 'censeur', 'secretaire', 'professeur']);

        if (error) throw error;
        return res.json(personnel);
    } catch (err) {
        console.error('getPersonnel Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la récupération du personnel.' });
    }
}

// ── POST /api/personnel ──────────────────────────────
async function createPersonnel(req, res) {
    const { role: userRole, schoolSlug } = req.user;
    const { nom, telephone, password, role, countryCode } = req.body;

    if (userRole !== 'directeur' && userRole !== 'directeur_general') {
        return res.status(403).json({ error: 'Seul le directeur peut créer un compte membre du personnel.' });
    }

    if (!nom || !telephone || !password || !role) {
        return res.status(400).json({ error: 'Champs requis : nom, telephone, password, role.' });
    }

    if (!['admin', 'superviseur', 'comptable', 'censeur', 'secretaire', 'professeur', 'surveillant'].includes(role)) {
        return res.status(400).json({ error: 'Rôle invalide.' });
    }

    // Normalisation E.164
    let phoneNormalized;
    try {
        phoneNormalized = normalizePhone(telephone, countryCode);
    } catch (err) {
        if (err.message === 'COUNTRY_REQUIRED') {
            return res.status(400).json({ error: 'Le code pays est requis pour valider le numéro de téléphone.' });
        }
        return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
    }

    try {
        // Vérifier si le numéro normalisé est déjà utilisé
        const { data: existing } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('id')
            .eq('phone_normalized', phoneNormalized)
            .maybeSingle();

        if (existing) {
            return res.status(409).json({ error: 'Ce numéro de téléphone est déjà enregistré pour un autre compte.' });
        }

        // 1. Créer le compte Supabase Auth pour le personnel (OBLIGATOIRE - STOP IMMÉDIAT EN CAS D'ÉCHEC)
        const syntheticEmail = `staff_${schoolSlug}_${phoneNormalized.replace(/\D/g, '')}@auth.yziow.internal`;
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: syntheticEmail,
            password: password,
            email_confirm: true,
            user_metadata: {
                nom: nom.trim(),
                role: role,
                school_slug: schoolSlug,
                phone_normalized: phoneNormalized
            }
        });

        if (authErr || !authData?.user?.id) {
            console.error('❌ Échec création Supabase Auth Personnel:', authErr?.message);
            return res.status(500).json({ error: 'Échec de la création du compte d\'authentification : ' + (authErr?.message || 'UUID non généré.') });
        }

        const staffAuthUserId = authData.user.id;

        // 2. Insérer le profil dans profiles_<schoolSlug> avec l'UUID Auth OBLIGATOIRE
        const { data: personnel, error: insertErr } = await supabase
            .from(`profiles_${schoolSlug}`)
            .insert({
                id: staffAuthUserId,
                nom: nom.trim(),
                telephone: telephone.trim(),
                phone_normalized: phoneNormalized,
                role: role
            })
            .select('id, nom, telephone, phone_normalized, role, created_at')
            .single();

        if (insertErr) {
            console.error(`❌ Échec insertion profil personnel dans profiles_${schoolSlug}:`, insertErr.message);
            // Compensation contrôlée
            const { error: deleteAuthErr } = await supabaseAdmin.auth.admin.deleteUser(staffAuthUserId);
            if (deleteAuthErr) {
                console.error(`❌ [Compensation Failure] Échec suppression Auth Personnel ${staffAuthUserId}:`, deleteAuthErr.message);
            } else {
                console.log(`✅ [Compensation] Suppression du compte Auth Personnel ${staffAuthUserId} effectuée.`);
            }
            return res.status(500).json({ error: 'Échec de la création du profil du personnel : ' + insertErr.message });
        }

        return res.status(201).json({
            message: 'Compte personnel créé avec succès.',
            personnel
        });
    } catch (err) {
        console.error('createPersonnel Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la création du compte personnel : ' + err.message });
    }
}

// ── DELETE /api/personnel/:id ──────────────────────────────
async function deletePersonnel(req, res) {
    const { role: userRole, schoolSlug } = req.user;
    const { id } = req.params;

    if (userRole !== 'directeur' && userRole !== 'directeur_general') {
        return res.status(403).json({ error: 'Accès refusé.' });
    }

    try {
        const { error: deleteProfileErr } = await supabase
            .from(`profiles_${schoolSlug}`)
            .delete()
            .eq('id', id);

        if (deleteProfileErr) throw deleteProfileErr;

        // Supprimer également le compte Auth Supabase correspondant
        const { error: deleteAuthErr } = await supabaseAdmin.auth.admin.deleteUser(id);
        if (deleteAuthErr) {
            console.warn(`⚠️ Échec suppression Auth User ${id} lors de la suppression personnel:`, deleteAuthErr.message);
        } else {
            console.log(`✅ Compte Auth ${id} supprimé lors du retrait du membre du personnel.`);
        }

        return res.json({ message: 'Compte personnel supprimé avec succès.' });
    } catch (err) {
        console.error('deletePersonnel Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la suppression : ' + err.message });
    }
}

module.exports = { getPersonnel, createPersonnel, deletePersonnel };
