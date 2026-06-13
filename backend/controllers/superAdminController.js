// ============================================================
// SUPERADMIN CONTROLLER — Tableau de bord SaaS global
// Accessible UNIQUEMENT au propriétaire de la plateforme
// ============================================================
const { supabase } = require('../utils/supabase');
const Joi = require('joi');
const crypto = require('crypto');

const PRICE_PER_STUDENT = 2000; // FCFA

// ── GET /api/superadmin/schools ─────────────────────────────────
// Liste toutes les écoles inscrites avec leurs stats
async function getAllSchools(req, res) {
    try {
        const { data: schools, error } = await supabase
            .from('schools')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Pour chaque école, compter le nombre d'élèves dans sa propre table !
        const schoolsWithStats = await Promise.all(
            schools.map(async (school) => {
                let studentCount = 0;
                let userCount = 0;
                
                try {
                    const { count: sCount } = await supabase
                        .from(`students_${school.slug}`)
                        .select('*', { count: 'exact', head: true });
                    studentCount = sCount || 0;
                    
                    const { count: uCount } = await supabase
                        .from(`profiles_${school.slug}`)
                        .select('*', { count: 'exact', head: true });
                    userCount = uCount || 0;
                } catch (e) {
                    console.warn(`Table manquante pour ${school.slug}`);
                }

                return {
                    ...school,
                    student_count: studentCount || 0,
                    user_count: userCount || 0,
                    revenue: (studentCount || 0) * PRICE_PER_STUDENT,
                    trial_days_left: school.status === 'trial'
                        ? Math.max(0, Math.ceil((new Date(school.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)))
                        : 0
                };
            })
        );

        // Calcul du chiffre d'affaires global
        const totalRevenue = schoolsWithStats.reduce((sum, s) => sum + s.revenue, 0);
        const totalStudents = schoolsWithStats.reduce((sum, s) => sum + s.student_count, 0);

        return res.json({
            schools: schoolsWithStats,
            summary: {
                total_schools: schools.length,
                active_schools: schools.filter(s => s.status === 'active').length,
                trial_schools: schools.filter(s => s.status === 'trial').length,
                suspended_schools: schools.filter(s => s.status === 'suspended').length,
                total_students: totalStudents,
                total_revenue: totalRevenue,
                price_per_student: PRICE_PER_STUDENT
            }
        });
    } catch (err) {
        console.error('SuperAdmin getAllSchools Error:', err.message);
        return res.status(500).json({ error: 'Erreur serveur: ' + err.message });
    }
}

// Joi schema validation for School Admin registration
const schoolCreateSchema = Joi.object({
    name: Joi.string().trim().required().messages({
        'any.required': 'Le nom de l\'établissement est requis.'
    }),
    slug: Joi.string().trim().lowercase().required().messages({
        'any.required': 'Le slug de l\'établissement est requis.'
    }),
    address: Joi.string().allow('', null),
    phone: Joi.string().allow('', null),
    email: Joi.string().email().allow('', null).messages({
        'string.email': 'L\'adresse email est invalide.'
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
    accepted_terms: Joi.boolean().valid(true).required().messages({
        'any.only': 'Vous devez accepter les conditions générales d\'utilisation.'
    }),
    accepted_privacy_policy: Joi.boolean().valid(true).required().messages({
        'any.only': 'Vous devez accepter la politique de confidentialité.'
    }),
    marketing_consent: Joi.boolean().default(false)
});

function getIpHash(req) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    const clientIp = typeof ip === 'string' ? ip.split(',')[0].trim() : String(ip);
    return crypto.createHash('sha256').update(clientIp).digest('hex');
}

// Créer une nouvelle école et son premier admin
async function createSchool(req, res) {
    const { value: validatedData, error: validationError } = schoolCreateSchema.validate(req.body, { abortEarly: false });
    
    if (validationError) {
        return res.status(400).json({ error: validationError.details.map(d => d.message).join(', ') });
    }

    try {
        const cleanSlug = validatedData.slug;

        // Vérifier si le slug est déjà utilisé
        const { data: existing } = await supabase
            .from('schools')
            .select('id')
            .eq('slug', cleanSlug)
            .single();

        if (existing) {
            return res.status(409).json({ error: `Le slug "${cleanSlug}" est déjà utilisé par une autre école.` });
        }

        const ipHash = getIpHash(req);
        const consentedAt = new Date().toISOString();

        // 1. Créer l'école (Mass assignment protection)
        const schoolPayload = {
            name: validatedData.name.trim(),
            slug: cleanSlug,
            address: validatedData.address || null,
            phone: validatedData.phone || null,
            email: validatedData.email || null,
            status: 'trial',
            trial_ends_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // +2 mois
            accepted_terms: validatedData.accepted_terms,
            accepted_privacy_policy: validatedData.accepted_privacy_policy,
            marketing_consent: validatedData.marketing_consent,
            consented_at: consentedAt,
            signup_ip_hash: ipHash
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

        // Attendre que la base recharge son schéma (1s par sécurité)
        await new Promise(r => setTimeout(r, 1000));

        // 3. Créer le compte SchoolAdmin (directeur) dans SA NOUVELLE TABLE
        const bcrypt = require('bcryptjs');
        const hashed = await bcrypt.hash(validatedData.admin_password, 10);

        // Mass assignment protection
        const adminPayload = {
            nom: validatedData.admin_nom.trim(),
            telephone: validatedData.admin_telephone.trim(),
            password: hashed,
            role: 'directeur',
            accepted_terms: validatedData.accepted_terms,
            accepted_privacy_policy: validatedData.accepted_privacy_policy,
            marketing_consent: validatedData.marketing_consent,
            consented_at: consentedAt,
            signup_ip_hash: ipHash
        };

        const { data: adminUser, error: adminErr } = await supabase
            .from(`profiles_${cleanSlug}`)
            .insert(adminPayload)
            .select()
            .single();

        if (adminErr) throw adminErr;

        console.log(`🏫 Nouvelle école créée: ${school.name} (${school.slug}), Admin: ${adminUser.nom}`);

        return res.status(201).json({
            message: `École "${school.name}" créée avec succès.`,
            school,
            admin: { id: adminUser.id, nom: adminUser.nom, telephone: adminUser.telephone, role: adminUser.role }
        });
    } catch (err) {
        console.error('SuperAdmin createSchool Error:', err.message);
        return res.status(500).json({ error: 'Erreur création école: ' + err.message });
    }
}

// ── PATCH /api/superadmin/schools/:id/status ───────────────────
// Activer, suspendre, ou passer en mode essai une école
async function updateSchoolStatus(req, res) {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'suspended', 'trial'].includes(status)) {
        return res.status(400).json({ error: 'Statut invalide. Valeurs: active, suspended, trial' });
    }

    try {
        const { data: school, error } = await supabase
            .from('schools')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        const action = status === 'active' ? '✅ activée' : status === 'suspended' ? '🚫 suspendue' : '⏳ en essai';
        console.log(`🏫 École "${school.name}" ${action} par le SuperAdmin`);

        return res.json({
            message: `École "${school.name}" ${action} avec succès.`,
            school
        });
    } catch (err) {
        console.error('SuperAdmin updateStatus Error:', err.message);
        return res.status(500).json({ error: 'Erreur mise à jour statut: ' + err.message });
    }
}

// ── PUT /api/superadmin/schools/:id ─────────────────────────────
// Modifier les informations d'une école
async function updateSchool(req, res) {
    const { id } = req.params;
    const { name, address, phone, email, logo_url, trial_ends_at } = req.body;

    try {
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (address !== undefined) updates.address = address;
        if (phone !== undefined) updates.phone = phone;
        if (email !== undefined) updates.email = email;
        if (logo_url !== undefined) updates.logo_url = logo_url;
        if (trial_ends_at !== undefined) updates.trial_ends_at = trial_ends_at;

        const { data: school, error } = await supabase
            .from('schools')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return res.json({ message: 'École mise à jour.', school });
    } catch (err) {
        console.error('SuperAdmin updateSchool Error:', err.message);
        return res.status(500).json({ error: 'Erreur mise à jour école: ' + err.message });
    }
}

// ── GET /api/superadmin/stats ───────────────────────────────────
// Statistiques globales de la plateforme
async function getGlobalStats(req, res) {
    try {
        const { count: totalSchools } = await supabase
            .from('schools').select('*', { count: 'exact', head: true });

        const { data: schools } = await supabase
            .from('schools').select('slug, status, trial_ends_at');

        let totalStudents = 0;
        let totalUsers = 0;

        if (schools) {
            for (let s of schools) {
                try {
                    const { count: sCount } = await supabase.from(`students_${s.slug}`).select('*', { count: 'exact', head: true });
                    const { count: uCount } = await supabase.from(`profiles_${s.slug}`).select('*', { count: 'exact', head: true });
                    totalStudents += (sCount || 0);
                    totalUsers += (uCount || 0);
                } catch(e) {}
            }
        }

        const activeCount = schools?.filter(s => s.status === 'active').length || 0;
        const trialCount = schools?.filter(s => s.status === 'trial').length || 0;
        const suspendedCount = schools?.filter(s => s.status === 'suspended').length || 0;

        // Écoles dont l'essai est expiré mais pas encore mises à jour
        const expiredTrials = schools?.filter(s =>
            s.status === 'trial' && new Date(s.trial_ends_at) < new Date()
        ).length || 0;

        return res.json({
            total_schools: totalSchools || 0,
            active_schools: activeCount,
            trial_schools: trialCount,
            suspended_schools: suspendedCount,
            expired_trials: expiredTrials,
            total_students: totalStudents || 0,
            total_users: totalUsers || 0,
            total_revenue: (totalStudents || 0) * PRICE_PER_STUDENT,
            price_per_student: PRICE_PER_STUDENT,
            currency: 'FCFA'
        });
    } catch (err) {
        console.error('SuperAdmin getGlobalStats Error:', err.message);
        return res.status(500).json({ error: 'Erreur stats globales: ' + err.message });
    }
}

// ── DELETE /api/superadmin/schools/:id ──────────────────────────
// Supprimer une école et TOUTES ses tables
async function deleteSchool(req, res) {
    const { id } = req.params;

    try {
        // Optionnel : s'assurer qu'on ne supprime pas si l'id n'est pas fourni
        if (!id) return res.status(400).json({ error: 'ID manquant.' });

        // 1. Récupérer le slug de l'école
        const { data: school, error: fetchErr } = await supabase
            .from('schools')
            .select('slug, name')
            .eq('id', id)
            .single();

        if (fetchErr || !school) {
            return res.status(404).json({ error: 'École introuvable.' });
        }

        // 2. Exécuter la routine Supabase RPC pour dropper toutes les tables associées à ce slug
        console.log(`🗑️ Tentative de suppression des tables pour le slug : ${school.slug}`);
        const { error: rpcErr } = await supabase.rpc('drop_school_tables', { school_slug: school.slug });
        if (rpcErr) {
            console.error('Erreur RPC Drop Tables:', rpcErr.message);
            // On continue quand même pour la supprimer du catalogue, on nettoiera les bases manuellement si besoin
        }

        // 3. Supprimer du catalogue (Table schools)
        const { error: deleteErr } = await supabase
            .from('schools')
            .delete()
            .eq('id', id);

        if (deleteErr) throw deleteErr;

        console.log(`🗑️ L'école ${school.name} a été complétement supprimée du système.`);
        return res.json({ message: `L'établissement ${school.name} a été supprimé sans retour possible.` });
    } catch (err) {
        console.error('SuperAdmin deleteSchool Error:', err.message);
        return res.status(500).json({ error: 'Erreur suppression école: ' + err.message });
    }
}

// ── POST /api/superadmin/schools/:id/impersonate ────────────────
// Connecter le superadmin à une école spécifique
async function impersonateSchool(req, res) {
    const { id } = req.params;

    try {
        const { data: school, error } = await supabase
            .from('schools')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !school) {
            return res.status(404).json({ error: 'École introuvable.' });
        }

        const jwt = require('jsonwebtoken');
        const { JWT_SECRET, JWT_EXPIRES } = require('../config');

        const userName = `SuperAdmin (${school.name})`;
        const userId = req.user.id || 'superadmin_impersonate';
        
        const token = jwt.sign(
            { id: userId, nom: userName, role: 'admin', schoolSlug: school.slug },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );

        console.log(`🦸‍♂️ SuperAdmin Impersonate: Accès à l'école ${school.slug}`);

        return res.json({
            message: `Connexion à ${school.name} réussie.`,
            token,
            user: {
                id: userId,
                nom: userName,
                telephone: 'SuperAdmin',
                role: 'admin',
                school_name: school.name,
                school_slug: school.slug,
                school_logo: school.logo_url
            }
        });
    } catch (err) {
        console.error('SuperAdmin impersonate Error:', err.message);
        return res.status(500).json({ error: 'Erreur connexion école: ' + err.message });
    }
}

module.exports = { getAllSchools, createSchool, updateSchoolStatus, updateSchool, deleteSchool, getGlobalStats, impersonateSchool };
