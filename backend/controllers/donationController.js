const { supabase } = require('../utils/supabase');
const { validatePositiveNumber, isValidUUID } = require('../utils/helpers');

// --- DIRECTOR ROUTES ---

exports.createCampaign = async (req, res) => {
    try {
        const schoolSlug = req.user.schoolSlug;
        const { title, description, goal_amount, image_url } = req.body;

        if (!title || typeof title !== 'string' || !title.trim()) {
            return res.status(400).json({ error: 'Le titre est obligatoire.' });
        }

        let numGoal;
        try {
            numGoal = validatePositiveNumber(goal_amount);
        } catch {
            return res.status(400).json({ error: 'L\'objectif de collecte doit être un montant positif valide.' });
        }

        const tableName = `campaigns_${schoolSlug}`;
        const { data, error } = await supabase
            .from(tableName)
            .insert([{ title: title.trim().substring(0, 200), description: description ? String(description).substring(0, 5000) : '', goal_amount: numGoal, image_url: image_url ? String(image_url).substring(0, 1000) : null, created_by: req.user.id }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        console.error('Create campaign error:', err.message);
        res.status(500).json({ error: 'Erreur lors de la création de la campagne.' });
    }
};

exports.getCampaigns = async (req, res) => {
    try {
        const schoolSlug = req.user.schoolSlug;
        const tableName = `campaigns_${schoolSlug}`;
        
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            if (error.code === '42P01') {
                return res.json([]); // Table doesn't exist yet
            }
            throw error;
        }
        res.json(data);
    } catch (err) {
        console.error('Get campaigns error:', err.message);
        res.status(500).json({ error: 'Erreur lors de la récupération des campagnes.' });
    }
};

exports.getDonations = async (req, res) => {
    try {
        const schoolSlug = req.user.schoolSlug;
        const tableName = `donations_${schoolSlug}`;
        
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            if (error.code === '42P01') {
                return res.json([]); // Table doesn't exist yet
            }
            throw error;
        }
        res.json(data);
    } catch (err) {
        console.error('Get donations error:', err.message);
        res.status(500).json({ error: 'Erreur lors de la récupération des dons.' });
    }
};

// --- PUBLIC ROUTES ---

const SLUG_REGEX = /^[a-z0-9_]{1,50}$/;

exports.getAllPublicCampaigns = async (req, res) => {
    try {
        const { schoolSlug } = req.params;
        if (!schoolSlug || !SLUG_REGEX.test(schoolSlug)) {
            return res.status(400).json({ error: 'Identifiant d\'établissement invalide.' });
        }

        const tableName = `campaigns_${schoolSlug}`;
        
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) {
            if (error.code === '42P01') return res.json([]);
            throw error;
        }
        res.json(data || []);
    } catch (err) {
        console.error('Get all public campaigns error:', err.message);
        res.status(500).json({ error: 'Erreur lors de la récupération des campagnes.' });
    }
};

exports.getPublicCampaign = async (req, res) => {
    try {
        const { schoolSlug, campaignId } = req.params;
        if (!schoolSlug || !SLUG_REGEX.test(schoolSlug)) {
            return res.status(400).json({ error: 'Identifiant d\'établissement invalide.' });
        }

        if (!campaignId || typeof campaignId !== 'string' || !isValidUUID(campaignId)) {
            return res.status(400).json({ error: 'Identifiant de campagne invalide.' });
        }

        const tableName = `campaigns_${schoolSlug}`;
        
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('id', campaignId)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Get public campaign error:', err.message);
        res.status(404).json({ error: 'Campagne introuvable.' });
    }
};
