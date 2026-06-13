const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('../utils/supabase');
const { JWT_SECRET, JWT_EXPIRES } = require('../config');
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
            role: 'parent',
            accepted_terms,
            accepted_privacy_policy,
            marketing_consent,
            consented_at: new Date().toISOString(),
            signup_ip_hash: ipHash,
            parent_photo_authorization
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
            .eq('telephone', telephone.trim())
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
            .select('id, name, slug, status, trial_ends_at, logo_url')
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
                school_logo: school.logo_url
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

module.exports = { register, login, deleteSelfAccount, updatePushToken };
