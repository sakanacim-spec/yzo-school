const { supabase } = require('../utils/supabase');

// --- SCHOOL (DIRECTOR) ROUTES ---

exports.getSchoolWithdrawals = async (req, res) => {
    try {
        const { schoolId, slug } = req.user;
        
        const { data, error } = await supabase
            .from('school_withdrawals')
            .select('*')
            .eq('school_id', schoolId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ withdrawals: data || [] });
    } catch (err) {
        console.error('getSchoolWithdrawals error:', err);
        res.status(500).json({ error: 'Erreur lors de la récupération des retraits.' });
    }
};

exports.requestWithdrawal = async (req, res) => {
    try {
        const { schoolId, slug } = req.user;
        const { amount, paymentMethod, paymentDetails } = req.body;

        if (!amount || amount <= 0 || !paymentMethod || !paymentDetails) {
            return res.status(400).json({ error: 'Données de retrait invalides.' });
        }

        // 1. Calculer le solde disponible
        // Total collecté
        const tableName = `campaigns_${slug}`;
        const { data: campaigns, error: campErr } = await supabase
            .from(tableName)
            .select('current_amount');
            
        if (campErr) throw campErr;
        
        const totalCollected = campaigns.reduce((acc, c) => acc + Number(c.current_amount), 0);
        const yziowFee = totalCollected * 0.05; // 5%
        const netCollected = totalCollected - yziowFee;

        // 2. Soustraire les retraits déjà en attente ou payés
        const { data: pastWithdrawals, error: wdErr } = await supabase
            .from('school_withdrawals')
            .select('amount')
            .eq('school_id', schoolId)
            .in('status', ['pending', 'paid']);

        if (wdErr) throw wdErr;

        const totalWithdrawn = pastWithdrawals.reduce((acc, w) => acc + Number(w.amount), 0);
        const availableBalance = netCollected - totalWithdrawn;

        if (amount > availableBalance) {
            return res.status(400).json({ error: 'Montant demandé supérieur au solde disponible.' });
        }

        // 3. Créer la demande
        const { data, error } = await supabase
            .from('school_withdrawals')
            .insert({
                school_id: schoolId,
                school_slug: slug,
                amount,
                payment_method: paymentMethod,
                payment_details: paymentDetails
            })
            .select()
            .single();

        if (error) throw error;
        res.json({ message: 'Demande envoyée avec succès', withdrawal: data });
    } catch (err) {
        console.error('requestWithdrawal error:', err);
        res.status(500).json({ error: 'Erreur lors de la demande de retrait.' });
    }
};

// --- SUPERADMIN ROUTES ---

exports.getSuperAdminWithdrawals = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('school_withdrawals')
            .select('*, schools(name)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ withdrawals: data || [] });
    } catch (err) {
        console.error('getSuperAdminWithdrawals error:', err);
        res.status(500).json({ error: 'Erreur lors de la récupération des retraits.' });
    }
};

exports.updateWithdrawalStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        if (!['pending', 'paid', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Statut invalide.' });
        }

        const { data, error } = await supabase
            .from('school_withdrawals')
            .update({ status, notes })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json({ message: 'Statut mis à jour', withdrawal: data });
    } catch (err) {
        console.error('updateWithdrawalStatus error:', err);
        res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
    }
};
