const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabase');

// POST /api/public/contact
// Envoi d'un message depuis le formulaire de contact
router.post('/contact', async (req, res) => {
    try {
        const { name, country, email, message } = req.body;

        if (!name || !country || !email || !message) {
            return res.status(400).json({ error: 'Tous les champs sont requis.' });
        }

        const { data, error } = await supabase
            .from('contact_messages')
            .insert([
                { name, country, email, message, status: 'unread' }
            ]);

        if (error) {
            console.error('Erreur insertion contact:', error);
            throw error;
        }

        res.status(200).json({ success: true, message: 'Message envoyé avec succès.' });
    } catch (err) {
        console.error('Erreur API public contact:', err);
        res.status(500).json({ error: 'Erreur lors de l\'envoi du message.' });
    }
});

// POST /api/public/careers
// Envoi d'une candidature depuis la modale carrières
router.post('/careers', async (req, res) => {
    try {
        const { job_title, name, country, email, cover_letter } = req.body;

        if (!job_title || !name || !country || !email || !cover_letter) {
            return res.status(400).json({ error: 'Tous les champs sont requis.' });
        }

        const { data, error } = await supabase
            .from('job_applications')
            .insert([
                { job_title, name, country, email, cover_letter, status: 'pending' }
            ]);

        if (error) {
            console.error('Erreur insertion candidature:', error);
            throw error;
        }

        res.status(200).json({ success: true, message: 'Candidature envoyée avec succès.' });
    } catch (err) {
        console.error('Erreur API public careers:', err);
        res.status(500).json({ error: 'Erreur lors de l\'envoi de la candidature.' });
    }
});

// GET /api/public/announcements/global
// Récupère les annonces globales du SuperAdmin pour les directeurs d'écoles
router.get('/announcements/global', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('global_announcements')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ announcements: data || [] });
    } catch (err) {
        console.error('Erreur lors de la récupération des annonces globales:', err.message);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// POST /api/public/recommend-school
// Demande d'ouverture d'une école par un parent d'élève
router.post('/recommend-school', async (req, res) => {
    try {
        const { parent_name, parent_phone, school_name, city, country, director_phone, notes } = req.body;

        if (!parent_name || !parent_phone || !school_name) {
            return res.status(400).json({ error: 'Le nom du parent, le téléphone et le nom de l\'école sont requis.' });
        }

        const messageBody = `[DEMANDE OUVERTURE ÉCOLE PAR PARENT]\nParent: ${parent_name} (${parent_phone})\nÉcole demandée: ${school_name}\nVille/Pays: ${city || 'Non renseigné'} / ${country || 'Non renseigné'}\nTél Directeur/Secrétariat: ${director_phone || 'Non fourni'}\nNotes: ${notes || ''}`;

        const { error } = await supabase
            .from('contact_messages')
            .insert([
                { name: parent_name, country: country || 'Afrique', email: `${parent_phone.replace(/\D/g, '')}@yziow-parent-lead.com`, message: messageBody, status: 'unread' }
            ]);

        if (error) {
            console.error('Erreur insertion recommandation école:', error);
            throw error;
        }

        res.status(200).json({ success: true, message: 'Demande d\'ouverture enregistrée avec succès.' });
    } catch (err) {
        console.error('Erreur API public recommend-school:', err);
        res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la demande.' });
    }
});

module.exports = router;
