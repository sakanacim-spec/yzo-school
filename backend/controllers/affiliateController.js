const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('../utils/supabase');
const { JWT_SECRET, JWT_EXPIRES } = require('../config');

// Inscription d'un ambassadeur
async function register(req, res) {
    const { nom, telephone, email, password, country, photo_url } = req.body;

    if (!nom || !telephone || !password || !country || !email) {
        return res.status(400).json({ error: 'Tous les champs sont requis (nom, email, telephone, password, pays).' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères.' });
    }
    
    const phoneDigits = telephone.replace(/\D/g, '');
    if (phoneDigits.length < 8) {
        return res.status(400).json({ error: 'Le numéro de téléphone est invalide.' });
    }

    try {
        // Vérifier si le téléphone existe déjà
        const { data: existing } = await supabase
            .from('affiliates')
            .select('id')
            .eq('telephone', telephone)
            .single();

        if (existing) {
            return res.status(409).json({ error: 'Un ambassadeur utilise déjà ce numéro de téléphone.' });
        }

        // Vérifier si l'email existe déjà
        if (email) {
            const { data: existingEmail } = await supabase
                .from('affiliates')
                .select('id')
                .eq('email', email)
                .single();
            if (existingEmail) {
                return res.status(409).json({ error: 'Cet email est déjà utilisé par un autre ambassadeur.' });
            }
        }

        // Générer le code de parrainage (ex: YZIOW-JOEL-1234)
        const namePart = nom.split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '').substring(0, 4);
        const randomPart = Math.floor(1000 + Math.random() * 9000);
        const referralCode = `AMB-${namePart}${randomPart}`;

        const password_hash = await bcrypt.hash(password, 10);

        const { data: affiliate, error } = await supabase
            .from('affiliates')
            .insert({
                nom,
                telephone,
                password_hash,
                referral_code: referralCode,
                country,
                photo_url,
                email
            })
            .select()
            .single();

        if (error) throw error;

        // Générer le token JWT
        const token = jwt.sign(
            { id: affiliate.id, nom: affiliate.nom, role: 'affiliate' },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );

        return res.status(201).json({
            message: 'Compte ambassadeur créé avec succès.',
            token,
            affiliate: { id: affiliate.id, nom: affiliate.nom, telephone: affiliate.telephone, referral_code: affiliate.referral_code, wallet_balance: affiliate.wallet_balance, country: affiliate.country, photo_url: affiliate.photo_url }
        });
    } catch (err) {
        console.error('Affiliate Register Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la création du compte ambassadeur.' });
    }
}

// Connexion d'un ambassadeur
async function login(req, res) {
    const { telephone, password } = req.body;

    if (!telephone || !password) {
        return res.status(400).json({ error: 'Téléphone et mot de passe requis.' });
    }

    try {
        const { data: affiliate } = await supabase
            .from('affiliates')
            .select('*')
            .eq('telephone', telephone)
            .single();

        if (!affiliate) {
            return res.status(401).json({ error: 'Identifiants incorrects.' });
        }

        if (affiliate.status === 'suspended') {
            return res.status(403).json({ error: 'Votre compte ambassadeur a été suspendu. Veuillez nous contacter.' });
        }

        const valid = await bcrypt.compare(password, affiliate.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Identifiants incorrects.' });
        }

        const token = jwt.sign(
            { id: affiliate.id, nom: affiliate.nom, role: 'affiliate' },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );

        return res.json({
            message: 'Connexion réussie',
            token,
            affiliate: { id: affiliate.id, nom: affiliate.nom, telephone: affiliate.telephone, referral_code: affiliate.referral_code, wallet_balance: affiliate.wallet_balance, country: affiliate.country, photo_url: affiliate.photo_url }
        });
    } catch (err) {
        console.error('Affiliate Login Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la connexion.' });
    }
}

// Récupérer le tableau de bord de l'ambassadeur
async function getDashboard(req, res) {
    const affiliateId = req.user.id;

    try {
        // 1. Informations de l'ambassadeur
        const { data: affiliate, error: affErr } = await supabase
            .from('affiliates')
            .select('nom, telephone, referral_code, commission_rate, wallet_balance, total_earned, country, photo_url')
            .eq('id', affiliateId)
            .single();

        if (affErr || !affiliate) return res.status(404).json({ error: 'Ambassadeur non trouvé.' });

        // 2. Écoles parrainées
        const { data: schools } = await supabase
            .from('schools')
            .select('id, name, slug, status, created_at')
            .eq('affiliate_id', affiliateId)
            .order('created_at', { ascending: false });

        // 3. Dernières transactions
        const { data: transactions } = await supabase
            .from('affiliate_transactions')
            .select('*')
            .eq('affiliate_id', affiliateId)
            .order('created_at', { ascending: false })
            .limit(20);

        return res.json({
            affiliate,
            schools: schools || [],
            transactions: transactions || []
        });
    } catch (err) {
        console.error('Affiliate Dashboard Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la récupération des données.' });
    }
}

module.exports = { register, login, getDashboard };
