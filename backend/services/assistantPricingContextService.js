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

const COUNTRY_CONFIG = {
    GH: { name: 'Ghana', prep: 'au Ghana', article: 'le Ghana', currencyLabel: 'cedis ghanéens (GHS)' },
    BJ: { name: 'Bénin', prep: 'au Bénin', article: 'le Bénin', currencyLabel: 'francs CFA (XOF)' },
    CM: { name: 'Cameroun', prep: 'au Cameroun', article: 'le Cameroun', currencyLabel: 'francs CFA (XAF)' },
    ES: { name: 'Espagne', prep: 'en Espagne', article: "l'Espagne", currencyLabel: 'euros (EUR)' },
    CI: { name: "Côte d'Ivoire", prep: "en Côte d'Ivoire", article: "la Côte d'Ivoire", currencyLabel: 'francs CFA (XOF)' },
    SN: { name: 'Sénégal', prep: 'au Sénégal', article: 'le Sénégal', currencyLabel: 'francs CFA (XOF)' },
    TG: { name: 'Togo', prep: 'au Togo', article: 'le Togo', currencyLabel: 'francs CFA (XOF)' },
    BF: { name: 'Burkina Faso', prep: 'au Burkina Faso', article: 'le Burkina Faso', currencyLabel: 'francs CFA (XOF)' },
    ML: { name: 'Mali', prep: 'au Mali', article: 'le Mali', currencyLabel: 'francs CFA (XOF)' },
    NE: { name: 'Niger', prep: 'au Niger', article: 'le Niger', currencyLabel: 'francs CFA (XOF)' },
    GA: { name: 'Gabon', prep: 'au Gabon', article: 'le Gabon', currencyLabel: 'francs CFA (XAF)' },
    CG: { name: 'Congo', prep: 'au Congo', article: 'le Congo', currencyLabel: 'francs CFA (XAF)' },
    CD: { name: 'RD Congo', prep: 'en RD Congo', article: 'la RD Congo', currencyLabel: 'francs CFA (XAF)' },
    TD: { name: 'Tchad', prep: 'au Tchad', article: 'le Tchad', currencyLabel: 'francs CFA (XAF)' },
    CF: { name: 'Centrafrique', prep: 'en Centrafrique', article: 'la Centrafrique', currencyLabel: 'francs CFA (XAF)' },
    GN: { name: 'Guinée', prep: 'en Guinée', article: 'la Guinée', currencyLabel: 'francs guinéens (GNF)' },
    GQ: { name: 'Guinée équatoriale', prep: 'en Guinée équatoriale', article: 'la Guinée équatoriale', currencyLabel: 'francs CFA (XAF)' },
    GW: { name: 'Guinée-Bissau', prep: 'en Guinée-Bissau', article: 'la Guinée-Bissau', currencyLabel: 'francs CFA (XOF)' },
    NG: { name: 'Nigeria', prep: 'au Nigeria', article: 'le Nigeria', currencyLabel: 'nairas nigérians (NGN)' },
    FR: { name: 'France', prep: 'en France', article: 'la France', currencyLabel: 'euros (EUR)' },
    BE: { name: 'Belgique', prep: 'en Belgique', article: 'la Belgique', currencyLabel: 'euros (EUR)' },
    CA: { name: 'Canada', prep: 'au Canada', article: 'le Canada', currencyLabel: 'dollars canadiens (CAD)' },
    US: { name: 'États-Unis', prep: 'aux États-Unis', article: 'les États-Unis', currencyLabel: 'dollars américains (USD)' },
    CH: { name: 'Suisse', prep: 'en Suisse', article: 'la Suisse', currencyLabel: 'francs suisses (CHF)' },
    MA: { name: 'Maroc', prep: 'au Maroc', article: 'le Maroc', currencyLabel: 'dirhams marocains (MAD)' },
    DZ: { name: 'Algérie', prep: 'en Algérie', article: "l'Algérie", currencyLabel: 'dinars algériens (DZD)' },
    TN: { name: 'Tunisie', prep: 'en Tunisie', article: 'la Tunisie', currencyLabel: 'dinars tunisiens (TND)' },
    MG: { name: 'Madagascar', prep: 'à Madagascar', article: 'Madagascar', currencyLabel: 'ariarys (MGA)' },
    RW: { name: 'Rwanda', prep: 'au Rwanda', article: 'le Rwanda', currencyLabel: 'francs rwandais (RWF)' },
    BI: { name: 'Burundi', prep: 'au Burundi', article: 'le Burundi', currencyLabel: 'francs burundais (BIF)' }
};

const COUNTRY_DISPLAY_NAMES = Object.fromEntries(
    Object.entries(COUNTRY_CONFIG).map(([k, v]) => [k, v.name])
);

const CURRENCY_LABELS = {
    GHS: 'cedis ghanéens (GHS)',
    EUR: 'euros (EUR)',
    XOF: 'francs CFA (XOF)',
    XAF: 'francs CFA (XAF)',
    NGN: 'nairas nigérians (NGN)',
    USD: 'dollars américains (USD)'
};

/**
 * Trouve tous les codes pays distincts mentionnés dans un texte donné.
 */
function findCountriesInText(text) {
    if (!text || typeof text !== 'string') return [];
    const textUpper = text.toUpperCase();
    const foundCodes = [];

    for (const [code, synonyms] of Object.entries(COUNTRY_SYNONYMS)) {
        for (const syn of synonyms) {
            const escaped = syn.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(`(^|[^A-ZÀ-ÖØ-öø-ÿ])${escaped}([^A-ZÀ-ÖØ-öø-ÿ]|$)`, 'i');
            if (regex.test(textUpper)) {
                if (!foundCodes.includes(code)) {
                    foundCodes.push(code);
                }
                break;
            }
        }
    }
    return foundCodes;
}

/**
 * Normalise et extrait un code pays ISO-2 depuis les messages avec priorité stricte au dernier message.
 * Détecte les conflits / comparaisons multi-pays dans un même message.
 */
function extractGuestCountry(messages, explicitCountry, conversationState) {
    if (typeof explicitCountry === 'string' && explicitCountry.trim()) {
        const normExp = explicitCountry.trim().toUpperCase();
        if (/^[A-Z]{2}$/.test(normExp)) {
            return { status: 'RESOLVED', countryCode: normExp };
        }
        for (const [code, synonyms] of Object.entries(COUNTRY_SYNONYMS)) {
            if (synonyms.includes(normExp)) {
                return { status: 'RESOLVED', countryCode: code };
            }
        }
    }

    if (!Array.isArray(messages) || messages.length === 0) {
        return arguments.length === 1 ? null : { status: 'NOT_FOUND', countryCode: null };
    }

    const lastUserMsg = [...messages]
        .reverse()
        .find(m => m && (m.role === 'user' || m.sender === 'user'));

    if (!lastUserMsg) {
        return arguments.length === 1 ? null : { status: 'NOT_FOUND', countryCode: null };
    }

    const lastText = (typeof lastUserMsg.text === 'string' ? lastUserMsg.text : (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : ''));
    const detectedInLast = findCountriesInText(lastText);

    if (detectedInLast.length > 1) {
        return arguments.length === 1 ? null : {
            status: 'MULTIPLE_COUNTRIES_IN_INPUT',
            countries: detectedInLast,
            countryCode: null
        };
    }

    if (detectedInLast.length === 1) {
        return arguments.length === 1 ? detectedInLast[0] : {
            status: 'RESOLVED',
            countryCode: detectedInLast[0]
        };
    }

    // Aucun pays dans le dernier message : ne pas aller chercher un vieux pays dans l'historique
    return arguments.length === 1 ? null : {
        status: 'NOT_FOUND',
        countryCode: null
    };
}

/**
 * Détecte si l'utilisateur pose une question relative à la tarification ou si la conversation est en attente d'un pays.
 */
function detectPricingIntent(messages, conversationState) {
    if (conversationState && typeof conversationState === 'object' && conversationState.awaiting === 'pricing_country') {
        return true;
    }

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
 * Formate un message de clarification lorsque plusieurs pays sont mentionnés dans un même message.
 */
function formatMultipleCountriesClarification(countries) {
    const names = (countries || []).map(c => COUNTRY_DISPLAY_NAMES[c] || c).join(' ou ');
    return `Quel pays souhaitez‑vous recevoir la grille tarifaire : ${names} ?`;
}

/**
 * Formate un montant en tenant compte de currency_minor_unit.
 */
function formatAmount(storedAmount, minorUnit, currencySymbol, currencyCode) {
    const num = Number(storedAmount) || 0;
    const divisor = 10 ** (typeof minorUnit === 'number' ? minorUnit : 0);
    const displayAmount = num / divisor;

    const symbol = currencySymbol || currencyCode || '';

    if (symbol === '₦') {
        const isInteger = displayAmount % 1 === 0;
        const formattedNumber = displayAmount.toLocaleString('fr-FR', {
            minimumFractionDigits: isInteger ? 0 : (minorUnit > 0 ? minorUnit : 0),
            maximumFractionDigits: minorUnit > 0 ? minorUnit : 0
        });
        return `₦${formattedNumber}`;
    }

    const formattedNumber = displayAmount.toLocaleString('fr-FR', {
        minimumFractionDigits: minorUnit > 0 ? minorUnit : 0,
        maximumFractionDigits: minorUnit > 0 ? minorUnit : 0
    });

    if (symbol === 'GH₵' || symbol === 'FCFA' || symbol === '€') {
        return `${formattedNumber} ${symbol}`;
    }
    if (symbol === '$' || symbol === '£') {
        return `${symbol}${formattedNumber}`;
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

    const countryInfo = COUNTRY_CONFIG[country_code] || {
        name: COUNTRY_DISPLAY_NAMES[country_code] || country_code,
        prep: `pour le pays ${COUNTRY_DISPLAY_NAMES[country_code] || country_code}`,
        currencyLabel: CURRENCY_LABELS[currency_code] || `${currency_code}${currency_symbol ? ` (${currency_symbol})` : ''}`
    };

    const prepAndName = countryInfo.prep;
    const currencyLabel = CURRENCY_LABELS[currency_code] || countryInfo.currencyLabel || currency_code;

    let response = `Voici les tarifs YZIOW applicables ${prepAndName}, en ${currencyLabel} :\n\n` +
        `• Maternelle & Primaire : ${formattedRates.maternelle_primaire} / élève / mois\n` +
        `• Collège & Secondaire : ${formattedRates.college_secondaire} / élève / mois\n` +
        `• Supérieur & Formation : ${formattedRates.superieur_formation} / élève / mois\n\n` +
        `• Facturation annuelle basée sur ${billing_months || 10} mois scolaires.\n` +
        `• Remise de ${annual_discount_percent || 0}% en cas de règlement annuel comptant.\n` +
        `• Possibilité de paiement échelonné en ${installments_count || 3} tranches.\n\n`;

    if (payment_status === 'configuration_pending') {
        response += `ℹ️ Le module de paiement en ligne pour votre pays est en cours de configuration finale. Les règlements s'effectuent actuellement selon les modalités convenues avec notre équipe.`;
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
    findCountriesInText,
    formatMultipleCountriesClarification,
    formatAmount,
    formatMonthlyRates,
    buildCountryPricingResponse,
    COUNTRY_CONFIG,
    COUNTRY_DISPLAY_NAMES,
    CURRENCY_LABELS
};
