const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('../utils/supabase');
const { JWT_SECRET, JWT_EXPIRES } = require('../config');
const { sendWelcomeSMS } = require('../utils/smsService');
const Joi = require('joi');
const crypto = require('crypto');

// Joi validation schema for Parent registration
const parentRegisterSchema = Joi.object({
    nom: Joi.string().trim().required().messages({
        'any.required': 'Le nom complet est requis.'
    }),
    telephone: Joi.string().trim().required().messages({
        'any.required': 'Le numéro de téléphone est requis.'
    }),
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
    parent_photo_authorization: Joi.boolean().default(false)
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
    // Champs internationaux
    country: Joi.string().trim().allow('', null),
    city: Joi.string().trim().allow('', null),
    address: Joi.string().trim().allow('', null),
    phone: Joi.string().trim().allow('', null),
    email: Joi.string().email().allow('', null),
    slogan: Joi.string().trim().allow('', null),
    ministry: Joi.string().trim().allow('', null),
    preferred_language: Joi.string().valid('fr', 'en').default('fr'),
    accepted_terms: Joi.boolean().allow(null),
    accepted_privacy_policy: Joi.boolean().allow(null),
    marketing_consent: Joi.boolean().allow(null)
});

function getIpHash(req) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    const clientIp = typeof ip === 'string' ? ip.split(',')[0].trim() : String(ip);
    return crypto.createHash('sha256').update(clientIp).digest('hex');
}

// ── Register (Uniquement Parents) ──────────────────────────────
async function register(req, res) {
    const { value: validatedData, error: validationError } = parentRegisterSchema.validate(req.body, { abortEarly: false });
    
    if (validationError) {
        return res.status(400).json({ error: validationError.details.map(d => d.message).join(', ') });
    }

    const { nom, telephone, password, school_slug, accepted_terms, accepted_privacy_policy, marketing_consent, parent_photo_authorization } = validatedData;

    try {
        const { data: school } = await supabase
            .from('schools')
            .select('status')
            .eq('slug', school_slug)
            .single();
            
        if (!school) {
            return res.status(404).json({ error: "Établissement inconnu." });
        }
        if (school.status === 'suspended') {
            return res.status(403).json({ error: "L'établissement est suspendu." });
        }

        // Vérifier si existant
        const { data: existing } = await supabase
            .from(`profiles_${school_slug}`)
            .select('id')
            .eq('telephone', telephone.trim())
            .single();

        if (existing) {
            return res.status(409).json({ error: 'Ce numéro de téléphone est déjà enregistré.' });
        }

        const hashed = await bcrypt.hash(password, 10);
        const ipHash = getIpHash(req);

        // Mass assignment protection
        const insertPayload = {
            nom: nom.trim(),
            telephone: telephone.trim(),
            password: hashed,
            role: 'parent'
        };

        const { data: parent, error } = await supabase
            .from(`profiles_${school_slug}`)
            .insert(insertPayload)
            .select()
            .single();

        if (error) throw error;

        const token = jwt.sign(
            { id: parent.id, nom: parent.nom, role: parent.role, schoolSlug: school_slug },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );

        // ── Auto-Link des enfants dès l'inscription ──
        try {
            // Nettoyage du numéro : on ne garde que les chiffres
            const cleanPhone = (phone) => phone ? phone.replace(/\D/g, '') : '';
            const userPhoneClean = cleanPhone(telephone);

            if (userPhoneClean) {
                const { data: allStudents } = await supabase
                    .from(`students_${school_slug}`)
                    .select('id, telephone_parent');

                const studentsToLink = (allStudents || []).filter(s => cleanPhone(s.telephone_parent) === userPhoneClean);

                if (studentsToLink.length > 0) {
                    const linkPayload = studentsToLink.map(s => ({
                        parent_id: parent.id,
                        student_id: s.id
                    }));
                    await supabase.from(`parent_student_${school_slug}`).insert(linkPayload);
                    console.log(`✅ [AutoLink] ${linkPayload.length} enfant(s) lié(s) au nouveau parent ${parent.id}`);
                }
            }
        } catch (linkErr) {
            console.error('⚠️ [AutoLink Reg] Erreur lors de la liaison automatique :', linkErr.message);
        }

        // 📱 Envoi du SMS de Bienvenue (en arrière-plan pour ne pas bloquer la réponse)
        sendWelcomeSMS(parent.telephone, school.name || 'Votre École').catch(err => console.error("Erreur SMS Bienvenue:", err));

        return res.status(201).json({
            message: 'Compte créé avec succès.',
            token,
            parent: { id: parent.id, nom: parent.nom, telephone: parent.telephone, role: parent.role, schoolSlug: school_slug },
        });
    } catch (err) {
        console.error('Register Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la création du compte : ' + err.message });
    }
}

// ── Register School (SaaS Onboarding) ────────────────────────
async function registerSchool(req, res) {
    const { value: validatedData, error: validationError } = schoolRegisterSchema.validate(req.body, { abortEarly: false });
    
    if (validationError) {
        return res.status(400).json({ error: validationError.details.map(d => d.message).join(', ') });
    }

    try {
        // Générer un slug propre depuis le nom de l'école
        const cleanSlug = validatedData.school_name
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retirer accents
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/(^_|_$)+/g, '')
            .substring(0, 40);

        // Vérifier si le slug est déjà utilisé
        const { data: existing } = await supabase
            .from('schools')
            .select('id')
            .eq('slug', cleanSlug)
            .single();

        if (existing) {
            return res.status(409).json({ error: `Le nom "${validatedData.school_name}" génère un identifiant déjà utilisé. Veuillez choisir un nom légèrement différent.` });
        }

        const ipHash = getIpHash(req);

        // 1. Créer l'école avec tous les champs internationaux
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
            trial_ends_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() // +2 mois
        };

        const { data: school, error: schoolErr } = await supabase
            .from('schools')
            .insert(schoolPayload)
            .select()
            .single();

        if (schoolErr) throw schoolErr;

        // 2. Créer le jeu de tables avec l'appel RPC
        const { error: rpcErr } = await supabase.rpc('create_school_tables', { school_slug: cleanSlug });
        if (rpcErr) throw rpcErr;

        // Attendre que la base recharge son schéma
        await new Promise(r => setTimeout(r, 1000));

        // 3. Créer le compte SchoolAdmin (directeur)
        const hashed = await bcrypt.hash(validatedData.admin_password, 10);

        const adminPayload = {
            nom: validatedData.admin_nom.trim(),
            telephone: validatedData.admin_telephone.trim(),
            password: hashed,
            role: 'directeur'
        };

        const { data: adminUser, error: adminErr } = await supabase
            .from(`profiles_${cleanSlug}`)
            .insert(adminPayload)
            .select()
            .single();

        if (adminErr) throw adminErr;

        // Automatically log them in
        const token = jwt.sign(
            { id: adminUser.id, nom: adminUser.nom, role: adminUser.role, schoolSlug: cleanSlug },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );

        return res.status(201).json({
            message: 'Établissement et compte Directeur créés avec succès.',
            token,
            user: { id: adminUser.id, nom: adminUser.nom, telephone: adminUser.telephone, role: adminUser.role, schoolSlug: cleanSlug }
        });
    } catch (err) {
        console.error('Register School Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la création de l\'établissement : ' + err.message });
    }
}

// ── Login (Tout Rôles) ──────────────────────────
async function login(req, res) {
    const { telephone, password, schoolSlug } = req.body;

    if (!telephone || !password) {
        return res.status(400).json({ error: 'Champs requis : telephone, password.' });
    }

    try {
        console.log(`🔍 [Auth] Tentative login pour: ${telephone.trim()}`);

        // ── 1. Vérifier si c'est le SuperAdmin ──
        const { data: superadmin } = await supabase
            .from('superadmins')
            .select('*')
            .eq('username', telephone.trim())
            .single();

        if (superadmin) {
            const valid = await bcrypt.compare(password, superadmin.password);
            if (valid) {
                console.log(`✅ [Auth] SuperAdmin identifié !`);
                const token = jwt.sign(
                    { id: superadmin.id, nom: superadmin.nom, role: 'superadmin', schoolSlug: null },
                    JWT_SECRET,
                    { expiresIn: JWT_EXPIRES }
                );
                return res.json({
                    message: 'Connexion globale réussie.',
                    token,
                    user: { id: superadmin.id, nom: superadmin.nom, telephone: superadmin.telephone, role: 'superadmin' }
                });
            } else {
                return res.status(401).json({ error: 'Mot de passe SuperAdmin incorrect.' });
            }
        }
        
        // ── 2. Sinon, l'utilisateur DOIT avoir sélectionné une école ──
        if (!schoolSlug) {
            return res.status(400).json({ error: 'Veuillez sélectionner votre établissement pour vous connecter.' });
        }

        // Vérification accès école
        const { data: school, error: schoolErr } = await supabase
            .from('schools')
            .select('id, name, slug, status, trial_ends_at, country, address, phone, slogan, ministry')
            .eq('slug', schoolSlug)
            .single();

        if (schoolErr || !school) {
            return res.status(404).json({ error: 'Établissement introuvable.' });
        }

        if (school.status === 'suspended') {
            return res.status(403).json({ error: "L'accès à cet établissement est suspendu." });
        }
        if (school.status === 'trial' && new Date(school.trial_ends_at) < new Date()) {
            return res.status(402).json({ error: 'trial_expired', message: "La période d'essai est terminée." });
        }

        // ── 3. Chercher l'utilisateur dans la table de l'établissement ──
        const { data: user, error } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('*')
            .eq('telephone', telephone.trim())
            .single();

        if (error || !user) {
            return res.status(401).json({ error: 'Numéro de téléphone ou mot de passe incorrect.' });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Numéro de téléphone ou mot de passe incorrect.' });
        }

        console.log(`✅ [Auth] Utilisateur trouvé: ${user.nom} (Rôle: ${user.role}) - École: ${schoolSlug}`);

        const token = jwt.sign(
            { id: user.id, nom: user.nom, role: user.role, schoolSlug },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );

        // Update last login de façon asynchrone
        supabase.from(`profiles_${schoolSlug}`).update({ last_login: new Date().toISOString() }).eq('id', user.id).then(() => {});

        // ── Auto-Link des enfants lors de la connexion ──
        if (user.role === 'parent') {
            try {
                // Nettoyage du numéro pour comparaison stricte
                const cleanPhone = (phone) => phone ? phone.replace(/\D/g, '') : '';
                const userPhoneClean = cleanPhone(user.telephone);

                if (userPhoneClean) {
                    const { data: allStudents } = await supabase
                        .from(`students_${schoolSlug}`)
                        .select('id, telephone_parent');

                    const studentsToLink = (allStudents || []).filter(s => cleanPhone(s.telephone_parent) === userPhoneClean);

                    if (studentsToLink.length > 0) {
                        const studentIds = studentsToLink.map(s => s.id);
                        
                        // Vérifier ceux qui sont déjà liés
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
                            console.log(`✅ [AutoLink Login] ${newLinks.length} enfant(s) nouvellement lié(s) au parent ${user.id}`);
                        }
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
        console.log(`📲 Tentative de mise à jour du push_token pour l'utilisateur ${id}`);

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

// 📌 Update Profile 📌
async function updateProfile(req, res) {
    if (!req.user) {
        return res.status(401).json({ error: 'Non authentifié' });
    }

    const { school_address, school_phone, school_slogan, school_ministry } = req.body;
    
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

        return res.json({ message: 'Profil mis à jour' });
    } catch (err) {
        console.error('Update Profile Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}

module.exports = {
    register,
    registerSchool,
    login,
    deleteSelfAccount,
    updatePushToken,
    updateProfile
};
