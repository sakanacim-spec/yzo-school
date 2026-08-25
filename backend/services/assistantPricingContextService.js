'use strict';

const { supabase: defaultSupabase } = require('../utils/supabase');

const COUNTRY_SYNONYMS = {
    GH: ['GH', 'GHANA'],
    BJ: ['BJ', 'BENIN', 'BÉNIN'],
    CM: ['CM', 'CAMEROUN', 'CAMEROON'],
    ES: ['ES', 'ESPAGNE', 'SPAIN', 'ESPAÑA', 'ESPANA'],
    CI: ['CI', 'COTE D\'IVOIRE', 'CÔTE D\'IVOIRE', 'IVORY COAST', 'COTE D IVOIRE'],
    SN: ['SN', 'SENEGAL', 'SÉNÉGAL'],
    TG: ['TG', 'TOGO'],
    BF: ['BF', 'BURKINA', 'BURKINA FASO'],
    ML: ['ML', 'MALI'],
    NE: ['NE', 'NIGER'],
    GA: ['GA', 'GABON'],
    CG: ['CG', 'CONGO', 'CONGO BRAZZAVILLE', 'CONGO-BRAZZAVILLE'],
    CD: ['CD', 'RDC', 'RD CONGO', 'CONGO RDC', 'DR CONGO', 'CONGO KINSHASA', 'CONGO-KINSHASA'],
    TD: ['TD', 'TCHAD', 'CHAD'],
    CF: ['CF', 'CENTRAFRIQUE', 'RCA', 'REPUBLIQUE CENTRAFRICAINE', 'RÉPUBLIQUE CENTRAFRICAINE'],
    GN: ['GN', 'GUINEE', 'GUINÉE', 'GUINEA', 'GUINEE CONAKRY', 'GUINÉE CONAKRY'],
    GQ: ['GQ', 'GUINEE EQUATORIALE', 'GUINÉE ÉQUATORIALE', 'EQUATORIAL GUINEA'],
    GW: ['GW', 'GUINEE-BISSAU', 'GUINÉE-BISSAU', 'GUINEA-BISSAU'],
    NG: ['NG', 'NIGERIA'],
    FR: ['FR', 'FRANCE'],
    BE: ['BE', 'BELGIQUE', 'BELGIUM'],
    CA: ['CA', 'CANADA'],
    US: ['US', 'USA', 'ETATS-UNIS', 'ÉTATS-UNIS', 'UNITED STATES', 'AMERIQUE', 'AMÉRIQUE'],
    CH: ['CH', 'SUISSE', 'SWITZERLAND'],
    MA: ['MA', 'MAROC', 'MOROCCO'],
    DZ: ['DZ', 'ALGERIE', 'ALGÉRIE', 'ALGERIA'],
    TN: ['TN', 'TUNISIE', 'TUNISIA'],
    MG: ['MG', 'MADAGASCAR'],
    RW: ['RW', 'RWANDA'],
    BI: ['BI', 'BURUNDI']
};

/**
 * Normalise et extrait un code pays ISO-2 depuis les messages ou un paramètre explicite.
 */
function extractGuestCountry(messages, explicitCountry) {
    if (typeof explicitCountry === 'string' && explicitCountry.trim()) {
        const normExp = explicitCountry.trim().toUpperCase();
        if (/^[A-Z]{2}$/.test(normExp)) {
            return normExp;
        }
        for (const [code, synonyms] of Object.entries(COUNTRY_SYNONYMS)) {
            if (synonyms.includes(normExp)) {
                return code;
            }
        }
    }

    if (!Array.isArray(messages) || messages.length === 0) {
        return null;
    }

    const textToScan = messages
        .filter(m => m && (m.role === 'user' || m.sender === 'user'))
        .map(m => (typeof m.text === 'string' ? m.text : (typeof m.content === 'string' ? m.content : '')))
        .join(' ')
        .toUpperCase();

    if (!textToScan) {
        return null;
    }

    // Détection par mot entier ou symbole
    for (const [code, synonyms] of Object.entries(COUNTRY_SYNONYMS)) {
        for (const syn of synonyms) {
            const escaped = syn.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(`(^|[^A-ZÀ-ÖØ-öø-ÿ])${escaped}([^A-ZÀ-ÖØ-öø-ÿ]|$)`, 'i');
            if (regex.test(textToScan)) {
                return code;
            }
        }
    }

    return null;
}

/**
 * Détecte si l'utilisateur pose une question relative à la tarification.
 */
function detectPricingIntent(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return false;
    }

    const lastUserMsg = [...messages]
        .reverse()
        .find(m => m && (m.role === 'user' || m.sender === 'user'));

    if (!lastUserMsg) {
        return false;
    }

    const text = (typeof lastUserMsg.text === 'string' ? lastUserMsg.text : (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : ''))
        .toLowerCase();

    const pricingKeywords = [
        'tarif', 'tarifs', 'grille', 'prix', 'coût', 'cout', 'coûts', 'couts',
        'combien', 'frais', 'abonnement', 'abonnements', 'facturation',
        'pricing', 'price', 'prices', 'rate', 'rates', 'cost', 'costs',
        'subscription fee', 'subscription fees', 'combien ça coûte', 'combien ca coute'
    ];

    return pricingKeywords.some(kw => text.includes(kw));
}

/**
 * Détecte si l'utilisateur demande l'ensemble des grilles / tous les pays.
 */
function detectGlobalPricingRequest(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return false;
    }

    const lastUserMsg = [...messages]
        .reverse()
        .find(m => m && (m.role === 'user' || m.sender === 'user'));

    if (!lastUserMsg) {
        return false;
    }

    const text = (typeof lastUserMsg.text === 'string' ? lastUserMsg.text : (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : ''))
        .toLowerCase();

    const globalKeywords = [
        'tous les tarifs', 'tous les prix', 'toutes les grilles', 'tous les pays',
        'grille complète', 'grille complete', 'catalogue complet', 'chaque pays',
        'monde entier', 'all prices', 'all pricing', 'all countries', 'all rates',
        'international pricing', 'toutes les zones'
    ];

    return globalKeywords.some(kw => text.includes(kw));
}

/**
 * Formate un montant en tenant compte de currency_minor_unit.
 */
function formatAmount(storedAmount, minorUnit, currencySymbol, currencyCode) {
    const num = Number(storedAmount) || 0;
    const divisor = 10 ** (typeof minorUnit === 'number' ? minorUnit : 0);
    const displayAmount = num / divisor;

    const formattedNumber = displayAmount.toLocaleString('fr-FR', {
        minimumFractionDigits: minorUnit > 0 ? minorUnit : 0,
        maximumFractionDigits: minorUnit > 0 ? minorUnit : 0
    });

    const symbol = currencySymbol || currencyCode || '';
    if (symbol === 'GH₵' || symbol === '$' || symbol === '£') {
        return `${symbol}${formattedNumber}`;
    }
    if (symbol === '€' || symbol === 'FCFA') {
        return `${formattedNumber} ${symbol}`;
    }
    return `${formattedNumber} ${symbol}`.trim();
}

/**
 * Formate les tarifs mensuels par catégorie sans [object Object] ni conversion de devise.
 */
function formatMonthlyRates(ratesMonthly, currencyMinorUnit, currencySymbol, currencyCode) {
    const rates = ratesMonthly || {};
    return {
        maternelle_primaire: formatAmount(rates.maternelle_primaire, currencyMinorUnit, currencySymbol, currencyCode),
        college_secondaire: formatAmount(rates.college_secondaire, currencyMinorUnit, currencySymbol, currencyCode),
        superieur_formation: formatAmount(rates.superieur_formation, currencyMinorUnit, currencySymbol, currencyCode)
    };
}

/**
 * Construit la réponse textuelle déterministe pour l'utilisateur.
 */
function buildCountryPricingResponse(pricingContext) {
    if (!pricingContext) {
        return "Impossible de récupérer la grille tarifaire.";
    }

    const {
        country_code,
        currency_code,
        currency_symbol,
        currency_minor_unit,
        rates_monthly,
        billing_months,
        annual_discount_percent,
        installments_count,
        payment_status
    } = pricingContext;

    const formattedRates = formatMonthlyRates(rates_monthly, currency_minor_unit, currency_symbol, currency_code);

    let response = `Voici la grille tarifaire officielle YZIOW applicable pour le pays [${country_code}] (Devise : ${currency_code}${currency_symbol ? ` / ${currency_symbol}` : ''}) :\n\n` +
        `• Maternelle & Primaire : ${formattedRates.maternelle_primaire} / élève / mois\n` +
        `• Collège & Secondaire : ${formattedRates.college_secondaire} / élève / mois\n` +
        `• Supérieur & Formation : ${formattedRates.superieur_formation} / élève / mois\n\n` +
        `• Facturation annuelle basée sur ${billing_months || 10} mois scolaires.\n` +
        `• Remise de ${annual_discount_percent || 0}% en cas de règlement annuel comptant.\n` +
        `• Possibilité de paiement échelonné en ${installments_count || 3} tranches.\n\n`;

    if (payment_status === 'configuration_pending') {
        response += `ℹ️ La grille tarifaire est disponible, mais le paiement électronique n’est pas encore activé dans votre pays. Veuillez contacter YZIOW pour connaître les modalités provisoires de règlement.`;
    } else {
        response += `✅ Le paiement électronique est disponible pour votre établissement.`;
    }

    return response;
}

/**
 * Récupère le contexte tarifaire exact d'un pays (ou de l'établissement d'un utilisateur authentifié).
 */
async function getAssistantPricingContext({
    authenticatedUser,
    requestedCountryCode,
    supabaseClient = defaultSupabase
} = {}) {
    let countryCode = null;

    // 1. Pour un utilisateur authentifié, priorité absolue et autoritaire à schools.country
    if (authenticatedUser && typeof authenticatedUser === 'object' && authenticatedUser.schoolSlug) {
        const slug = String(authenticatedUser.schoolSlug).trim();
        try {
            const { data: school, error: schErr } = await supabaseClient
                .from('schools')
                .select('country')
                .eq('slug', slug)
                .single();

            if (schErr || !school || !school.country) {
                const err = new Error("Établissement introuvable ou pays non renseigné");
                err.code = 'PRICING_NOT_CONFIGURED';
                throw err;
            }
            countryCode = String(school.country).toUpperCase().trim();
        } catch (dbErr) {
            if (dbErr.code === 'PRICING_NOT_CONFIGURED') throw dbErr;
            const err = new Error(`Échec de la lecture de l'établissement: ${dbErr.message}`);
            err.code = 'PRICING_LOOKUP_FAILED';
            throw err;
        }
    } else {
        // 2. Pour un invité, utilisation exclusive du pays explicitement fourni / extrait
        if (!requestedCountryCode || typeof requestedCountryCode !== 'string' || !requestedCountryCode.trim()) {
            const err = new Error("Code pays requis pour les invités");
            err.code = 'COUNTRY_REQUIRED';
            throw err;
        }
        countryCode = requestedCountryCode.toUpperCase().trim();
        if (!/^[A-Z]{2}$/.test(countryCode)) {
            const err = new Error("Code pays invalide");
            err.code = 'COUNTRY_REQUIRED';
            throw err;
        }
    }

    if (!countryCode) {
        const err = new Error("Code pays manquant");
        err.code = 'COUNTRY_REQUIRED';
        throw err;
    }

    // 3. Résolution des grilles associées
    try {
        const { data: associations, error: assocErr } = await supabaseClient
            .from('saas_pricing_grid_countries')
            .select('pricing_grid_id, country_code')
            .eq('country_code', countryCode);

        if (assocErr) {
            const err = new Error(`Erreur recherche pays: ${assocErr.message}`);
            err.code = 'PRICING_LOOKUP_FAILED';
            throw err;
        }

        if (!Array.isArray(associations) || associations.length === 0) {
            const err = new Error(`Aucune grille tarifaire trouvée pour le pays ${countryCode}`);
            err.code = 'PRICING_NOT_CONFIGURED';
            throw err;
        }

        const gridIds = associations
            .map(a => a.pricing_grid_id)
            .filter(id => id !== undefined && id !== null && id !== '');

        if (gridIds.length === 0) {
            const err = new Error(`Aucune liaison de grille valide pour ${countryCode}`);
            err.code = 'PRICING_NOT_CONFIGURED';
            throw err;
        }

        const { data: grids, error: gridErr } = await supabaseClient
            .from('saas_pricing_grids')
            .select(`
                id, pricing_version, scope_type, scope_code,
                currency_code, currency_symbol, currency_minor_unit, locale,
                rates_monthly, billing_months, annual_discount_percent,
                installments_count, pricing_status, payment_status, enabled
            `)
            .in('id', gridIds)
            .eq('enabled', true);

        if (gridErr) {
            const err = new Error(`Erreur récupération grilles: ${gridErr.message}`);
            err.code = 'PRICING_LOOKUP_FAILED';
            throw err;
        }

        if (!Array.isArray(grids) || grids.length === 0) {
            const err = new Error(`Aucune grille active pour le pays ${countryCode}`);
            err.code = 'PRICING_NOT_CONFIGURED';
            throw err;
        }

        // Filtrer uniquement pricing_status === 'active'
        const activeGrids = grids.filter(g => g.pricing_status === 'active');

        if (activeGrids.length === 0) {
            const err = new Error(`Aucune grille avec statut actif pour ${countryCode}`);
            err.code = 'PRICING_NOT_CONFIGURED';
            throw err;
        }

        if (activeGrids.length > 1) {
            const err = new Error(`Plusieurs grilles actives configurées pour le pays ${countryCode}`);
            err.code = 'MULTIPLE_ACTIVE_PRICING_GRIDS';
            throw err;
        }

        const selectedGrid = activeGrids[0];

        return {
            country_code: countryCode,
            currency_code: selectedGrid.currency_code,
            currency_symbol: selectedGrid.currency_symbol,
            currency_minor_unit: typeof selectedGrid.currency_minor_unit === 'number' ? selectedGrid.currency_minor_unit : 0,
            rates_monthly: selectedGrid.rates_monthly,
            billing_months: selectedGrid.billing_months,
            annual_discount_percent: selectedGrid.annual_discount_percent,
            installments_count: selectedGrid.installments_count,
            pricing_status: selectedGrid.pricing_status,
            payment_status: selectedGrid.payment_status,
            pricing_version: selectedGrid.pricing_version
        };

    } catch (error) {
        if (error.code === 'PRICING_NOT_CONFIGURED' ||
            error.code === 'MULTIPLE_ACTIVE_PRICING_GRIDS' ||
            error.code === 'COUNTRY_REQUIRED') {
            throw error;
        }
        const err = new Error(`Échec de la résolution tarifaire: ${error.message}`);
        err.code = 'PRICING_LOOKUP_FAILED';
        throw err;
    }
}

module.exports = {
    getAssistantPricingContext,
    extractGuestCountry,
    detectPricingIntent,
    detectGlobalPricingRequest,
    formatAmount,
    formatMonthlyRates,
    buildCountryPricingResponse
};
