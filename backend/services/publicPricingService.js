'use strict';

const supabaseModule = require('../utils/supabase');

/**
 * Résout de façon autoritaire et en lecture seule les tarifs publics actifs pour un pays donné.
 * Source unique de vérité : tables saas_pricing_grids et saas_pricing_grid_countries.
 * Aucun secours local ni montant codé en dur.
 *
 * @param {string} countryCode - Code ISO 3166-1 alpha-2 du pays (ex: 'BJ', 'ES', 'GH')
 * @param {object|null} customSupabase - Client Supabase optionnel (injection pour tests / mocks)
 * @returns {Promise<object>} Grille tarifaire publique normalisée
 */
async function getPublicPricingForCountry(countryCode, customSupabase = null) {
    if (!countryCode || typeof countryCode !== 'string') {
        const err = new Error('Code pays requis.');
        err.code = 'INVALID_COUNTRY_CODE';
        throw err;
    }

    const normCountry = countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(normCountry)) {
        const err = new Error('Format de code pays invalide (attendu 2 lettres ISO).');
        err.code = 'INVALID_COUNTRY_CODE';
        throw err;
    }

    const client = customSupabase || supabaseModule.supabase;
    if (!client || typeof client.from !== 'function') {
        const dbErr = new Error('Client base de données indisponible.');
        dbErr.code = 'DATABASE_ERROR';
        throw dbErr;
    }

    if (client.simulateDbError) {
        const dbErr = new Error('Erreur base de données simulée');
        dbErr.code = 'DATABASE_ERROR';
        throw dbErr;
    }

    const nowIso = new Date().toISOString();

    const { data: grids, error } = await client
        .from('saas_pricing_grids')
        .select(`
            id, pricing_version, scope_type, scope_code,
            currency_code, currency_symbol, currency_minor_unit, locale,
            rates_monthly, billing_months, annual_discount_percent,
            installments_count, pricing_status, payment_status, enabled, effective_from, effective_to,
            saas_pricing_grid_countries!inner ( country_code )
        `)
        .eq('enabled', true)
        .eq('saas_pricing_grid_countries.country_code', normCountry)
        .lte('effective_from', nowIso);

    if (error) {
        const dbErr = new Error('Erreur lors de la requête des grilles tarifaires.');
        dbErr.code = 'DATABASE_ERROR';
        dbErr.details = error.message;
        throw dbErr;
    }

    if (!Array.isArray(grids) || grids.length === 0) {
        const err = new Error(`Aucune grille tarifaire active n'est configurée pour le pays ${normCountry}.`);
        err.code = 'PRICING_GRID_NOT_CONFIGURED';
        throw err;
    }

    const activeGrids = grids.filter(g => {
        if (!g || typeof g !== 'object') return false;
        if (g.enabled !== true) return false;
        if (g.pricing_status !== 'active') return false;
        if (!g.effective_from || new Date(g.effective_from) > new Date(nowIso)) return false;
        if (g.effective_to && new Date(g.effective_to) <= new Date(nowIso)) return false;
        return true;
    });

    if (activeGrids.length === 0) {
        const err = new Error(`Aucune grille tarifaire active n'est configurée pour le pays ${normCountry}.`);
        err.code = 'PRICING_GRID_NOT_CONFIGURED';
        throw err;
    }

    // Priorité déterministe :
    // 1. scope_type 'country' > 'region'
    // 2. effective_from le plus récent
    // 3. ordre secondaire stable : id décroissant si présent
    activeGrids.sort((a, b) => {
        if (a.scope_type === 'country' && b.scope_type !== 'country') return -1;
        if (b.scope_type === 'country' && a.scope_type !== 'country') return 1;
        const timeDiff = new Date(b.effective_from || 0).getTime() - new Date(a.effective_from || 0).getTime();
        if (timeDiff !== 0) return timeDiff;
        return String(b.id || '').localeCompare(String(a.id || ''));
    });

    const selectedGrid = activeGrids[0];
    return formatAndValidatePublicPricing(normCountry, selectedGrid);
}

/**
 * Valide strictement l'intégrité de la grille et retourne la réponse publique minimale.
 */
function formatAndValidatePublicPricing(countryCode, grid) {
    if (!grid || typeof grid !== 'object') {
        const err = new Error('Données de grille tarifaire invalides.');
        err.code = 'INVALID_GRID_DATA';
        throw err;
    }

    if (grid.enabled !== true) {
        const err = new Error('Grille non activée.');
        err.code = 'INVALID_GRID_DATA';
        throw err;
    }

    if (grid.pricing_status !== 'active') {
        const err = new Error('Statut de tarification non actif.');
        err.code = 'INVALID_GRID_DATA';
        throw err;
    }

    if (!grid.effective_from || Number.isNaN(new Date(grid.effective_from).getTime()) || new Date(grid.effective_from) > new Date()) {
        const err = new Error('Date de prise d\'effet invalide ou future.');
        err.code = 'INVALID_GRID_DATA';
        throw err;
    }

    let matchesCountry = false;
    if (Array.isArray(grid.saas_pricing_grid_countries)) {
        matchesCountry = grid.saas_pricing_grid_countries.some(c => c && c.country_code === countryCode);
    } else if (grid.saas_pricing_grid_countries && typeof grid.saas_pricing_grid_countries === 'object') {
        matchesCountry = grid.saas_pricing_grid_countries.country_code === countryCode;
    }
    if (!matchesCountry) {
        const err = new Error('La grille ne correspond pas au pays demandé.');
        err.code = 'INVALID_GRID_DATA';
        throw err;
    }

    if (!grid.pricing_version || typeof grid.pricing_version !== 'string' || grid.pricing_version.trim() === '') {
        const err = new Error('pricing_version manquant ou invalide.');
        err.code = 'INVALID_GRID_DATA';
        throw err;
    }

    if (!grid.currency_code || typeof grid.currency_code !== 'string' || !/^[A-Z]{3}$/.test(grid.currency_code.trim())) {
        const err = new Error('currency_code manquant ou invalide.');
        err.code = 'INVALID_GRID_DATA';
        throw err;
    }

    if (!grid.currency_symbol || typeof grid.currency_symbol !== 'string' || grid.currency_symbol.trim() === '') {
        const err = new Error('currency_symbol manquant ou invalide.');
        err.code = 'INVALID_GRID_DATA';
        throw err;
    }

    const minorUnit = grid.currency_minor_unit;
    if (typeof minorUnit !== 'number' || !Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > 4) {
        const err = new Error('currency_minor_unit invalide.');
        err.code = 'INVALID_GRID_DATA';
        throw err;
    }

    const rates = grid.rates_monthly;
    if (!rates || typeof rates !== 'object') {
        const err = new Error('rates_monthly manquant ou invalide.');
        err.code = 'INVALID_GRID_DATA';
        throw err;
    }

    const requiredCycles = [
        { key: 'maternelle_primaire', label: 'Maternelle & Primaire' },
        { key: 'college_secondaire', label: 'Collège & Secondaire' },
        { key: 'superieur_formation', label: 'Université & Supérieur' }
    ];

    const formattedCycles = {};

    for (const cycle of requiredCycles) {
        const rateVal = rates[cycle.key];
        if (typeof rateVal !== 'number' || !Number.isFinite(rateVal) || !Number.isInteger(rateVal) || rateVal < 0) {
            const err = new Error(`Montant invalide pour le cycle ${cycle.key}.`);
            err.code = 'INVALID_GRID_DATA';
            throw err;
        }
        formattedCycles[cycle.key] = {
            label: cycle.label,
            monthly: rateVal
        };
    }

    return {
        country: countryCode,
        currency: grid.currency_code.trim().toUpperCase(),
        currency_symbol: grid.currency_symbol.trim(),
        currency_minor_unit: minorUnit,
        locale: typeof grid.locale === 'string' && grid.locale.trim() ? grid.locale.trim() : null,
        pricing_version: grid.pricing_version.trim(),
        effective_from: grid.effective_from || null,
        cycles: formattedCycles
    };
}

module.exports = {
    getPublicPricingForCountry
};
