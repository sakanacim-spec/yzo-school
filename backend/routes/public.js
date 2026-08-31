'use strict';
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { validateBoundedString } = require('../utils/helpers');
const { validateDonationProposal } = require('../utils/donationProposalValidation');

// ---------------------------------------------------------------------------
// Limiteur générique pour les formulaires publics (10 req / 15 min / IP)
// ---------------------------------------------------------------------------
const publicFormLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Trop de soumissions de formulaires depuis cette IP, veuillez réessayer après 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ---------------------------------------------------------------------------
// Limiteur dédié aux propositions de dons (5 req / heure / IP)
// ---------------------------------------------------------------------------
const donationProposalLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: { error: 'Trop de soumissions depuis cette IP, veuillez réessayer dans une heure.' },
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
            console.error('Erreur API public contact');
            throw error;
        }

        res.status(200).json({ success: true, message: 'Message envoyé avec succès.' });
    } catch (err) {
        console.error('Erreur API public contact');
        res.status(500).json({ error: "Erreur lors de l'envoi du message." });
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
            console.error('Erreur API public careers');
            throw error;
        }

        res.status(200).json({ success: true, message: 'Candidature envoyée avec succès.' });
    } catch (err) {
        console.error('Erreur API public careers');
        res.status(500).json({ error: "Erreur lors de l'envoi de la candidature." });
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
        console.error('Erreur lors de la récupération des annonces globales');
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

// POST /api/public/donation-proposals
// Création d'une proposition de don via RPC Supabase
// RPC validation ensures response structure and field formats
router.post('/donation-proposals', donationProposalLimiter, async (req, res) => {
    try {
        const validation = validateDonationProposal(req.body);
        if (!validation.valid) {
            return res.status(400).json({ error: 'VALIDATION_FAILED', field: validation.errorField });
        }
        const value = validation.value; // données normalisées et trimées

        // 18 paramètres exacts de la RPC create_donation_proposal
        const rpcParams = {
            p_full_name:              value.fullName,
            p_role:                   value.role,
            p_company_name:           value.companyName,
            p_sector:                 value.sector,
            p_sub_sector:             value.subSector            ?? null,
            p_regulation_declaration: value.regulationDeclaration ?? null,
            p_other_sector_details:   value.otherSectorDetails    ?? null,
            p_organization_type:      value.organizationType      ?? null,
            p_support_type:           value.supportType,
            p_license:                value.license               ?? null,
            p_country:                value.country,
            p_target_markets:         value.targetMarkets,
            p_email:                  value.email,
            p_phone:                  value.phone,
            p_website:                value.website               ?? null,
            p_project_description:    value.projectDescription,
            p_language:               value.language,
            p_consent:                value.consent,
        };

        const { data, error } = await supabase.rpc('create_donation_proposal', rpcParams);

        // Validate RPC response structure and required fields
        if (
          error ||
          !Array.isArray(data) ||
          data.length !== 1 ||
          data[0] == null ||
          Array.isArray(data[0]) ||
          typeof data[0] !== 'object' ||
          typeof data[0].id !== 'string' ||
          typeof data[0].reference !== 'string' ||
          typeof data[0].status !== 'string'
        ) {
          console.error('Erreur API public donation-proposals');
          return res.status(500).json({ error: "Erreur lors de l'enregistrement de la proposition." });
        }

        const result = data[0];
        // Verify UUID format
        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
        // Verify reference pattern
        const refRegex = /^DON-\d{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
        if (!uuidRegex.test(result.id) || !refRegex.test(result.reference) || result.status !== 'pending') {
          console.error('Erreur API public donation-proposals');
          return res.status(500).json({ error: "Erreur lors de l'enregistrement de la proposition." });
        }

        return res.status(201).json({ id: result.id, reference: result.reference, status: result.status });
    } catch (err) {
      console.error('Erreur API public donation-proposals');
      return res.status(500).json({ error: "Erreur lors de l'enregistrement de la proposition." });
    }
});

module.exports = router;
