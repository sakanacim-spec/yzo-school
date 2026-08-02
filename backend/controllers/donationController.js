const { supabase } = require('../utils/supabase');
const { FedaPay, Transaction } = require('fedapay');

FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY || 'sk_sandbox_default');
FedaPay.setEnvironment(process.env.FEDAPAY_ENVIRONMENT || 'sandbox');

// --- DIRECTOR ROUTES ---

exports.createCampaign = async (req, res) => {
    try {
        const schoolSlug = req.user.schoolSlug;
        const { title, description, goal_amount, image_url } = req.body;

        if (!title || !goal_amount) {
            return res.status(400).json({ error: 'Le titre et l\'objectif sont obligatoires.' });
        }

        const tableName = `campaigns_${schoolSlug}`;
        const { data, error } = await supabase
            .from(tableName)
            .insert([{ title, description, goal_amount, image_url, created_by: req.user.id }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        console.error('Create campaign error:', err);
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
        console.error('Get campaigns error:', err);
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
        console.error('Get donations error:', err);
        res.status(500).json({ error: 'Erreur lors de la récupération des dons.' });
    }
};

// --- PUBLIC ROUTES (Donors) ---

exports.getPublicCampaign = async (req, res) => {
    try {
        const { schoolSlug, campaignId } = req.params;
        const tableName = `campaigns_${schoolSlug}`;
        
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('id', campaignId)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Get public campaign error:', err);
        res.status(404).json({ error: 'Campagne introuvable.' });
    }
};

exports.initiateDonation = async (req, res) => {
    try {
        const { schoolSlug, campaignId } = req.params;
        const { amount, donor_name, donor_email, donor_phone, is_anonymous, message } = req.body;

        if (!amount || amount < 500) {
            return res.status(400).json({ error: 'Le montant minimum est de 500 FCFA.' });
        }

        // 1. Create pending donation record
        const tableName = `donations_${schoolSlug}`;
        const { data: donation, error: insertError } = await supabase
            .from(tableName)
            .insert([{
                campaign_id: campaignId,
                donor_name: is_anonymous ? 'Anonyme' : donor_name,
                donor_email,
                donor_phone,
                amount,
                message,
                is_anonymous: !!is_anonymous,
                status: 'pending'
            }])
            .select()
            .single();

        if (insertError) throw insertError;

        // 2. Create FedaPay transaction
        const transaction = await Transaction.create({
            description: `Donation pour ${schoolSlug} - Campagne ${campaignId}`,
            amount: amount,
            currency: { iso: 'XOF' },
            callback_url: `${process.env.VITE_BACKEND_URL || 'https://yziow.com'}/d/${schoolSlug}/${campaignId}/success`,
            customer: {
                firstname: is_anonymous ? 'Anonyme' : (donor_name || 'Donateur'),
                lastname: '',
                email: donor_email || 'donateur@yziow.com',
                phone_number: {
                    number: donor_phone || '',
                    country: 'TG'
                }
            },
            metadata: {
                type: 'donation',
                schoolSlug,
                campaignId,
                donationId: donation.id
            }
        });

        const token = await transaction.generateToken();

        // 3. Update donation with transaction ID
        await supabase
            .from(tableName)
            .update({ transaction_id: transaction.id.toString() })
            .eq('id', donation.id);

        res.json({ token: token.url, transactionId: transaction.id });
    } catch (err) {
        console.error('Initiate donation error:', err);
        res.status(500).json({ error: 'Erreur lors de l\'initialisation du paiement.' });
    }
};
