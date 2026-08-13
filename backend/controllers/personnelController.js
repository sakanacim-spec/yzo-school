const crypto = require('crypto');
const { supabase, supabaseAdmin } = require('../utils/supabase');
const { normalizePhone, buildAuthEmail } = require('../utils/helpers');

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

        // 1. Créer le compte Supabase Auth pour le personnel avec l'email synthétique déterministe SHA-256
        const syntheticEmail = buildAuthEmail(schoolSlug, phoneNormalized);
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

        // 2. Insérer le profil dans profiles_<schoolSlug> avec l'UUID Auth OBLIGATOIRE (Aucune colonne password)
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

// ── PUT /api/personnel/:id/phone (Modification Administrative du Téléphone) ────────
async function updateMemberPhoneByAdmin(req, res) {
    const { role: userRole, schoolSlug } = req.user;
    const { id: targetUserId } = req.params;
    const { newTelephone, countryCode } = req.body;

    if (userRole !== 'directeur' && userRole !== 'directeur_general' && userRole !== 'admin') {
        return res.status(403).json({ error: 'Seul un administrateur ou un directeur peut modifier le numéro d\'un membre.' });
    }

    if (!targetUserId || !newTelephone) {
        return res.status(400).json({ error: 'L\'identifiant cible et le nouveau numéro de téléphone sont requis.' });
    }

    let newPhoneNormalized;
    try {
        newPhoneNormalized = normalizePhone(newTelephone, countryCode);
    } catch (err) {
        return res.status(400).json({ error: 'Nouveau numéro de téléphone invalide.' });
    }

    try {
        // 1. Vérifier que le compte cible existe dans l'école
        const { data: targetProfile, error: targetErr } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('id, telephone, phone_normalized, role')
            .eq('id', targetUserId)
            .single();

        if (targetErr || !targetProfile) {
            return res.status(404).json({ error: 'Membre introuvable dans cet établissement.' });
        }

        // 2. Vérifier l'unicité du nouveau numéro
        const { data: existing } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('id')
            .eq('phone_normalized', newPhoneNormalized)
            .neq('id', targetUserId)
            .maybeSingle();

        if (existing) {
            return res.status(409).json({ error: 'Ce numéro de téléphone est déjà attribué à un autre membre.' });
        }

        // 3. Relire l'utilisateur Auth avant toute modification pour conserver l'email et l'intégralité des métadonnées
        const { data: preAuthData, error: preFetchErr } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
        if (preFetchErr || !preAuthData?.user) {
            console.error('❌ [Admin UpdatePhone] Échec lecture préalable Auth:', preFetchErr?.message);
            return res.status(500).json({ error: 'Échec de l\'accès au compte d\'authentification du membre.' });
        }

        const oldAuthEmail = preAuthData.user.email;
        const previousMetadata = preAuthData.user.user_metadata || {};
        const newAuthEmail = buildAuthEmail(schoolSlug, newPhoneNormalized);

        // 4. Mettre à jour Supabase Auth avec préservation des métadonnées (role, school_slug, etc.)
        const updatedMetadata = {
            ...previousMetadata,
            phone_normalized: newPhoneNormalized
        };

        const { data: updatedAuthUser, error: authUpdateErr } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
            email: newAuthEmail,
            email_confirm: true,
            user_metadata: updatedMetadata
        });

        if (authUpdateErr || !updatedAuthUser?.user) {
            console.error('❌ [Admin UpdatePhone] Échec mise à jour Supabase Auth:', authUpdateErr?.message);
            return res.status(500).json({ error: 'Échec de la mise à jour Auth : ' + (authUpdateErr?.message || 'Utilisateur non mis à jour.') });
        }

        // 5. Relecture explicite et contrôle strict des propriétés de l'utilisateur Auth
        const { data: checkAuthData, error: checkAuthErr } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
        const checkUser = checkAuthData?.user;
        const checkMeta = checkUser?.user_metadata || {};

        if (
            checkAuthErr ||
            !checkUser ||
            checkUser.id !== targetUserId ||
            checkUser.email !== newAuthEmail ||
            checkMeta.phone_normalized !== newPhoneNormalized ||
            checkMeta.role !== previousMetadata.role ||
            checkMeta.school_slug !== previousMetadata.school_slug
        ) {
            console.error('❌ [Admin UpdatePhone] Contrôle de relecture Auth échoué.');
            return res.status(500).json({ error: 'Erreur de confirmation des métadonnées d\'authentification du membre.' });
        }

        // 6. Mettre à jour le profil SQL
        const { error: profileUpdateErr } = await supabase
            .from(`profiles_${schoolSlug}`)
            .update({
                telephone: newTelephone.trim(),
                phone_normalized: newPhoneNormalized
            })
            .eq('id', targetUserId);

        if (profileUpdateErr) {
            console.error('❌ [Admin UpdatePhone] Échec mise à jour profil SQL:', profileUpdateErr.message);
            
            // 7. Compensation Auth : Restauration de l'ancien email et métadonnées antérieures
            const { error: compErr } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
                email: oldAuthEmail,
                email_confirm: true,
                user_metadata: previousMetadata
            });

            // Contrôle de confirmation après compensation
            const { data: compCheckData } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
            const compUser = compCheckData?.user;

            if (compErr || !compUser || compUser.email !== oldAuthEmail) {
                const correlationId = crypto.randomBytes(8).toString('hex');
                console.error(`❌ [RÉCONCILIATION_ADMIN_REQUISE] CorrelationID=${correlationId}, TargetUserID=${targetUserId}, FailedStep=ADMIN_PHONE_UPDATE_COMPENSATION_FAILURE`);
                return res.status(500).json({ 
                    error: `Échec critique de synchronisation. RÉCONCILIATION_ADMIN_REQUISE (CorrelationID: ${correlationId})`
                });
            }

            return res.status(500).json({ error: 'Échec de la mise à jour du profil : ' + profileUpdateErr.message });
        }

        return res.json({ message: 'Numéro de téléphone du membre mis à jour avec succès.', phone_normalized: newPhoneNormalized });
    } catch (err) {
        console.error('Admin UpdatePhone Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la modification administrative du numéro.' });
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

module.exports = { getPersonnel, createPersonnel, updateMemberPhoneByAdmin, deletePersonnel };
