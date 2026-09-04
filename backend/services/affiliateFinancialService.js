'use strict';

const { supabase } = require('../utils/supabase');

/**
 * Service financier Ambassadeurs (Lot 6B)
 * Arithmétique exacte BigInt en unités mineures et manipulation du grand livre financier
 */

/**
 * Convertit un montant en devises majeures (Number/String) en unités mineures entières (BigInt)
 * selon l'exposant réel de la devise (0 pour XOF, 2 pour EUR/USD/NGN).
 * Ne présume JAMAIS un multiplicateur fixe par 100.
 *
 * @param {string|number} amount
 * @param {number} exponent
 * @returns {bigint}
 */
function toMinorUnits(amount, exponent = 0) {
    if (amount === undefined || amount === null || amount === '') {
        return 0n;
    }
    const exp = Number(exponent);
    if (!Number.isInteger(exp) || exp < 0 || exp > 4) {
        throw new Error(`INVALID_CURRENCY_EXPONENT: ${exponent}`);
    }

    const str = String(amount).trim();
    if (!/^-?\d+(\.\d+)?$/.test(str)) {
        throw new Error(`INVALID_AMOUNT_FORMAT: ${amount}`);
    }

    const isNegative = str.startsWith('-');
    const cleanStr = isNegative ? str.slice(1) : str;
    const [intPart, fracPart = ''] = cleanStr.split('.');

    const paddedFrac = fracPart.padEnd(exp, '0');
    const effectiveFrac = paddedFrac.slice(0, exp);
    const roundingDigit = paddedFrac[exp] ? Number(paddedFrac[exp]) : 0;

    let minor = BigInt(intPart + effectiveFrac);
    if (roundingDigit >= 5) {
        minor += 1n;
    }

    return isNegative ? -minor : minor;
}

/**
 * Convertit des unités mineures entières (BigInt/String) vers une chaîne décimale formatée
 *
 * @param {bigint|string|number} minorUnits
 * @param {number} exponent
 * @returns {string}
 */
function fromMinorUnits(minorUnits, exponent = 0) {
    const exp = Number(exponent);
    const val = BigInt(minorUnits || 0);
    if (exp === 0) {
        return val.toString();
    }

    const isNegative = val < 0n;
    const absVal = isNegative ? -val : val;
    const absStr = absVal.toString().padStart(exp + 1, '0');
    const intPart = absStr.slice(0, -exp);
    const fracPart = absStr.slice(-exp);

    return `${isNegative ? '-' : ''}${intPart}.${fracPart}`;
}

/**
 * Calcule la commission en unités mineures avec arrondi commercial demi-supérieur (half-up)
 * Arithmétique purement entière sur BigInt, sans perte de précision flottante.
 *
 * Formule : FLOOR((netEligibleMinor * rateBasisPoints + 5000) / 10000)
 *
 * @param {bigint|number|string} netEligibleMinor
 * @param {bigint|number|string} rateBasisPoints (ex: 2000 pour 20.00%)
 * @returns {bigint}
 */
function computeCommissionMinor(netEligibleMinor, rateBasisPoints) {
    const net = BigInt(netEligibleMinor || 0);
    const bps = BigInt(rateBasisPoints || 0);

    if (net <= 0n || bps <= 0n) {
        return 0n;
    }

    const numerator = (net * bps) + 5000n;
    return numerator / 10000n;
}

/**
 * Calcule le montant net éligible à la commission
 * net = payable_minor - fee_minor - tax_minor
 * Les remises sont déjà déduites dans payable_minor.
 *
 * @param {bigint|number|string} payableMinor
 * @param {bigint|number|string} feeMinor
 * @param {bigint|number|string} taxMinor
 * @returns {bigint}
 */
function calculateNetEligibleMinor(payableMinor, feeMinor = 0, taxMinor = 0) {
    const payable = BigInt(payableMinor || 0);
    const fee = BigInt(feeMinor || 0);
    const tax = BigInt(taxMinor || 0);

    const net = payable - fee - tax;
    return net > 0n ? net : 0n;
}

/**
/**
 * Récupère les soldes d'un ambassadeur dans toutes les devises (whitelist stricte)
 *
 * @param {string} affiliateId
 * @returns {Promise<Array>}
 */
async function getAffiliateBalances(affiliateId) {
    const { data, error } = await supabase
        .from('affiliate_balances')
        .select('currency, pending_balance_minor, available_balance_minor, reserved_balance_minor, debt_balance_minor, updated_at')
        .eq('affiliate_id', affiliateId);

    if (error) throw error;
    return data || [];
}

/**
 * Récupère l'historique du grand livre financier d'un ambassadeur (whitelist stricte sans secrets)
 *
 * @param {string} affiliateId
 * @param {Object} options
 * @returns {Promise<Array>}
 */
async function getAffiliateLedger(affiliateId, { limit = 50, offset = 0 } = {}) {
    const { data, error } = await supabase
        .from('affiliate_ledger')
        .select('id, currency, entry_type, amount_minor, maturation_at, created_at')
        .eq('affiliate_id', affiliateId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;
    return data || [];
}

/**
 * Récupère les demandes de retrait d'un ambassadeur (whitelist stricte sans détails non chiffrés)
 *
 * @param {string} affiliateId
 * @returns {Promise<Array>}
 */
async function getAffiliateWithdrawals(affiliateId, { limit = 20 } = {}) {
    const { data, error } = await supabase
        .from('affiliate_withdrawals')
        .select('id, currency, amount_minor, fee_minor, net_amount_minor, payout_channel, status, created_at, updated_at')
        .eq('affiliate_id', affiliateId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

/**
 * Demande de retrait atomique (Désactivée en Lot 6B : chiffrement des détails de paiement réservé au Lot 6E)
 */
async function requestWithdrawal() {
    throw new Error('WITHDRAWAL_CHANNEL_ENCRYPTION_PENDING_LOT6E: Le chiffrement des coordonnées bancaires et mobiles sera déployé au Lot 6E.');
}

/**
 * Traitement administratif d'un retrait via RPC
 */
async function processWithdrawalAdmin({ withdrawalId, action, actorId, reason = null, providerRef = null }) {
    const { data, error } = await supabase.rpc('admin_process_affiliate_withdrawal_atomic', {
        p_withdrawal_id: withdrawalId,
        p_action: action,
        p_actor_id: actorId,
        p_reason: reason,
        p_provider_ref: providerRef
    });

    if (error) throw error;
    return data;
}

/**
 * Réconciliation administrative d'une commission via RPC
 */
async function reconcileCommissionAdmin({ intentId, certifiedPaymentAt, fedapayFee = 0, taxAmount = 0, adminActorId }) {
    const { data, error } = await supabase.rpc('admin_reconcile_affiliate_commission_atomic', {
        p_intent_id: intentId,
        p_certified_payment_at: certifiedPaymentAt,
        p_fedapay_fee: fedapayFee,
        p_tax_amount: taxAmount,
        p_admin_actor_id: adminActorId
    });

    if (error) throw error;
    return data;
}

/**
 * Libération des commissions échues via RPC
 */
async function releaseMaturedCommissions(batchLimit = 100) {
    const { data, error } = await supabase.rpc('release_matured_commissions_atomic', {
        p_batch_limit: batchLimit
    });

    if (error) throw error;
    return data;
}

/**
 * Ajustement administratif via RPC
 */
async function createAdjustmentAdmin({ affiliateId, currency, amountMinor, adjustmentRef, direction, actorId, reason }) {
    const { data, error } = await supabase.rpc('admin_create_affiliate_adjustment_atomic', {
        p_affiliate_id: affiliateId,
        p_currency: currency,
        p_amount_minor: amountMinor.toString(),
        p_adjustment_ref: adjustmentRef,
        p_direction: direction,
        p_actor_id: actorId,
        p_reason: reason
    });

    if (error) throw error;
    return data;
}

module.exports = {
    toMinorUnits,
    fromMinorUnits,
    computeCommissionMinor,
    calculateNetEligibleMinor,
    getAffiliateBalances,
    getAffiliateLedger,
    getAffiliateWithdrawals,
    requestWithdrawal,
    processWithdrawalAdmin,
    reconcileCommissionAdmin,
    releaseMaturedCommissions,
    createAdjustmentAdmin
};
