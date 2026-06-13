const { supabase } = require('../utils/supabase');

/**
 * GET /api/settings
 * Gère les paramètres publics de la plateforme globale
 */
async function getPublicSettings(req, res) {
    // La table unifiée app_settings n'existe plus en SaaS,
    // Chaque école possède sa propre table, donc on retourne des valeurs générales par défaut 
    // sur la page de connexion, avant que l'utilisateur sélectionne son école !
    try {
        return res.json({
            appName: 'Portail Éducation',
            schoolName: 'Bienvenue',
            schoolLogo: null,
            schoolStamp: null
        });
    } catch (err) {
        console.error('Error fetching public settings:', err.message);
        return res.status(500).json({ error: err.message });
    }
}

module.exports = { getPublicSettings };
