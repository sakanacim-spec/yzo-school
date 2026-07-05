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

module.exports = router;
