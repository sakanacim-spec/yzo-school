const bcrypt = require('bcryptjs');
const { supabase } = require('../utils/supabase');

// ── GET /api/personnel ──────────────────────────────
async function getPersonnel(req, res) {
    const { role, schoolSlug } = req.user;
    
    if (role !== 'directeur' && role !== 'directeur_general' && role !== 'admin') {
        return res.status(403).json({ error: 'Accès refusé.' });
    }

    try {
        const { data: personnel, error } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('*')
            .in('role', ['admin', 'superviseur', 'surveillant', 'comptable', 'censeur']);

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
    const { nom, telephone, password, role } = req.body;

    if (userRole !== 'directeur' && userRole !== 'directeur_general') {
        return res.status(403).json({ error: 'Seul le directeur peut créer un compte membre du personnel.' });
    }

    if (!nom || !telephone || !password || !role) {
        return res.status(400).json({ error: 'Champs requis : nom, telephone, password, role.' });
    }

    if (!['admin', 'superviseur', 'comptable', 'censeur'].includes(role)) {
        return res.status(400).json({ error: 'Rôle invalide.' });
    }

    try {
        // Vérifier si le téléphone est déjà utilisé
        const { data: existing } = await supabase
            .from(`profiles_${schoolSlug}`)
            .select('id')
            .eq('telephone', telephone.trim())
            .single();

        if (existing) {
            return res.status(409).json({ error: 'Ce numéro de téléphone est déjà enregistré pour un autre compte.' });
        }

        const hashed = await bcrypt.hash(password, 10);

        const { data: personnel, error } = await supabase
            .from(`profiles_${schoolSlug}`)
            .insert({
                nom: nom.trim(),
                telephone: telephone.trim(),
                password: hashed,
                role: role
            })
            .select()
            .single();

        if (error) throw error;

        return res.status(201).json({
            message: 'Compte personnel créé avec succès.',
            personnel
        });
    } catch (err) {
        console.error('createPersonnel Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la création du compte personel.' });
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
        const { error } = await supabase
            .from(`profiles_${schoolSlug}`)
            .delete()
            .eq('id', id);

        if (error) throw error;
        return res.json({ message: 'Compte personnel supprimé avec succès.' });
    } catch (err) {
        console.error('deletePersonnel Error:', err.message);
        return res.status(500).json({ error: 'Erreur lors de la suppression.' });
    }
}

module.exports = { getPersonnel, createPersonnel, deletePersonnel };
