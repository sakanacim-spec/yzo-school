const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { validateBoundedString } = require('../utils/helpers');

const publicFormLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Trop de soumissions de formulaires depuis cette IP, veuillez réessayer après 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// POST /api/public/contact
// Envoi d'un message depuis le formulaire de contact
router.post('/contact', publicFormLimiter, async (req, res) => {
    try {
        const { name, country, email, message } = req.body;

        if (!name || !country || !email || !message) {
            return res.status(400).json({ error: 'Tous les champs sont requis.' });
        }

        const validName = validateBoundedString(name, 1, 150);
        const validCountry = validateBoundedString(country, 1, 100);
        const validEmail = validateBoundedString(email, 3, 200);
        const validMessage = validateBoundedString(message, 1, 5000);

        const { error } = await supabase
            .from('contact_messages')
            .insert([
                { name: validName, country: validCountry, email: validEmail, message: validMessage, status: 'unread' }
            ]);

        if (error) {
            console.error('Erreur insertion contact:', error);
            throw error;
        }

        res.status(200).json({ success: true, message: 'Message envoyé avec succès.' });
    } catch (err) {
        console.error('Erreur API public contact:', err.message);
        res.status(500).json({ error: 'Erreur lors de l\'envoi du message.' });
    }
});

// POST /api/public/careers
// Envoi d'une candidature depuis la modale carrières
router.post('/careers', publicFormLimiter, async (req, res) => {
    try {
        const { job_title, name, country, email, cover_letter } = req.body;

        if (!job_title || !name || !country || !email || !cover_letter) {
            return res.status(400).json({ error: 'Tous les champs sont requis.' });
        }

        const validJobTitle = validateBoundedString(job_title, 1, 150);
        const validName = validateBoundedString(name, 1, 150);
        const validCountry = validateBoundedString(country, 1, 100);
        const validEmail = validateBoundedString(email, 3, 200);
        const validCoverLetter = validateBoundedString(cover_letter, 1, 10000);

        const { error } = await supabase
            .from('job_applications')
            .insert([
                { job_title: validJobTitle, name: validName, country: validCountry, email: validEmail, cover_letter: validCoverLetter, status: 'pending' }
            ]);

        if (error) {
            console.error('Erreur insertion candidature:', error);
            throw error;
        }

        res.status(200).json({ success: true, message: 'Candidature envoyée avec succès.' });
    } catch (err) {
        console.error('Erreur API public careers:', err.message);
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
router.post('/recommend-school', publicFormLimiter, async (req, res) => {
    try {
        const { parent_name, parent_phone, school_name, city, country, director_phone, notes } = req.body;

        if (!parent_name || !parent_phone || !school_name) {
            return res.status(400).json({ error: 'Le nom du parent, le téléphone et le nom de l\'école sont requis.' });
        }

        const validParentName = validateBoundedString(parent_name, 1, 150);
        const validParentPhone = validateBoundedString(parent_phone, 1, 50);
        const validSchoolName = validateBoundedString(school_name, 1, 200);
        const validCity = city ? validateBoundedString(city, 1, 100) : 'Non renseigné';
        const validCountry = country ? validateBoundedString(country, 1, 100) : 'Non renseigné';
        const validDirectorPhone = director_phone ? validateBoundedString(director_phone, 1, 50) : 'Non fourni';
        const validNotes = notes ? validateBoundedString(notes, 0, 3000) : '';

        const messageBody = `[DEMANDE OUVERTURE ÉCOLE PAR PARENT]\nParent: ${validParentName} (${validParentPhone})\nÉcole demandée: ${validSchoolName}\nVille/Pays: ${validCity} / ${validCountry}\nTél Directeur/Secrétariat: ${validDirectorPhone}\nNotes: ${validNotes}`;

        const { error } = await supabase
            .from('contact_messages')
            .insert([
                { name: validParentName, country: validCountry, email: `${validParentPhone.replace(/\D/g, '')}@yziow-parent-lead.com`, message: messageBody, status: 'unread' }
            ]);

        if (error) {
            console.error('Erreur insertion recommandation école:', error);
            throw error;
        }

        res.status(200).json({ success: true, message: 'Demande d\'ouverture enregistrée avec succès.' });
    } catch (err) {
        console.error('Erreur API public recommend-school:', err.message);
        res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la demande.' });
    }
});

module.exports = router;
