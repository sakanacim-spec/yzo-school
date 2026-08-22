const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { supabase, supabaseAdmin } = require('../utils/supabase');
const { JWT_SECRET, JWT_EXPIRES } = require('../config');
const { sendWelcomeSMS, sendPasswordResetSMS } = require('../utils/smsService');
const Joi = require('joi');
const crypto = require('crypto');
const { normalizePhone, buildAuthEmail, hashOtp } = require('../utils/helpers');

// Joi validation schema for Parent registration
const parentRegisterSchema = Joi.object({
    nom: Joi.string().trim().required().messages({
        'any.required': 'Le nom complet est requis.'
    }),
    telephone: Joi.string().trim().required().messages({
        'any.required': 'Le numéro de téléphone est requis.'
    }),
    countryCode: Joi.string().trim().allow('', null),
    password: Joi.string().min(6).required().messages({
        'string.min': 'Le mot de passe doit contenir au moins 6 caractères.',
        'any.required': 'Le mot de passe est requis.'
    }),
    school_slug: Joi.string().trim().required().messages({
        'any.required': 'Le code de l\'établissement (school_slug) est requis.'
    }),
    accepted_terms: Joi.boolean().valid(true).required().messages({
        'any.only': 'Vous devez accepter les conditions d\'utilisation.'
    }),
    accepted_privacy_policy: Joi.boolean().valid(true).required().messages({
        'any.only': 'Vous devez accepter le traitement de vos données scolaires.'
    }),
    marketing_consent: Joi.boolean().default(false),
    parent_photo_authorization: Joi.boolean().default(false),
    preferred_language: Joi.string().valid('fr', 'en', 'es', 'ar').default('fr')
});

// Joi validation schema for SaaS School registration
const schoolRegisterSchema = Joi.object({
    school_name: Joi.string().trim().required().messages({
        'any.required': 'Le nom de l\'établissement est requis.'
    }),
    school_type: Joi.string().trim().required().messages({
        'any.required': 'Le type d\'établissement est requis.'
    }),
    admin_nom: Joi.string().trim().required().messages({
        'any.required': 'Le nom du directeur est requis.'
    }),
    admin_telephone: Joi.string().trim().required().messages({
        'any.required': 'Le numéro de téléphone du directeur est requis.'
    }),
    admin_password: Joi.string().min(6).required().messages({
        'string.min': 'Le mot de passe doit contenir au moins 6 caractères.',
        'any.required': 'Le mot de passe est requis.'
    }),
    country: Joi.string().trim().allow('', null),
    city: Joi.string().trim().allow('', null),
    address: Joi.string().trim().allow('', null),
    phone: Joi.string().trim().allow('', null),
    countryCode: Joi.string().trim().allow('', null),
    email: Joi.string().email().allow('', null),
    slogan: Joi.string().trim().allow('', null),
    ministry: Joi.string().trim().allow('', null),
    preferred_language: Joi.string().valid('fr', 'en', 'es', 'ar').default('fr'),
    accepted_terms: Joi.boolean().allow(null),
    accepted_privacy_policy: Joi.boolean().allow(null),
    marketing_consent: Joi.boolean().allow(null),
    referral_code: Joi.string().trim().allow('', null)
});

// ── Register (Uniquement Parents) ──────────────────────────────
async function register(req, res) {
    const { value: validatedData, error: validationError } = parentRegisterSchema.validate(req.body, { abortEarly: false });
    
    if (validationError) {
        return res.status(400).json({ error: validationError.details.map(d => d.message).join(', ') });
    }

    const { nom, telephone, password, school_slug, countryCode } = validatedData;

    // Normalisation E.164 du téléphone
    let phoneNormalized;
    try {
        phoneNormalized = normalizePhone(telephone, countryCode);
    } catch (err) {
        if (err.message === 'COUNTRY_REQUIRED') {
            return res.status(400).json({ error: 'Le code pays est requis pour les numéros au format national.' });
        }
        return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
    }

    let parentAuthUserId = null;

    try {
        const { data: school } = await supabase
            .from('schools')
            .select('status, name')
            .eq('slug', school_slug)
            .single();
            
        if (!school) {
            return res.status(404).json({ error: "Établissement inconnu." });
        }
        if (school.status === 'suspended') {
            return res.status(403).json({ error: "L'établissement est suspendu." });
        }

        // Vérifier si existant via phone_normalized
        const { data: existing } = await supabase
            .from(`profiles_${school_slug}`)
            .select('id')
            .eq('phone_normalized', phoneNormalized)
            .maybeSingle();

        if (existing) {
            return res.status(409).json({ error: 'Ce numéro de téléphone est déjà enregistré.' });
        }

        // 1. Créer le compte Supabase Auth pour le Parent avec l'email synthétique déterministe SHA-256
        const syntheticEmail = buildAuthEmail(school_slug, phoneNormalized);
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: syntheticEmail,
            password: password,
            email_confirm: true,
            user_metadata: {
                nom: nom.trim(),
                role: 'parent',
                school_slug: school_slug,
                phone_normalized: phoneNormalized
            }
        });

        if (authErr || !authData?.user?.id) {
            console.error('❌ Échec création Supabase Auth Parent:', authErr?.message);
            return res.status(500).json({ error: 'Échec de la création du compte d\'authentification : ' + (authErr?.message || 'Identifiant UUID non généré.') });
        }

        parentAuthUserId = authData.user.id;

        // 2. Créer le profil dans la table 'profiles_<slug>' avec l'UUID Auth OBLIGATOIRE (Aucune propriété password)
        const insertPayload = {
            id: parentAuthUserId,
            nom: nom.trim(),
            telephone: telephone.trim(),
            phone_normalized: phoneNormalized,
            role: 'parent'
        };

        const { data: parent, error: profileErr } = await supabase
            .from(`profiles_${school_slug}`)
            .insert(insertPayload)
            .select('id, nom, telephone, phone_normalized, role')
            .single();

        if (profileErr) {
            console.error(`❌ Échec de la création du profil parent dans profiles_${school_slug}:`, profileErr.message);
            // Compensation contrôlée du compte Auth sans masquer les erreurs
            try {
                await supabaseAdmin.auth.admin.deleteUser(parentAuthUserId);
                console.log(`✅ [Compensation] Suppression du compte Auth parent ${parentAuthUserId} effectuée.`);
            } catch (deleteErr) {
                console.error(`❌ [Compensation Failure] Échec de la suppression Auth parent ${parentAuthUserId}:`, deleteErr.message);
            }
            return res.status(500).json({ error: 'Échec de la création du profil parent : ' + profileErr.message });
        }

        // Auto-Link des enfants : ÉGALITÉ E.164 EXACTE
        try {
            const { data: matchingStudents } = await supabase
                .from(`students_${school_slug}`)
                .select('id')
                .eq('telephone_parent_normalized', phoneNormalized);

            if (matchingStudents && matchingStudents.length > 0) {
                const linkPayload = matchingStudents.map(s => ({
                    parent_id: parent.id,
                    student_id: s.id
                }));
                await supabase.from(`parent_student_${school_slug}`).insert(linkPayload);
                console.log(`✅ [AutoLink] ${linkPayload.length} enfant(s) lié(s) de façon E.164 exacte au parent ${parent.id}`);
            }
        } catch (linkErr) {
            console.error('⚠️ [AutoLink Reg] Erreur lors de la liaison automatique :', linkErr.message);
        }

        const token = jwt.sign(
            { id: parent.id, nom: parent.nom, role: parent.role, schoolSlug: school_slug, token_type: 'access' },
            JWT_SECRET,
            { algorithm: 'HS256', expiresIn: JWT_EXPIRES }
        );

        sendWelcomeSMS(phoneNormalized, school.name || 'Votre École').catch(err => console.error("Erreur SMS Bienvenue:", err.message));

        return res.status(201).json({
            message: 'Compte créé avec succès.',
            token,
            parent: { id: parent.id, nom: parent.nom, telephone: parent.telephone, phone_normalized: parent.phone_normalized, role: parent.role, schoolSlug: school_slug },
        });
    } catch (err) {
        console.error('Register Error:', err.message);
        if (parentAuthUserId) {
            try {
                await supabaseAdmin.auth.admin.deleteUser(parentAuthUserId);
                console.log(`✅ [Compensation] Suppression du compte Auth parent ${parentAuthUserId} effectuée.`);
            } catch (deleteErr) {
                console.error(`❌ [Compensation Failure] Échec de la suppression Auth parent ${parentAuthUserId}:`, deleteErr.message);
            }
        }
        return res.status(500).json({ error: 'Erreur lors de la création du compte : ' + err.message });
    }
}

// ── Register School (SaaS Onboarding) ────────────────────────
async function registerSchool(req, res) {
    const { value: validatedData, error: validationError } = schoolRegisterSchema.validate(req.body, { abortEarly: false });
    
    if (validationError) {
        return res.status(400).json({ error: validationError.details.map(d => d.message).join(', ') });
    }

    // Normalisation E.164 du téléphone du directeur
    let adminPhoneNormalized;
    try {
        adminPhoneNormalized = normalizePhone(validatedData.admin_telephone, validatedData.countryCode || validatedData.country);
    } catch (err) {
        if (err.message === 'COUNTRY_REQUIRED') {
            return res.status(400).json({ error: 'Le code pays est requis pour valider le numéro du directeur.' });
        }
        return res.status(400).json({ error: 'Numéro de téléphone du directeur invalide.' });
    }

    let adminAuthUserId = null;
    let createdSchoolId = null;
    let cleanSlug = null;

    try {
        cleanSlug = validatedData.school_name
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/(^_|_$)+/g, '')
            .substring(0, 40);

        if (!cleanSlug) {
            cleanSlug = `school_${Math.random().toString(36).substring(2, 8)}_${Date.now().toString().slice(-4)}`;
        }

        // Vérification préalable du slug
        const { data: existing } = await supabase
            .from('schools')
            .select('id')
            .eq('slug', cleanSlug)
            .maybeSingle();

        if (existing) {
            return res.status(409).json({ error: `Le nom "${validatedData.school_name}" génère un identifiant déjà utilisé. Veuillez choisir un nom légèrement différent.` });
        }

        // 1. Créer le compte Supabase Auth pour le Directeur avec l'email synthétique déterministe SHA-256
        const syntheticEmail = buildAuthEmail(cleanSlug, adminPhoneNormalized);
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: syntheticEmail,
            password: validatedData.admin_password,
            email_confirm: true,
            user_metadata: {
                nom: validatedData.admin_nom.trim(),
                role: 'directeur',
                school_slug: cleanSlug,
                phone_normalized: adminPhoneNormalized
            }
        });

        if (authErr || !authData?.user?.id) {
            console.error('❌ Échec de la création du compte Supabase Auth Directeur:', authErr?.message);
            return res.status(500).json({ error: 'Échec de la création du compte Supabase Auth Directeur : ' + (authErr?.message || 'UUID non généré.') });
        }

        adminAuthUserId = authData.user.id;

        let affiliateId = null;
        if (validatedData.referral_code) {
            const { data: affiliate } = await supabase
                .from('affiliates')
                .select('id')
                .eq('referral_code', validatedData.referral_code.trim())
                .maybeSingle();
            if (affiliate) {
                affiliateId = affiliate.id;
            }
        }

        // 2. Créer l'école dans la table 'schools'
        const schoolPayload = {
            name: validatedData.school_name.trim(),
            slug: cleanSlug,
            country: validatedData.country || null,
            city: validatedData.city || null,
            address: validatedData.address || null,
            phone: validatedData.phone || null,
            email: validatedData.email || null,
            slogan: validatedData.slogan || null,
            ministry: validatedData.ministry || null,
            preferred_language: validatedData.preferred_language || 'fr',
            status: 'trial',
            trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            affiliate_id: affiliateId
        };

        const { data: school, error: schoolErr } = await supabase
            .from('schools')
            .insert(schoolPayload)
            .select()
            .single();

        if (schoolErr) {
            console.error('❌ Échec de la création de l\'école dans schools:', schoolErr.message);
            // Compensation Auth User sans masquer les erreurs
            try {
                await supabaseAdmin.auth.admin.deleteUser(adminAuthUserId);
                console.log(`✅ [Compensation] Suppression du compte Auth Directeur ${adminAuthUserId} effectuée.`);
            } catch (deleteErr) {
                console.error(`❌ [Compensation Failure] Échec de la suppression Auth Directeur ${adminAuthUserId}:`, deleteErr.message);
            }
            return res.status(500).json({ error: 'Échec de la création de l\'établissement : ' + schoolErr.message });
        }

        createdSchoolId = school.id;

        // 3. Exécuter l'appel RPC transactionnel create_school_tables avec admin_auth_id OBLIGATOIRE
        const { data: rpcData, error: rpcErr } = await supabase.rpc('create_school_tables', { 
            school_slug: cleanSlug,
            admin_nom: validatedData.admin_nom.trim(),
            admin_telephone: validatedData.admin_telephone.trim(),
            admin_phone_normalized: adminPhoneNormalized,
            admin_auth_id: adminAuthUserId
        });
        
        if (rpcErr) {
            console.error(`❌ Échec du RPC create_school_tables pour ${cleanSlug}:`, rpcErr.message);
            if (createdSchoolId) {
                try {
                    await supabase.from('schools').delete().eq('id', createdSchoolId);
                    console.log(`✅ [Compensation] Suppression de l'école ${createdSchoolId} dans schools effectuée.`);
                } catch (deleteSchoolErr) {
                    console.error(`❌ [Compensation Failure] Échec de la suppression de l'école ${createdSchoolId}:`, deleteSchoolErr.message);
                }
            }
            if (adminAuthUserId) {
                try {
                    await supabaseAdmin.auth.admin.deleteUser(adminAuthUserId);
                    console.log(`✅ [Compensation] Suppression du compte Auth Directeur ${adminAuthUserId} effectuée.`);
                } catch (deleteAuthErr) {
                    console.error(`❌ [Compensation Failure] Échec de la suppression Auth Directeur ${adminAuthUserId}:`, deleteAuthErr.message);
                }
            }
            return res.status(500).json({ error: 'Échec de l\'initialisation des tables d\'école : ' + rpcErr.message });
        }

        const adminUser = rpcData;

        const token = jwt.sign(
            { id: adminUser.id, nom: adminUser.nom, role: adminUser.role, schoolSlug: cleanSlug, token_type: 'access' },
            JWT_SECRET,
            { algorithm: 'HS256', expiresIn: JWT_EXPIRES }
        );

        return res.status(201).json({
            message: 'Établissement et compte Directeur créés avec succès.',
            token,
            user: { id: adminUser.id, nom: adminUser.nom, telephone: adminUser.telephone, phone_normalized: adminUser.phone_normalized, role: adminUser.role, schoolSlug: cleanSlug }
        });
    } catch (err) {
        console.error('Register School Error:', err.message);

        if (createdSchoolId) {
            try {
                await supabase.from('schools').delete().eq('id', createdSchoolId);
                console.log(`✅ [Compensation] Suppression de l'école ${createdSchoolId} dans schools effectuée.`);
            } catch (deleteSchoolErr) {
                console.error(`❌ [Compensation Failure] Échec de la suppression de l'école ${createdSchoolId}:`, deleteSchoolErr.message);
            }
        }
        if (adminAuthUserId) {
            try {
                await supabaseAdmin.auth.admin.deleteUser(adminAuthUserId);
                console.log(`✅ [Compensation] Suppression du compte Auth Directeur ${adminAuthUserId} effectuée.`);
            } catch (deleteAuthErr) {
                console.error(`❌ [Compensation Failure] Échec de la suppression Auth Directeur ${adminAuthUserId}:`, deleteAuthErr.message);
            }
        }
        return res.status(500).json({ error: 'Erreur lors de la création de l\'établissement : ' + err.message });
    }
}

// ── Login (Tout Rôles) ──────────────────────────
async function login(req, res) {
    const { telephone, password, schoolSlug, countryCode } = req.body;

    if (!telephone || !password) {
        return res.status(400).json({ error: 'Champs requis : telephone, password.' });
    }

    try {
        // 1. Branche SuperAdmin ISOLÉE (Recherche ciblée sans scan complet)
        const inputClean = telephone.trim().toLowerCase();
        const { data: superadmin } = await supabase
            .from('superadmins')
            .select('id, nom, username, telephone, email, password')
            .or(`username.ilike.${inputClean},email.ilike.${inputClean},telephone.eq.${telephone.trim()}`)
            .maybeSingle();

        if (superadmin) {
            const valid = await bcrypt.compare(password, superadmin.password);
            if (valid) {
                const token = jwt.sign(
                    { id: superadmin.id, nom: superadmin.nom, role: 'superadmin', schoolSlug: null, token_type: 'access' },
                    JWT_SECRET,
                    { algorithm: 'HS256', expiresIn: JWT_EXPIRES }
                );
                return res.json({
                    message: 'Connexion globale réussie.',
                    token,
                    user: { id: superadmin.id, nom: superadmin.nom, telephone: superadmin.telephone || superadmin.username, role: 'superadmin' }
                });
            } else {
                return res.status(401).json({ error: 'Numéro de téléphone ou mot de passe incorrect.' });
            }
        }
        
        // 2. Sinon, l'utilisateur DOIT avoir sélectionné une école
        if (!schoolSlug) {
            return res.status(400).json({ error: 'Veuillez sélectionner votre établissement pour vous connecter.' });
        }

        // Normalisation E.164 strict du numéro saisi
        let phoneNormalized;
        try {
            phoneNormalized = normalizePhone(telephone, countryCode);
        } catch (err) {
            return res.status(401).json({ error: 'Numéro de téléphone ou mot de passe incorrect.' });
        }

        // Vérification accès école
        const { data: school, error: schoolErr } = await supabase
            .from('schools')
            .select('id, name, slug, status, trial_ends_at, country, address, phone, slogan, ministry')
            .eq('slug', schoolSlug)
            .maybeSingle();

        if (schoolErr || !school) {
            return res.status(404).json({ error: 'Établissement introuvable.' });
        }

        if (school.status === 'suspended') {
            return res.status(403).json({ error: "L'accès à cet établissement est suspendu." });
        }
        if (school.status === 'trial' && new Date(school.trial_ends_at) < new Date()) {
            return res.status(402).json({ error: 'trial_expired', message: "La période d'essai est terminée." });
        }

        // 3. Chercher l'utilisateur de manière STRICTE par phone_normalized (AUCUNE colonne password sélectionnée)
        const { data: user } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('id, nom, telephone, phone_normalized, role')
            .eq('phone_normalized', phoneNormalized)
            .maybeSingle();

        if (!user) {
            return res.status(401).json({ error: 'Numéro de téléphone ou mot de passe incorrect.' });
        }

        // 4. Authentification via Supabase Auth avec un client éphémère sans persistance
        const syntheticEmail = buildAuthEmail(schoolSlug, phoneNormalized);
        const authClient = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
            }
        );

        const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
            email: syntheticEmail,
            password: password
        });

        if (authError || !authData?.user?.id || authData.user.id !== user.id) {
            return res.status(401).json({ error: 'Numéro de téléphone ou mot de passe incorrect.' });
        }

        const token = jwt.sign(
            { id: user.id, nom: user.nom, role: user.role, schoolSlug, token_type: 'access' },
            JWT_SECRET,
            { algorithm: 'HS256', expiresIn: JWT_EXPIRES }
        );

        // Update last login
        supabase.from(`profiles_${schoolSlug}`).update({ last_login: new Date().toISOString() }).eq('id', user.id).then(() => {});

        // Auto-Link des enfants lors de la connexion (ÉGALITÉ EXACTE E.164)
        if (user.role === 'parent') {
            try {
                const { data: matchingStudents } = await supabase
                    .from(`students_${schoolSlug}`)
                    .select('id')
                    .eq('telephone_parent_normalized', phoneNormalized);

                if (matchingStudents && matchingStudents.length > 0) {
                    const studentIds = matchingStudents.map(s => s.id);

                    const { data: existingLinks } = await supabase
                        .from(`parent_student_${schoolSlug}`)
                        .select('student_id')
                        .eq('parent_id', user.id)
                        .in('student_id', studentIds);

                    const linkedIds = (existingLinks || []).map(l => l.student_id);
                    const newLinks = studentIds.filter(id => !linkedIds.includes(id)).map(id => ({
                        parent_id: user.id,
                        student_id: id
                    }));

                    if (newLinks.length > 0) {
                        await supabase.from(`parent_student_${schoolSlug}`).insert(newLinks);
                        console.log(`✅ [AutoLink Login] ${newLinks.length} enfant(s) nouvellement lié(s) E.164 au parent ${user.id}`);
                    }
                }
            } catch (autoLinkErr) {
                console.error('⚠️ [AutoLink Login] Erreur lors de la liaison automatique :', autoLinkErr.message);
            }
        }

        return res.json({
            message: 'Connexion réussie.',
            token,
            user: {
                id: user.id,
                nom: user.nom,
                telephone: user.telephone,
                phone_normalized: user.phone_normalized,
                role: user.role,
                school_name: school.name,
                school_slug: school.slug,
                school_country: school.country,
                school_address: school.address,
                school_phone: school.phone,
                school_slogan: school.slogan,
                school_ministry: school.ministry,
                school_logo: null
            },
        });
    } catch (err) {
        console.error('Login Error:', err.message);
        return res.status(500).json({ error: 'Erreur de connexion serveur.' });
    }
}

// ── Delete Account (Self) ─────────────────────────────────────
async function deleteSelfAccount(req, res) {
    const { id, role, schoolSlug } = req.user;

    if (role === 'superadmin') {
        return res.status(403).json({ error: "Le compte superadmin ne peut être supprimé ici." });
    }

    try {
        const { error } = await supabase
            .from(`profiles_${schoolSlug}`)
            .delete()
            .eq('id', id);

        if (error) throw error;

        // Supprimer également de Supabase Auth si présent
        await supabaseAdmin.auth.admin.deleteUser(id).catch(() => {});

        return res.json({ message: 'Compte supprimé avec succès.' });
    } catch (err) {
        console.error('Delete Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la suppression du compte.' });
    }
}

// ── Update Push Token ──────────────────────────────────────────
async function updatePushToken(req, res) {
    const { id, role, schoolSlug } = req.user;
    const { push_token } = req.body;
    
    const table = role === 'superadmin' ? 'superadmins' : `profiles_${schoolSlug}`;

    try {
        const { error } = await supabase
            .from(table)
            .update({ push_token })
            .eq('id', id);

        if (error) throw error;
        return res.json({ success: true, message: 'Token de notification mis à jour.' });
    } catch (err) {
        console.error('Update Push Token Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la mise à jour du token.' });
    }
}

// 📌 Update Profile (Dédiée aux métadonnées d'établissement uniquement) 📌
async function updateProfile(req, res) {
    if (!req.user) {
        return res.status(401).json({ error: 'Non authentifié' });
    }

    const { school_address, school_phone, school_slogan, school_ministry, telephone, phone_normalized } = req.body;
    
    // REJET EXPLICITE des tentatives de modification du téléphone de compte utilisateur via updateProfile
    if (telephone !== undefined || phone_normalized !== undefined) {
        return res.status(400).json({ error: 'Pour modifier le numéro de téléphone de votre compte, utilisez la route dédiée /api/auth/update-phone.' });
    }

    try {
        const updates = { updated_at: new Date().toISOString() };
        if (school_address !== undefined) updates.address = school_address;
        if (school_phone !== undefined) updates.phone = school_phone;
        if (school_slogan !== undefined) updates.slogan = school_slogan;
        if (school_ministry !== undefined) updates.ministry = school_ministry;

        const { error } = await supabase
            .from('schools')
            .update(updates)
            .eq('slug', req.user.schoolSlug);

        if (error) throw error;

        return res.json({ message: 'Profil d\'établissement mis à jour' });
    } catch (err) {
        console.error('Update Profile Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}

// ----------------------------------------------------
// MOT DE PASSE OUBLIÉ (Génération OTP sécurisée + Réponse Neutre + Rate Limit)
// ----------------------------------------------------
const forgotPassword = async (req, res) => {
    try {
        const { phone, schoolSlug, countryCode } = req.body;
        if (!phone || typeof phone !== 'string' || !schoolSlug || typeof schoolSlug !== 'string') {
            return res.status(400).json({ error: 'Le numéro de téléphone et l\'établissement sont requis.' });
        }

        const cleanSchoolSlug = schoolSlug.trim().toLowerCase();
        if (cleanSchoolSlug !== 'global' && !/^[a-z0-9_]{1,50}$/.test(cleanSchoolSlug)) {
            return res.status(400).json({ error: 'Identifiant d\'établissement invalide.' });
        }

        let phoneNormalized;
        try {
            phoneNormalized = normalizePhone(phone, countryCode);
        } catch (err) {
            return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
        }

        // Rate limiting en base : Vérifier le nombre de demandes récentes (max 3 en 15 minutes)
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data: recentRequests } = await supabase
            .from('password_resets')
            .select('id')
            .eq('phone', phoneNormalized)
            .gte('created_at', fifteenMinsAgo);

        if (recentRequests && recentRequests.length >= 3) {
            res.setHeader('Retry-After', '900');
            return res.status(429).json({ error: 'Trop de demandes de réinitialisation. Veuillez réessayer dans 15 minutes.' });
        }

        let userFound = false;

        if (cleanSchoolSlug === 'global') {
            const inputClean = phone.trim().toLowerCase();
            const { data: superadmin } = await supabase
                .from('superadmins')
                .select('id')
                .or(`telephone.eq.${phoneNormalized},telephone.eq.${phone.trim()},username.ilike.${inputClean},email.ilike.${inputClean}`)
                .maybeSingle();
            if (superadmin) userFound = true;
        } else {
            const { data: profile } = await supabase
                .from(`profiles_${cleanSchoolSlug}`)
                .select('id')
                .eq('phone_normalized', phoneNormalized)
                .maybeSingle();
            if (profile) userFound = true;
        }

        // Sécurité : Réponse générique neutre même si le compte n'existe pas (anti-énumération)
        if (!userFound) {
            return res.json({ message: 'Si ce numéro est enregistré, vous recevrez un code de réinitialisation.' });
        }

        const rawOtp = crypto.randomInt(100000, 999999).toString();
        const otpHash = hashOtp(phoneNormalized, cleanSchoolSlug, rawOtp);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        // 1. Exécution via la RPC transactionnelle atomique PostgreSQL
        const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('request_password_reset_otp', {
            p_phone: phoneNormalized,
            p_school_slug: cleanSchoolSlug,
            p_otp_hash: otpHash,
            p_expires_at: expiresAt
        });

        if (rpcError || !rpcResult) {
            console.error('RPC request_password_reset_otp Error:', rpcError?.message);
            return res.status(500).json({ error: 'Erreur lors de la génération du code.' });
        }

        if (rpcResult.success === false) {
            if (rpcResult.reason === 'RATE_LIMIT_EXCEEDED') {
                res.setHeader('Retry-After', String(rpcResult.retry_after || 900));
                return res.status(429).json({ error: 'Trop de demandes de réinitialisation. Veuillez réessayer dans 15 minutes.' });
            }
            return res.status(500).json({ error: 'Erreur lors de la génération du code.' });
        }

        // Expédition exclusive via canal sécurisé (SMS). L'OTP brut n'est JAMAIS renvoyé dans la réponse HTTP ni stocké en clair.
        await sendPasswordResetSMS(phoneNormalized, rawOtp).catch(e => console.error("SMS reset error:", e.message));

        return res.json({ message: 'Si ce numéro est enregistré, vous recevrez un code de réinitialisation.' });
    } catch (err) {
        console.error('Forgot Password Error:', err.message);
        return res.status(500).json({ error: 'Erreur serveur.' });
    }
};

// ----------------------------------------------------
// RÉINITIALISATION DU MOT DE PASSE (Vérification OTP + Supabase Auth updateUserById)
// ----------------------------------------------------
const resetPassword = async (req, res) => {
    try {
        const { phone, schoolSlug, countryCode, otp, newPassword } = req.body;
        
        if (!phone || typeof phone !== 'string' || !schoolSlug || typeof schoolSlug !== 'string' || !otp || typeof otp !== 'string' || !newPassword || typeof newPassword !== 'string') {
            return res.status(400).json({ error: 'Tous les champs sont requis (phone, schoolSlug, otp, newPassword).' });
        }

        const cleanSchoolSlug = schoolSlug.trim().toLowerCase();
        if (cleanSchoolSlug !== 'global' && !/^[a-z0-9_]{1,50}$/.test(cleanSchoolSlug)) {
            return res.status(400).json({ error: 'Identifiant d\'établissement invalide.' });
        }

        const cleanOtp = otp.trim();
        if (!/^\d{6}$/.test(cleanOtp)) {
            return res.status(400).json({ error: 'Le code de réinitialisation doit comporter exactement 6 chiffres.' });
        }

        if (newPassword.length < 6 || newPassword.length > 128) {
            return res.status(400).json({ error: 'Le mot de passe doit comporter entre 6 et 128 caractères.' });
        }

        let phoneNormalized;
        try {
            phoneNormalized = normalizePhone(phone, countryCode);
        } catch (err) {
            return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
        }

        const submittedOtpHash = hashOtp(phoneNormalized, cleanSchoolSlug, cleanOtp);

        // 1. Exécution via la RPC transactionnelle atomique FOR UPDATE (consommation unique)
        const { data: rpcConsume, error: rpcConsumeErr } = await supabaseAdmin.rpc('verify_and_consume_password_reset_otp', {
            p_phone: phoneNormalized,
            p_school_slug: cleanSchoolSlug,
            p_submitted_otp_hash: submittedOtpHash
        });

        if (rpcConsumeErr || !rpcConsume) {
            console.error('RPC verify_and_consume_password_reset_otp Error:', rpcConsumeErr?.message);
            return res.status(500).json({ error: 'Échec de vérification du code.' });
        }

        if (rpcConsume.success !== true) {
            if (rpcConsume.reason === 'MAX_ATTEMPTS_EXCEEDED') {
                return res.status(400).json({ error: 'Nombre maximal de tentatives dépassé. Veuillez demander un nouveau code.' });
            }
            if (rpcConsume.reason === 'EXPIRED') {
                return res.status(400).json({ error: 'Le code de réinitialisation a expiré.' });
            }
            return res.status(400).json({ error: 'Code de réinitialisation invalide ou expiré.' });
        }

        if (cleanSchoolSlug === 'global') {
            const inputClean = phone.trim().toLowerCase();
            const { data: sa } = await supabase
                .from('superadmins')
                .select('id')
                .or(`telephone.eq.${phoneNormalized},telephone.eq.${phone.trim()},username.ilike.${inputClean},email.ilike.${inputClean}`)
                .maybeSingle();

            if (!sa) {
                return res.status(400).json({ error: 'Compte SuperAdmin introuvable pour ce numéro.' });
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);
            await supabase.from('superadmins').update({ password: hashedPassword }).eq('id', sa.id);
        } else {
            // 1. Récupérer l'UUID Auth (id) du profil par phone_normalized
            const { data: profile, error: profileErr } = await supabase
                .from(`profiles_${cleanSchoolSlug}`)
                .select('id')
                .eq('phone_normalized', phoneNormalized)
                .maybeSingle();

            if (profileErr || !profile?.id) {
                return res.status(400).json({ error: 'Profil introuvable pour ce numéro de téléphone.' });
            }

            // 2. Mettre à jour l'utilisateur Supabase Auth avec updateUserById (email_confirm: true)
            const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
                password: newPassword,
                email_confirm: true
            });

            if (updateAuthError) {
                console.error('❌ Échec de la mise à jour du mot de passe dans Supabase Auth:', updateAuthError.message);
                return res.status(500).json({ error: 'Échec de la réinitialisation du mot de passe.' });
            }
        }

        return res.json({ message: 'Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.' });
    } catch (err) {
        console.error('Reset Password Error:', err.message);
        return res.status(500).json({ error: 'Erreur serveur.' });
    }
};

/**
 * Modification synchronisée du téléphone propre (Mise à jour Supabase Auth + Profil + Compensation + Relecture)
 */
async function updatePhone(req, res) {
    const { id: userId, schoolSlug } = req.user;
    const { newTelephone, countryCode } = req.body;

    if (!newTelephone) {
        return res.status(400).json({ error: 'Le nouveau numéro de téléphone est requis.' });
    }

    let newPhoneNormalized;
    try {
        newPhoneNormalized = normalizePhone(newTelephone, countryCode);
    } catch (err) {
        return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
    }

    try {
        // 1. Vérifier l'unicité du numéro dans l'école
        const { data: existing } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('id')
            .eq('phone_normalized', newPhoneNormalized)
            .neq('id', userId)
            .maybeSingle();

        if (existing) {
            return res.status(409).json({ error: 'Ce numéro de téléphone est déjà utilisé par un autre compte.' });
        }

        // 2. Relire l'utilisateur Auth avant toute modification pour conserver l'email et l'intégralité des métadonnées
        const { data: preAuthData, error: preFetchErr } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (preFetchErr || !preAuthData?.user) {
            console.error('❌ Échec de la lecture préalable du compte Auth:', preFetchErr?.message);
            return res.status(500).json({ error: 'Échec de l\'accès au compte d\'authentification.' });
        }

        const oldAuthEmail = preAuthData.user.email;
        const previousMetadata = preAuthData.user.user_metadata || {};
        const newAuthEmail = buildAuthEmail(schoolSlug, newPhoneNormalized);

        // 3. Mettre à jour Supabase Auth avec préservation des métadonnées (role, school_slug, etc.)
        const updatedMetadata = {
            ...previousMetadata,
            phone_normalized: newPhoneNormalized
        };

        const { data: updatedAuthUser, error: authUpdateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            email: newAuthEmail,
            email_confirm: true,
            user_metadata: updatedMetadata
        });

        if (authUpdateErr || !updatedAuthUser?.user) {
            console.error('❌ Échec mise à jour téléphone dans Supabase Auth:', authUpdateErr?.message);
            return res.status(500).json({ error: 'Échec de la mise à jour du numéro dans le service d\'authentification : ' + (authUpdateErr?.message || 'Utilisateur non mis à jour.') });
        }

        // 4. Relecture explicite et contrôle strict des propriétés de l'utilisateur Auth
        const { data: checkAuthData, error: checkAuthErr } = await supabaseAdmin.auth.admin.getUserById(userId);
        const checkUser = checkAuthData?.user;
        const checkMeta = checkUser?.user_metadata || {};

        if (
            checkAuthErr ||
            !checkUser ||
            checkUser.id !== userId ||
            checkUser.email !== newAuthEmail ||
            checkMeta.phone_normalized !== newPhoneNormalized ||
            checkMeta.role !== previousMetadata.role ||
            checkMeta.school_slug !== previousMetadata.school_slug
        ) {
            console.error('❌ Contrôle de relecture Auth échoué après mise à jour.');
            return res.status(500).json({ error: 'Erreur de confirmation des métadonnées d\'authentification.' });
        }

        // 5. Mettre à jour le profil SQL
        const { error: profileUpdateErr } = await supabase
            .from(`profiles_${schoolSlug}`)
            .update({
                telephone: newTelephone.trim(),
                phone_normalized: newPhoneNormalized
            })
            .eq('id', userId);

        if (profileUpdateErr) {
            console.error('❌ Échec mise à jour profil SQL:', profileUpdateErr.message);

            // 6. Compensation Auth : Restauration de l'ancien email et métadonnées antérieures
            const { error: compErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
                email: oldAuthEmail,
                email_confirm: true,
                user_metadata: previousMetadata
            });

            // 7. Contrôle de confirmation après compensation
            const { data: compCheckData } = await supabaseAdmin.auth.admin.getUserById(userId);
            const compUser = compCheckData?.user;

            if (compErr || !compUser || compUser.email !== oldAuthEmail) {
                const correlationId = crypto.randomBytes(8).toString('hex');
                console.error(`❌ [RÉCONCILIATION_ADMIN_REQUISE] CorrelationID=${correlationId}, UserID=${userId}, FailedStep=SQL_PROFILE_UPDATE_COMPENSATION_FAILURE`);
                return res.status(500).json({
                    error: `Échec critique de synchronisation. RÉCONCILIATION_ADMIN_REQUISE (CorrelationID: ${correlationId})`
                });
            }

            return res.status(500).json({ error: 'Échec de la mise à jour du profil (les données d\'authentification ont été restaurées) : ' + profileUpdateErr.message });
        }

        return res.json({ message: 'Numéro de téléphone mis à jour avec succès.', phone_normalized: newPhoneNormalized });
    } catch (err) {
        console.error('Update Phone Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la modification du téléphone.' });
    }
}

module.exports = {
    register,
    registerSchool,
    login,
    deleteSelfAccount,
    updatePushToken,
    updateProfile,
    forgotPassword,
    resetPassword,
    updatePhone
};
