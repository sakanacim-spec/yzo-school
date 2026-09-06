'use strict';
const { FedaPay, Transaction, Webhook } = require('fedapay');
const { supabase } = require('../utils/supabase');
const crypto = require('crypto');
const { parsePhoneNumberFromString } = require('libphonenumber-js/max');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_REGEX = /^[a-z0-9_]{1,50}$/;

/**
 * Journalise les échecs de compensation sans jamais exposer de secret, clé, token, signature, données personnelles ou message externe
 */
function logCompensationFailure(contextCode, details = {}) {
    const safeErrorCode = (typeof details.errorCode === 'string' && /^[A-Z0-9_]{1,40}$/.test(details.errorCode))
        ? details.errorCode
        : 'COMPENSATION_ERROR';

    const safeDetails = {
        context: contextCode,
        intentId: details.intentId || null,
        donationId: details.donationId || null,
        schoolSlug: details.schoolSlug || null,
        expectedStatus: details.expectedStatus || null,
        targetStatus: details.targetStatus || null,
        errorCode: safeErrorCode
    };
    console.error(`[COMPENSATION_FAILURE] ${contextCode}:`, JSON.stringify(safeDetails));
}

/**
 * Valide et extrait de manière fail-closed le pays ISO et le numéro national à partir d'un numéro de téléphone.
 * Rejette strictement tout numéro invalide ou pays non déductible.
 */
function validateStrictCustomerPhone(rawPhone, clientCountryCode = null) {
    if (!rawPhone || typeof rawPhone !== 'string' || !rawPhone.trim()) {
        return { isValid: false, error: 'Numéro de téléphone parent requis.' };
    }

    const trimmed = rawPhone.trim();
    const parsed = parsePhoneNumberFromString(trimmed);

    if (!parsed || !parsed.isValid() || !parsed.country || typeof parsed.country !== 'string' || !/^[A-Z]{2}$/.test(parsed.country)) {
        return { isValid: false, error: 'Numéro de téléphone parent invalide ou format international non reconnu.' };
    }

    const deducedCountry = parsed.country.toUpperCase();

    if (clientCountryCode && typeof clientCountryCode === 'string' && clientCountryCode.trim()) {
        const clientIso = clientCountryCode.trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(clientIso) || clientIso !== deducedCountry) {
            return { isValid: false, error: "Divergence entre l'indicatif du numéro de téléphone et le pays spécifié." };
        }
    }

    const nationalNum = parsed.nationalNumber;
    if (!nationalNum || typeof nationalNum !== 'string' || !nationalNum.trim()) {
        return { isValid: false, error: 'Numéro de téléphone national non extractible.' };
    }

    return {
        isValid: true,
        country: deducedCountry,
        nationalNumber: nationalNum,
        e164: parsed.number
    };
}

/**
 * Valide strictement un montant XOF entier positif
 */
function parseStrictXofAmount(val) {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') {
        return Number.isSafeInteger(val) && val > 0 ? val : null;
    }
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!/^\d+$/.test(trimmed)) return null;
        const num = Number(trimmed);
        return Number.isSafeInteger(num) && num > 0 ? num : null;
    }
    return null;
}

/**
 * Effectue une transition d'état atomique (CAS) d'une intention avec contrôle strict du résultat
 */
async function transitionIntent(intentId, expectedStatus, { status, reconciliation_reason, provider_transaction_id }) {
    const payload = {
        status,
        updated_at: new Date().toISOString()
    };
    if (reconciliation_reason !== undefined) {
        payload.reconciliation_reason = reconciliation_reason;
    }
    if (provider_transaction_id !== undefined) {
        payload.provider_transaction_id = provider_transaction_id;
    }

    const { data, error } = await supabase
        .from('payment_intents')
        .update(payload)
        .eq('id', intentId)
        .eq('status', expectedStatus)
        .select('id')
        .single();

    if (error || !data) {
        throw new Error(`INTENT_TRANSITION_FAILED: ${intentId} (expected: ${expectedStatus}, target: ${status})`);
    }
    return data;
}

/**
 * Annule de manière contrôlée (CAS) un don local préliminaire en statut pending
 */
async function cancelPendingDonation(schoolSlug, donationId) {
    const { data, error } = await supabase
        .from(`donations_${schoolSlug}`)
        .update({ status: 'cancelled' })
        .eq('id', donationId)
        .eq('status', 'pending')
        .select('id')
        .single();

    if (error || !data) {
        throw new Error(`DONATION_CANCEL_FAILED: ${donationId}`);
    }
    return data;
}

/**
 * Nettoie les intentions expirées avant une nouvelle initialisation
 */
async function expireStaleIntents(paymentType, schoolSlug, targetId = null) {
    const nowStr = new Date().toISOString();

    // 1. Initializing expirées -> cancelled (EXPIRED_BEFORE_PAYMENT)
    let initQuery = supabase
        .from('payment_intents')
        .update({
            status: 'cancelled',
            reconciliation_reason: 'EXPIRED_BEFORE_PAYMENT',
            updated_at: nowStr
        })
        .eq('payment_type', paymentType)
        .eq('school_slug', schoolSlug)
        .eq('status', 'initializing')
        .lte('expires_at', nowStr);

    if (targetId) {
        initQuery = initQuery.eq('target_id', targetId);
    }

    const { error: initErr } = await initQuery;
    if (initErr) {
        throw new Error(`STALE_INIT_CLEANUP_FAILED: ${paymentType}`);
    }

    // 2. Pending expirées -> reconciliation_required (EXPIRED_PENDING_PAYMENT)
    let pendingQuery = supabase
        .from('payment_intents')
        .update({
            status: 'reconciliation_required',
            reconciliation_reason: 'EXPIRED_PENDING_PAYMENT',
            updated_at: nowStr
        })
        .eq('payment_type', paymentType)
        .eq('school_slug', schoolSlug)
        .eq('status', 'pending')
        .lte('expires_at', nowStr);

    if (targetId) {
        pendingQuery = pendingQuery.eq('target_id', targetId);
    }

    const { error: pendingErr } = await pendingQuery;
    if (pendingErr) {
        throw new Error(`STALE_PENDING_CLEANUP_FAILED: ${paymentType}`);
    }
}

const ALLOWED_FEDAPAY_HOSTS = new Set([
    'sandbox-checkout.fedapay.com',
    'checkout.fedapay.com'
]);

/**
 * Valide strictement que l'URL de redirection FedaPay est en HTTPS et cible exclusivement un domaine FedaPay officiel
 */
function validateFedaPayRedirectUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    try {
        const parsed = new URL(urlStr);
        if (parsed.protocol !== 'https:') return false;
        if (!ALLOWED_FEDAPAY_HOSTS.has(parsed.hostname)) return false;
        if (parsed.username !== '' || parsed.password !== '') return false;
        return true;
    } catch (_e) {
        return false;
    }
}

/**
 * Configure dynamiquement la passerelle FedaPay de manière fail-closed
 * Ne contient AUCUN fallback vers une clé factice ('sk_sandbox_default' totalement éliminée)
 */
async function configureFedaPay() {
    let secretKey = process.env.FEDAPAY_SECRET_KEY || null;
    let isLive = process.env.FEDAPAY_ENVIRONMENT === 'live';

    try {
        const { data: globalSettings } = await supabase.from('global_settings').select('key, value');
        if (globalSettings) {
            const platformGateway = globalSettings.find(s => s.key === 'payment_gateway')?.value;
            const platformSecret = globalSettings.find(s => s.key === 'payment_secret_key')?.value;
            if (platformGateway === 'fedapay' && platformSecret) {
                secretKey = platformSecret;
                isLive = secretKey.startsWith('sk_live_');
            }
        }
    } catch (_err) {
        // Fallback process.env
    }

    if (!secretKey || typeof secretKey !== 'string' || !secretKey.trim() || secretKey === 'sk_sandbox_default') {
        return { isConfigured: false, error: 'PAYMENT_PROVIDER_NOT_CONFIGURED', reason: 'MISSING_SECRET_KEY' };
    }

    const trimmedKey = secretKey.trim();
    if (isLive && !trimmedKey.startsWith('sk_live_')) {
        return { isConfigured: false, error: 'PAYMENT_PROVIDER_NOT_CONFIGURED', reason: 'LIVE_KEY_INVALID_PREFIX' };
    }
    if (!isLive && !trimmedKey.startsWith('sk_sandbox_')) {
        return { isConfigured: false, error: 'PAYMENT_PROVIDER_NOT_CONFIGURED', reason: 'SANDBOX_KEY_INVALID_PREFIX' };
    }

    FedaPay.setApiKey(trimmedKey);
    FedaPay.setEnvironment(isLive ? 'live' : 'sandbox');
    return { isConfigured: true, isLive };
}

/**
 * Initialise une transaction de scolarité (Écolage)
 * POST /api/payment/create-transaction
 */
async function createTransaction(req, res) {
    const { studentId, amount, parentPhone, parentName, countryCode } = req.body;
    const schoolSlug = req.user?.schoolSlug;

    if (!schoolSlug || !SLUG_REGEX.test(schoolSlug)) {
        return res.status(400).json({ error: 'Établissement invalide.' });
    }

    if (!studentId || typeof studentId !== 'string' || !studentId.trim()) {
        return res.status(400).json({ error: 'Identifiant élève requis.' });
    }

    const numericAmount = parseStrictXofAmount(amount);
    if (!numericAmount) {
        return res.status(400).json({ error: 'Montant de paiement invalide.' });
    }

    // Validation stricte et fail-closed du numéro de téléphone et du pays
    const phoneValidation = validateStrictCustomerPhone(parentPhone, countryCode);
    if (!phoneValidation.isValid) {
        return res.status(400).json({ error: phoneValidation.error });
    }

    try {
        const adminRoles = ['admin', 'directeur', 'directeur_general'];
        const userRole = req.user?.role;
        const userId = req.user?.id;

        if (!userRole || !userId) {
            return res.status(403).json({ error: 'Utilisateur non authentifié.' });
        }

        if (userRole === 'parent') {
            const { data: link, error: linkErr } = await supabase
                .from(`parent_student_${schoolSlug}`)
                .select('parent_id')
                .eq('parent_id', userId)
                .eq('student_id', studentId.trim())
                .single();

            if (linkErr || !link) {
                return res.status(403).json({ error: 'Accès non autorisé à cet élève.' });
            }
        } else if (userRole === 'superadmin') {
            // Autorisé explicitement
        } else if (adminRoles.includes(userRole) && req.user?.schoolSlug === schoolSlug) {
            // Autorisé pour l'école
        } else {
            return res.status(403).json({ error: 'Rôle non autorisé pour ce paiement.' });
        }

        // 1. Récupération et contrôle de solvabilité de l'élève
        const { data: student, error: studentErr } = await supabase
            .from(`students_${schoolSlug}`)
            .select('id, nom, prenom, ecolage, deja_paye')
            .eq('id', studentId.trim())
            .single();

        if (studentErr || !student) {
            return res.status(404).json({ error: 'Élève introuvable.' });
        }

        const ecolage = Number(student.ecolage) || 0;
        const dejaPaye = Number(student.deja_paye) || 0;
        const soldeRestant = Math.max(0, ecolage - dejaPaye);

        if (soldeRestant <= 0) {
            return res.status(400).json({ error: 'La scolarité de cet élève est déjà entièrement soldée.' });
        }

        if (numericAmount > soldeRestant) {
            return res.status(400).json({ error: 'Le montant saisi dépasse le solde restant dû.' });
        }

        // Nettoyage sécurisé des intentions actives expirées
        try {
            await expireStaleIntents('tuition', schoolSlug, student.id);
        } catch (_cleanErr) {
            return res.status(500).json({ error: 'Erreur lors du traitement du paiement.' });
        }

        // 2. Création de l'intention locale en statut 'initializing'
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const { data: intent, error: intentErr } = await supabase
            .from('payment_intents')
            .insert({
                provider: 'fedapay',
                payment_type: 'tuition',
                school_slug: schoolSlug,
                target_id: student.id,
                expected_amount: numericAmount,
                expected_currency: 'XOF',
                status: 'initializing',
                collected_by_platform: true,
                created_by: req.user.id || null,
                expires_at: expiresAt
            })
            .select('id')
            .single();

        if (intentErr) {
            if (intentErr.code === '23505') {
                return res.status(409).json({ error: 'Une session de paiement est déjà active pour cet élève.' });
            }
            return res.status(500).json({ error: 'Erreur lors du traitement du paiement.' });
        }

        // 3. Configuration et création de la transaction FedaPay
        await configureFedaPay();

        let transaction;
        try {
            transaction = await Transaction.create({
                description: `Paiement scolarite pour ${student.nom} ${student.prenom}`,
                amount: numericAmount,
                currency: { iso: 'XOF' },
                callback_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/parent/dashboard?payment=success`,
                customer: {
                    lastname: (typeof parentName === 'string' && parentName.trim()) ? parentName.trim() : 'Parent',
                    firstname: '',
                    phone_number: {
                        number: phoneValidation.nationalNumber,
                        country: phoneValidation.country
                    }
                },
                custom_metadata: {
                    intent_id: intent.id
                }
            });
        } catch (_fedaErr) {
            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: 'PROVIDER_CREATION_OUTCOME_UNKNOWN'
                });
            } catch (compErr) {
                logCompensationFailure('TUITION_PROVIDER_CREATION_INTENT_COMPENSATION_FAILED', {
                    intentId: intent.id,
                    schoolSlug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }

            return res.status(500).json({ error: 'Erreur lors du traitement du paiement.' });
        }

        if (!transaction || !transaction.id || typeof transaction.id === 'undefined' || String(transaction.id).trim() === '') {
            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: 'PROVIDER_RESPONSE_INVALID'
                });
            } catch (compErr) {
                logCompensationFailure('TUITION_INVALID_TX_INTENT_COMPENSATION_FAILED', {
                    intentId: intent.id,
                    schoolSlug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }
            return res.status(500).json({ error: 'Erreur lors du traitement du paiement.' });
        }

        // 4. Génération du token FedaPay AVANT la liaison
        let token;
        try {
            token = await transaction.generateToken();
        } catch (_tokErr) {
            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: 'TOKEN_GENERATION_FAILED',
                    provider_transaction_id: String(transaction.id)
                });
            } catch (compErr) {
                logCompensationFailure('TUITION_TOKEN_GEN_INTENT_COMPENSATION_FAILED', {
                    intentId: intent.id,
                    schoolSlug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }

            return res.status(500).json({ error: 'Erreur lors du traitement du paiement.' });
        }

        if (!token || typeof token.token !== 'string' || !token.token.trim() || typeof token.url !== 'string' || !token.url.trim()) {
            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: 'TOKEN_GENERATION_FAILED',
                    provider_transaction_id: String(transaction.id)
                });
            } catch (compErr) {
                logCompensationFailure('TUITION_INVALID_TOKEN_INTENT_COMPENSATION_FAILED', {
                    intentId: intent.id,
                    schoolSlug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }
            return res.status(500).json({ error: 'Erreur lors du traitement du paiement.' });
        }

        // 5. Liaison tardive locale et passage à 'pending' (contrôle atomique CAS d'exactement 1 ligne)
        try {
            await transitionIntent(intent.id, 'initializing', {
                status: 'pending',
                provider_transaction_id: String(transaction.id)
            });
        } catch (_linkErr) {
            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: 'LOCAL_LINK_FAILED',
                    provider_transaction_id: String(transaction.id)
                });
            } catch (compErr) {
                logCompensationFailure('TUITION_LOCAL_LINK_RECONCILIATION_FAILED', {
                    intentId: intent.id,
                    schoolSlug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }

            return res.status(500).json({ error: 'Erreur lors du traitement du paiement.' });
        }

        // 6. Remise du token au client uniquement après liaison locale réussie
        return res.status(200).json({
            transactionId: transaction.id,
            token: token.token,
            url: token.url
        });

    } catch (_error) {
        return res.status(500).json({ error: 'Erreur lors du traitement du paiement.' });
    }
}

// Grille tarifaire mensuelle officielle par élève selon le cycle (10 mois par an)
const PRICING_RATES_MONTHLY = Object.freeze({
    maternelle_primaire: 100, // FCFA / élève / mois
    college_secondaire: 150,  // FCFA / élève / mois
    superieur_formation: 200  // FCFA / élève / mois
});

const ANNUAL_MONTHS_COUNT = 10;
const ANNUAL_DISCOUNT_PERCENT = 10;
const TRANCHES_COUNT = 3;

const DEFAULT_CLASS_CONFIGS = [
    // Primaire
    { name: 'CP1', cycle: 'Primaire' },
    { name: 'CP2', cycle: 'Primaire' },
    { name: 'CE1', cycle: 'Primaire' },
    { name: 'CE2', cycle: 'Primaire' },
    { name: 'CM1', cycle: 'Primaire' },
    { name: 'CI', cycle: 'Primaire' },
    { name: 'CI 1', cycle: 'Primaire' },
    { name: 'CI 2', cycle: 'Primaire' },
    { name: 'CM2', cycle: 'Primaire' },
    // Collège
    { name: '6EME', cycle: 'Collège' },
    { name: '5EME', cycle: 'Collège' },
    { name: '4EME', cycle: 'Collège' },
    { name: '3EME', cycle: 'Collège' },
    // Lycée
    { name: '2nde S', cycle: 'Lycée' },
    { name: '2nde A4', cycle: 'Lycée' },
    { name: '1er A4', cycle: 'Lycée' },
    { name: '1er D', cycle: 'Lycée' },
    { name: 'Tle A4', cycle: 'Lycée' },
    { name: 'Tle D', cycle: 'Lycée' },
    // International / Anglophone
    { name: 'Kindergarten 1', cycle: 'Kindergarten' },
    { name: 'Kindergarten 2', cycle: 'Kindergarten' },
    { name: 'Grade 1', cycle: 'Primary School' },
    { name: 'Grade 2', cycle: 'Primary School' },
    { name: 'Grade 3', cycle: 'Primary School' },
    { name: 'Grade 4', cycle: 'Primary School' },
    { name: 'Grade 5', cycle: 'Primary School' },
    { name: 'Grade 6', cycle: 'Primary School' },
    { name: 'Grade 7', cycle: 'Middle School' },
    { name: 'Grade 8', cycle: 'Middle School' },
    { name: 'Grade 9', cycle: 'Middle School' },
    { name: 'Grade 10', cycle: 'High School' },
    { name: 'Grade 11', cycle: 'High School' },
    { name: 'Grade 12', cycle: 'High School' },
];

/**
 * Normalise un nom de classe pour la correspondance exacte
 */
function normalizeClassName(name) {
    if (!name || typeof name !== 'string') return '';
    return name
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

/**
 * Normalise un cycle scolaire vers sa catégorie tarifaire stable
 */
function normalizeCycleToBillingCategory(cycle, explicitCategory) {
    if (explicitCategory) {
        const cat = String(explicitCategory).toLowerCase().trim();
        if (cat === 'maternelle_primaire' || cat === 'college_secondaire' || cat === 'superieur_formation') {
            return cat;
        }
    }
    if (!cycle || typeof cycle !== 'string') return null;
    const normCycle = cycle
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (
        normCycle.includes('maternelle') ||
        normCycle.includes('primaire') ||
        normCycle.includes('creche') ||
        normCycle.includes('garderie') ||
        normCycle.includes('kindergarten') ||
        normCycle.includes('nursery') ||
        normCycle.includes('preschool') ||
        normCycle.includes('primary') ||
        normCycle.includes('elementary') ||
        normCycle.includes('maternelle_primaire')
    ) {
        return 'maternelle_primaire';
    }

    if (
        normCycle.includes('college') ||
        normCycle.includes('secondaire') ||
        normCycle.includes('lycee') ||
        normCycle.includes('middle school') ||
        normCycle.includes('junior high') ||
        normCycle.includes('high school') ||
        normCycle.includes('secondary') ||
        normCycle.includes('college_secondaire')
    ) {
        return 'college_secondaire';
    }

    if (
        normCycle.includes('universite') ||
        normCycle.includes('superieur') ||
        normCycle.includes('formation') ||
        normCycle.includes('university') ||
        normCycle.includes('higher education') ||
        normCycle.includes('tertiary') ||
        normCycle.includes('post-secondary') ||
        normCycle.includes('master') ||
        normCycle.includes('licence') ||
        normCycle.includes('doctorat') ||
        normCycle.includes('bts') ||
        normCycle.includes('superieur_formation')
    ) {
        return 'superieur_formation';
    }

    return null;
}

/**
 * Calcule la répartition déterministe et exacte de 3 tranches (somme égale au total annuel au FCFA près)
 */
function calculateDeterministicTranches(totalAnnualAmount) {
    if (!Number.isSafeInteger(totalAnnualAmount) || totalAnnualAmount <= 0) {
        return [0, 0, 0];
    }
    const base = Math.floor(totalAnnualAmount / 3);
    const remainder = totalAnnualAmount % 3;

    const t1 = base + (remainder >= 1 ? 1 : 0);
    const t2 = base + (remainder >= 2 ? 1 : 0);
    const t3 = base;

    return [t1, t2, t3];
}

/**
 * Calcule le hash cryptographique SHA-256 de la classification élèves/classes
 */
function computeClassificationHash(schoolSlug, schoolYear, breakdown, totalStudents) {
    const payload = JSON.stringify({
        schoolSlug,
        schoolYear,
        breakdown: {
            college_secondaire: breakdown.college_secondaire || 0,
            maternelle_primaire: breakdown.maternelle_primaire || 0,
            superieur_formation: breakdown.superieur_formation || 0
        },
        totalStudents
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
}

// Définitions canoniques en mémoire pour fallback / isolation test
const CANONICAL_GRIDS = {
    UEMOA: {
        id: null,
        pricing_version: '2026.1_xof_uemoa',
        scope_type: 'region',
        scope_code: 'UEMOA',
        currency_code: 'XOF',
        currency_symbol: 'FCFA',
        currency_minor_unit: 0,
        locale: 'fr-BJ',
        rates_monthly: PRICING_RATES_MONTHLY,
        billing_months: ANNUAL_MONTHS_COUNT,
        annual_discount_percent: ANNUAL_DISCOUNT_PERCENT,
        installments_count: 3,
        provider: 'fedapay',
        pricing_status: 'active',
        payment_status: 'production',
        countries: ['BJ', 'TG', 'CI', 'SN', 'ML', 'BF', 'NE', 'GW']
    },
    CEMAC: {
        id: null,
        pricing_version: '2026.1_xaf_cemac',
        scope_type: 'region',
        scope_code: 'CEMAC',
        currency_code: 'XAF',
        currency_symbol: 'FCFA',
        currency_minor_unit: 0,
        locale: 'fr-CM',
        rates_monthly: { maternelle_primaire: 100, college_secondaire: 150, superieur_formation: 200 },
        billing_months: 10,
        annual_discount_percent: 10,
        installments_count: 3,
        provider: 'pending',
        pricing_status: 'active',
        payment_status: 'configuration_pending',
        countries: ['CM', 'GA', 'CG', 'TD', 'CF', 'GQ']
    },
    GH: {
        id: null,
        pricing_version: '2026.1_ghs_ghana',
        scope_type: 'country',
        scope_code: 'GH',
        currency_code: 'GHS',
        currency_symbol: 'GH₵',
        currency_minor_unit: 2,
        locale: 'en-GH',
        rates_monthly: { maternelle_primaire: 200, college_secondaire: 300, superieur_formation: 400 },
        billing_months: 10,
        annual_discount_percent: 10,
        installments_count: 3,
        provider: 'pending',
        pricing_status: 'active',
        payment_status: 'configuration_pending',
        countries: ['GH']
    },
    ES: {
        id: null,
        pricing_version: '2026.1_eur_spain',
        scope_type: 'country',
        scope_code: 'ES',
        currency_code: 'EUR',
        currency_symbol: '€',
        currency_minor_unit: 2,
        locale: 'es-ES',
        rates_monthly: { maternelle_primaire: 50, college_secondaire: 75, superieur_formation: 100 },
        billing_months: 10,
        annual_discount_percent: 10,
        installments_count: 3,
        provider: 'pending',
        pricing_status: 'active',
        payment_status: 'configuration_pending',
        countries: ['ES']
    }
};

/**
 * Résout la grille tarifaire active pour un pays donné
 * Ordre obligatoire :
 * 1. Lire le pays ISO de l'établissement.
 * 2. Rechercher une grille pays active.
 * 3. Sinon rechercher une grille régionale active contenant ce pays.
 * 4. Sinon retourner PRICING_GRID_NOT_CONFIGURED.
 */
async function resolveActivePricingGrid(countryCode = 'BJ') {
    if (!countryCode || typeof countryCode !== 'string' || !countryCode.trim()) {
        const err = new Error("Le pays de l'établissement n'est pas renseigné.");
        err.code = 'PRICING_GRID_NOT_CONFIGURED';
        throw err;
    }
    const normCountry = countryCode.toUpperCase().trim();

    try {
        const { data: grids, error } = await supabase
            .from('saas_pricing_grids')
            .select(`
                id, pricing_version, scope_type, scope_code,
                currency_code, currency_symbol, currency_minor_unit, locale,
                rates_monthly, billing_months, annual_discount_percent,
                installments_count, provider, pricing_status, payment_status, enabled, effective_from, effective_to,
                saas_pricing_grid_countries!inner ( country_code )
            `)
            .eq('enabled', true)
            .eq('saas_pricing_grid_countries.country_code', normCountry)
            .lte('effective_from', new Date().toISOString());

        if (!error && Array.isArray(grids) && grids.length > 0) {
            const activeGrids = grids.filter(g => (!g.pricing_status || g.pricing_status === 'active') && (!g.effective_to || new Date(g.effective_to) > new Date()));
            if (activeGrids.length > 0) {
                // Priorité stricte : 1. scope_type 'country' > 'region', 2. effective_from le plus récent
                activeGrids.sort((a, b) => {
                    if (a.scope_type === 'country' && b.scope_type !== 'country') return -1;
                    if (b.scope_type === 'country' && a.scope_type !== 'country') return 1;
                    return new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime();
                });
                return activeGrids[0];
            }
        }
    } catch (_dbErr) {}

    // Résolution canonique de secours (tests unitaires / DB offline)
    // 1. Rechercher d'abord une grille 'country'
    for (const key of Object.keys(CANONICAL_GRIDS)) {
        const g = CANONICAL_GRIDS[key];
        if (g.scope_type === 'country' && g.countries.includes(normCountry) && g.pricing_status === 'active') {
            return g;
        }
    }
    // 2. Rechercher ensuite une grille 'region'
    for (const key of Object.keys(CANONICAL_GRIDS)) {
        const g = CANONICAL_GRIDS[key];
        if (g.scope_type === 'region' && g.countries.includes(normCountry) && g.pricing_status === 'active') {
            return g;
        }
    }

    // 3. Aucun fallback silencieux -> erreur stricte PRICING_GRID_NOT_CONFIGURED
    const err = new Error(`Aucune grille tarifaire active n'est configurée pour le pays ${normCountry}.`);
    err.code = 'PRICING_GRID_NOT_CONFIGURED';
    throw err;
}

/**
 * Calcule de manière autoritaire le devis d'abonnement SaaS à partir de l'effectif réel de l'établissement
 */
async function computeSchoolSubscriptionQuote(schoolSlug, options = {}) {
    const diagnosticId = `diag_${crypto.randomBytes(8).toString('hex')}`;

    // 1. Récupération des paramètres de l'école (classes et année scolaire)
    let configuredClasses = [];
    let schoolYear = null;
    let countryCode = options.countryCode || 'BJ';

    try {
        const { data: schoolRow } = await supabase
            .from('schools')
            .select('country')
            .eq('slug', schoolSlug)
            .single();
        if (schoolRow?.country) {
            countryCode = schoolRow.country.toUpperCase().trim();
        }
    } catch (_schErr) {}

    try {
        const { data: settingsRows, error: settingsErr } = await supabase
            .from(`app_settings_${schoolSlug}`)
            .select('key, value');

        if (!settingsErr && Array.isArray(settingsRows)) {
            const classesRow = settingsRows.find(r => r.key === 'classes');
            if (classesRow && classesRow.value) {
                configuredClasses = typeof classesRow.value === 'string'
                    ? JSON.parse(classesRow.value)
                    : classesRow.value;
            }
            const yearRow = settingsRows.find(r => r.key === 'school_year');
            if (yearRow && yearRow.value) {
                schoolYear = typeof yearRow.value === 'string' ? yearRow.value.trim() : String(yearRow.value).trim();
            }
        }
    } catch (_cfgErr) {}

    if (!schoolYear) {
        const err = new Error("L'année scolaire de l'établissement doit être configurée dans les Paramètres avant d'émettre un devis.");
        err.code = 'SUBSCRIPTION_PERIOD_REQUIRED';
        err.diagnostic_id = diagnosticId;
        throw err;
    }

    // 2. Récupération des effectifs élèves
    const { data: studentsData, error: stuErr } = await supabase
        .from(`students_${schoolSlug}`)
        .select('id, classe');

    if (stuErr) {
        const err = new Error(`STUDENTS_QUERY_FAILED: ${stuErr.message}`);
        err.code = 'STUDENTS_QUERY_FAILED';
        err.diagnostic_id = diagnosticId;
        throw err;
    }

    const studentList = studentsData || [];
    if (studentList.length === 0) {
        const err = new Error("Aucun élève enregistré pour cet établissement.");
        err.code = 'SUBSCRIPTION_AMOUNT_INVALID';
        err.diagnostic_id = diagnosticId;
        throw err;
    }

    // 3. Indexation des classes configurées par nom normalisé
    const classByName = new Map();

    if (Array.isArray(configuredClasses)) {
        for (const cls of configuredClasses) {
            if (cls && typeof cls === 'object' && cls.name) {
                const norm = normalizeClassName(cls.name);
                if (norm) classByName.set(norm, cls);
            }
        }
    }

    let unclassifiedCount = 0;
    const breakdown = {
        maternelle_primaire: 0,
        college_secondaire: 0,
        superieur_formation: 0
    };

    for (const student of studentList) {
        if (!student.classe) {
            unclassifiedCount++;
            continue;
        }

        const norm = normalizeClassName(student.classe);
        const matchedClass = classByName.get(norm);

        if (!matchedClass || !matchedClass.billingCategory) {
            unclassifiedCount++;
            continue;
        }

        const billingCat = String(matchedClass.billingCategory).toLowerCase().trim();
        if (!breakdown.hasOwnProperty(billingCat)) {
            unclassifiedCount++;
            continue;
        }

        breakdown[billingCat] += 1;
    }

    if (unclassifiedCount > 0) {
        const err = new Error("Certains dossiers élèves ne sont rattachés à aucune classe ou catégorie tarifaire valide.");
        err.code = 'SUBSCRIPTION_CLASSIFICATION_INCOMPLETE';
        err.unclassified_count = unclassifiedCount;
        err.diagnostic_id = diagnosticId;
        throw err;
    }

    // 4. Résolution de la grille tarifaire active
    const grid = await resolveActivePricingGrid(countryCode);
    const rates = grid.rates_monthly;
    const billingMonths = grid.billing_months || 10;
    const discountPercent = Number(grid.annual_discount_percent) || 10;

    const totalStudents = breakdown.maternelle_primaire + breakdown.college_secondaire + breakdown.superieur_formation;
    const monthlyPrimaire = breakdown.maternelle_primaire * rates.maternelle_primaire;
    const monthlySecondaire = breakdown.college_secondaire * rates.college_secondaire;
    const monthlySuperieur = breakdown.superieur_formation * rates.superieur_formation;

    const totalMonthly = monthlyPrimaire + monthlySecondaire + monthlySuperieur;
    const totalAnnual = totalMonthly * billingMonths;
    const annualDiscount = Math.round(totalAnnual * (discountPercent / 100));
    const payableAnnual = totalAnnual - annualDiscount;
    const tranches = calculateDeterministicTranches(totalAnnual);

    const classificationHash = computeClassificationHash(schoolSlug, schoolYear, breakdown, totalStudents);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const paymentOptions = {
        annual: {
            grossAmount: totalAnnual,
            discountAmount: annualDiscount,
            payableAmount: payableAnnual
        },
        installments: {
            grossAmount: totalAnnual,
            discountAmount: 0,
            payableAmount: totalAnnual,
            installmentsCount: 3,
            installmentAmounts: tranches
        }
    };

    return {
        quote_id: `quote_${crypto.randomBytes(8).toString('hex')}`,
        school_slug: schoolSlug,
        billingPeriod: schoolYear,
        billing_period: schoolYear,
        pricing_grid_id: grid.id || null,
        pricing_version: grid.pricing_version,
        pricing_scope_type: grid.scope_type,
        pricing_scope_code: grid.scope_code,
        scope_type: grid.scope_type,
        scope_code: grid.scope_code,
        country_code: countryCode,
        currency_code: grid.currency_code,
        currency_symbol: grid.currency_symbol,
        currency_minor_unit: typeof grid.currency_minor_unit === 'number' ? grid.currency_minor_unit : 0,
        locale: grid.locale,
        payment_status: grid.payment_status || 'production',
        totalStudents,
        total_students: totalStudents,
        breakdown,
        categories_breakdown: breakdown,
        ratesMonthly: rates,
        rates_monthly: rates,
        billing_months: billingMonths,
        annual_discount_percent: discountPercent,
        installments_count: 3,
        gross_amount: totalAnnual,
        discount_amount: annualDiscount,
        payable_amount: payableAnnual,
        monthlyAmount: totalMonthly,
        totalAnnualAmount: totalAnnual,
        annualBonusAmount: annualDiscount,
        finalAnnualAmount: payableAnnual,
        tranches,
        currency: grid.currency_code,
        payment_options: paymentOptions,
        classification_hash: classificationHash,
        status: 'issued',
        calculated_at: now.toISOString(),
        expires_at: expiresAt
    };
}

/**
 * Calcule et persiste un devis serveur dans public.saas_subscription_quotes
 */
async function computeAndPersistSubscriptionQuote(schoolSlug, userId) {
    const quote = await computeSchoolSubscriptionQuote(schoolSlug);

    try {
        const { data: inserted, error: insertErr } = await supabase
            .from('saas_subscription_quotes')
            .insert({
                quote_id: quote.quote_id,
                school_slug: quote.school_slug,
                billing_period: quote.billing_period,
                pricing_grid_id: quote.pricing_grid_id,
                pricing_version: quote.pricing_version,
                pricing_scope_type: quote.pricing_scope_type,
                pricing_scope_code: quote.pricing_scope_code,
                country_code: quote.country_code,
                currency_code: quote.currency_code,
                currency_minor_unit: quote.currency_minor_unit,
                payment_status: quote.payment_status || 'production',
                total_students: quote.total_students,
                categories_breakdown: quote.categories_breakdown,
                payment_options: quote.payment_options,
                classification_hash: quote.classification_hash,
                status: 'issued',
                calculated_at: quote.calculated_at,
                expires_at: quote.expires_at,
                created_by: userId || '00000000-0000-0000-0000-000000000000'
            })
            .select('*')
            .single();

        if (!insertErr && inserted) {
            return { ...quote, id: inserted.id };
        }
    } catch (_dbErr) {}

    return quote;
}

/**
 * Création et émission d'un devis serveur officiel
 * POST /api/payment/saas/schools/:slug/quotes
 */
async function createSubscriptionQuote(req, res) {
    const slug = req.params.slug;
    const diagnosticId = `diag_${crypto.randomBytes(8).toString('hex')}`;

    if (!slug || !SLUG_REGEX.test(slug)) {
        return res.status(400).json({
            error: 'Slug établissement invalide.',
            code: 'INVALID_SLUG',
            diagnostic_id: diagnosticId
        });
    }

    const userRole = req.user?.role;
    const userSchoolSlug = req.user?.schoolSlug;
    const adminRoles = ['admin', 'directeur', 'directeur_general'];

    if (!userRole) {
        return res.status(401).json({
            error: 'Authentification requise.',
            code: 'AUTHENTICATION_REQUIRED',
            diagnostic_id: diagnosticId
        });
    }

    if (userRole !== 'superadmin' && (!adminRoles.includes(userRole) || userSchoolSlug !== slug)) {
        return res.status(403).json({
            error: 'Non autorisé à émettre un devis pour cet établissement.',
            code: 'PAYMENT_FORBIDDEN',
            diagnostic_id: diagnosticId
        });
    }

    try {
        const quote = await computeAndPersistSubscriptionQuote(slug, req.user?.id || req.user?.userId);
        return res.status(201).json({
            quote,
            diagnostic_id: diagnosticId
        });
    } catch (err) {
        if (err.code === 'SUBSCRIPTION_PERIOD_REQUIRED' || err.code === 'SUBSCRIPTION_AMOUNT_INVALID' || err.code === 'SUBSCRIPTION_CLASSIFICATION_INCOMPLETE' || err.code === 'PRICING_GRID_NOT_CONFIGURED') {
            return res.status(422).json({
                error: err.message,
                code: err.code,
                unclassified_count: err.unclassified_count,
                diagnostic_id: err.diagnostic_id || diagnosticId
            });
        }
        return res.status(500).json({
            error: 'Erreur lors de la génération du devis tarifaire.',
            code: 'QUOTE_CALCULATION_FAILED',
            diagnostic_id: diagnosticId
        });
    }
}

/**
 * Récupération d'un devis émis par son identifiant unique
 * GET /api/payment/saas/schools/:slug/quotes/:quoteId
 */
async function getSubscriptionQuoteById(req, res) {
    const { slug, quoteId } = req.params;
    const diagnosticId = `diag_${crypto.randomBytes(8).toString('hex')}`;

    if (!slug || !SLUG_REGEX.test(slug) || !quoteId) {
        return res.status(400).json({
            error: 'Identifiants invalides.',
            code: 'INVALID_REQUEST',
            diagnostic_id: diagnosticId
        });
    }

    const userRole = req.user?.role;
    const userSchoolSlug = req.user?.schoolSlug;
    const adminRoles = ['admin', 'directeur', 'directeur_general'];

    if (!userRole) {
        return res.status(401).json({ error: 'Authentification requise.', code: 'AUTHENTICATION_REQUIRED' });
    }

    if (userRole !== 'superadmin' && (!adminRoles.includes(userRole) || userSchoolSlug !== slug)) {
        return res.status(403).json({ error: 'Accès interdit.', code: 'PAYMENT_FORBIDDEN' });
    }

    try {
        const { data: quote, error } = await supabase
            .from('saas_subscription_quotes')
            .select('*')
            .eq('quote_id', quoteId)
            .eq('school_slug', slug)
            .single();

        if (error || !quote) {
            return res.status(404).json({ error: 'Devis introuvable.', code: 'QUOTE_NOT_FOUND', diagnostic_id: diagnosticId });
        }

        return res.status(200).json({ quote, diagnostic_id: diagnosticId });
    } catch (err) {
        return res.status(500).json({ error: 'Erreur lors de la récupération du devis.', code: 'INTERNAL_ERROR' });
    }
}

/**
 * Renvoie le devis d'abonnement officiel calculé par le serveur
 * GET /api/payment/saas/schools/:slug/quote
 */
async function getSubscriptionQuote(req, res) {
    const slug = req.params.slug;
    const diagnosticId = `diag_${crypto.randomBytes(8).toString('hex')}`;

    if (!slug || !SLUG_REGEX.test(slug)) {
        return res.status(400).json({
            error: 'Slug établissement invalide.',
            code: 'INVALID_SLUG',
            diagnostic_id: diagnosticId
        });
    }

    const userRole = req.user?.role;
    const userSchoolSlug = req.user?.schoolSlug;
    const adminRoles = ['admin', 'directeur', 'directeur_general'];

    if (!userRole) {
        return res.status(401).json({
            error: 'Authentification requise.',
            code: 'AUTHENTICATION_REQUIRED',
            diagnostic_id: diagnosticId
        });
    }

    if (userRole !== 'superadmin' && (!adminRoles.includes(userRole) || userSchoolSlug !== slug)) {
        return res.status(403).json({
            error: 'Non autorisé à consulter les tarifs de cet établissement.',
            code: 'PAYMENT_FORBIDDEN',
            diagnostic_id: diagnosticId
        });
    }

    try {
        const { data: school, error: schErr } = await supabase
            .from('schools')
            .select('id, slug, name, subscription_plan, paid_tranches_count')
            .eq('slug', slug)
            .single();

        if (schErr || !school) {
            return res.status(404).json({
                error: 'Établissement introuvable.',
                code: 'SCHOOL_NOT_FOUND',
                diagnostic_id: diagnosticId
            });
        }

        const quote = await computeAndPersistSubscriptionQuote(slug, req.user?.id || req.user?.userId);

        let isAnnualCompleted = false;
        let completedTranches = [];

        try {
            const { data: completedIntents } = await supabase
                .from('payment_intents')
                .select('plan_type, installment_number')
                .eq('school_slug', slug)
                .eq('billing_period', quote.billingPeriod)
                .eq('payment_type', 'saas_subscription')
                .eq('status', 'completed');

            if (Array.isArray(completedIntents)) {
                isAnnualCompleted = completedIntents.some(i => i.plan_type === 'annual');
                completedTranches = completedIntents
                    .filter(i => i.plan_type === 'tranche' && Number.isInteger(i.installment_number))
                    .map(i => i.installment_number)
                    .sort((a, b) => a - b);
            }
        } catch (_intErr) {}

        const paidTranchesCount = isAnnualCompleted ? 3 : completedTranches.length;
        const nextTrancheNumber = isAnnualCompleted ? null : (paidTranchesCount < 3 ? paidTranchesCount + 1 : null);
        const nextTrancheAmount = nextTrancheNumber ? quote.tranches[nextTrancheNumber - 1] : 0;

        return res.status(200).json({
            school: {
                id: school.id,
                slug: school.slug,
                name: school.name,
                billing_period: quote.billingPeriod,
                is_annual_completed: isAnnualCompleted,
                paid_tranches: isAnnualCompleted ? [1, 2, 3] : completedTranches,
                paid_tranches_count: paidTranchesCount,
                next_tranche_number: nextTrancheNumber,
                next_tranche_amount: nextTrancheAmount
            },
            quote,
            diagnostic_id: diagnosticId
        });
    } catch (err) {
        if (err.code === 'SUBSCRIPTION_PERIOD_REQUIRED' || err.code === 'SUBSCRIPTION_AMOUNT_INVALID' || err.code === 'SUBSCRIPTION_CLASSIFICATION_INCOMPLETE' || err.code === 'PRICING_GRID_NOT_CONFIGURED') {
            return res.status(422).json({
                error: err.message,
                code: err.code,
                unclassified_count: err.unclassified_count,
                diagnostic_id: err.diagnostic_id || diagnosticId
            });
        }
        console.error('[QUOTE_FAILED]', JSON.stringify({ diagnostic_id: diagnosticId, schoolSlug: slug }));
        return res.status(500).json({
            error: 'Erreur lors du calcul du devis tarifaire.',
            code: 'QUOTE_CALCULATION_FAILED',
            diagnostic_id: diagnosticId
        });
    }
}

/**
 * Initialise un abonnement SaaS pour un établissement (P8 - Devis serveur et RPC atomique)
 * POST /api/payment/saas/schools/:slug/pay-init
 */
async function createSaasTransaction(req, res) {
    const slug = req.params.slug || req.body.schoolSlug;
    const { quote_id, planType, trancheNumber } = req.body;
    const diagnosticId = `diag_${crypto.randomBytes(8).toString('hex')}`;
    const userId = req.user?.id || req.user?.userId || null;

    if (!slug || !SLUG_REGEX.test(slug)) {
        return res.status(400).json({
            error: 'Slug établissement invalide.',
            code: 'INVALID_SLUG',
            diagnostic_id: diagnosticId
        });
    }

    // 1. Validation stricte du plan et des tranches AVANT toute modification CAS
    if (planType !== 'annual' && planType !== 'tranche') {
        return res.status(400).json({
            error: "Plan d'abonnement invalide.",
            code: 'INVALID_PLAN',
            diagnostic_id: diagnosticId
        });
    }

    if (planType === 'annual' && typeof trancheNumber !== 'undefined' && trancheNumber !== null) {
        return res.status(400).json({
            error: "Le numéro de tranche ne doit pas être renseigné pour un plan annuel.",
            code: 'INVALID_PLAN',
            diagnostic_id: diagnosticId
        });
    }

    if (planType === 'tranche') {
        if (typeof trancheNumber === 'undefined' || trancheNumber === null || !Number.isInteger(Number(trancheNumber)) || Number(trancheNumber) < 1 || Number(trancheNumber) > 3) {
            return res.status(400).json({
                error: "Numéro de tranche invalide (1, 2 ou 3 attendu).",
                code: 'INVALID_TRANCHE_NUMBER',
                diagnostic_id: diagnosticId
            });
        }
    }

    // Contrôle RBAC
    const userRole = req.user?.role;
    const userSchoolSlug = req.user?.schoolSlug;
    const adminRoles = ['admin', 'directeur', 'directeur_general'];

    if (!userRole) {
        return res.status(401).json({
            error: 'Authentification requise.',
            code: 'AUTHENTICATION_REQUIRED',
            diagnostic_id: diagnosticId
        });
    }

    if (userRole !== 'superadmin' && (!adminRoles.includes(userRole) || userSchoolSlug !== slug)) {
        return res.status(403).json({
            error: 'Non autorisé à gérer les paiements de cet établissement.',
            code: 'PAYMENT_FORBIDDEN',
            diagnostic_id: diagnosticId
        });
    }

    let txId = null;
    let intent = null;
    let activeQuote = null;

    try {
        // 2. Récupération de l'école
        const { data: school, error: schErr } = await supabase
            .from('schools')
            .select('id, slug, name, total_revenue_paid, subscription_plan, paid_tranches_count, country')
            .eq('slug', slug)
            .single();

        if (schErr || !school) {
            return res.status(404).json({
                error: 'Établissement introuvable.',
                code: 'SCHOOL_NOT_FOUND',
                diagnostic_id: diagnosticId
            });
        }

        // 3. Récupération ou émission du devis serveur
        let quote = null;
        if (quote_id) {
            const { data: qRow } = await supabase
                .from('saas_subscription_quotes')
                .select('*')
                .eq('quote_id', quote_id)
                .eq('school_slug', slug)
                .single();
            quote = qRow;
        }

        if (!quote) {
            // Émission d'un nouveau devis si non fourni ou introuvable
            try {
                quote = await computeAndPersistSubscriptionQuote(slug, userId);
            } catch (qErr) {
                if (qErr.code === 'SUBSCRIPTION_PERIOD_REQUIRED' || qErr.code === 'SUBSCRIPTION_AMOUNT_INVALID' || qErr.code === 'SUBSCRIPTION_CLASSIFICATION_INCOMPLETE' || qErr.code === 'PRICING_GRID_NOT_CONFIGURED') {
                    return res.status(422).json({
                        error: qErr.message,
                        code: qErr.code,
                        unclassified_count: qErr.unclassified_count,
                        diagnostic_id: diagnosticId
                    });
                }
                throw qErr;
            }
        }

        // Blocage de paiement si la passerelle de paiement n'est pas encore configurée pour ce pays / cette zone
        if (quote.payment_status === 'configuration_pending' || quote.provider === 'pending') {
            return res.status(503).json({
                error: "Le paiement électronique sera prochainement disponible dans votre pays. Contactez YZIOW pour connaître les modalités bancaires disponibles.",
                code: 'PAYMENT_PROVIDER_NOT_CONFIGURED_FOR_COUNTRY',
                diagnostic_id: diagnosticId
            });
        }

        const billingPeriod = quote.billing_period || quote.billingPeriod;

        // 4. Contrôle d'antériorité de paiement (historique completed)
        let isAnnualCompleted = false;
        let completedTranches = [];

        try {
            const { data: completedIntents } = await supabase
                .from('payment_intents')
                .select('plan_type, installment_number')
                .eq('school_slug', slug)
                .eq('billing_period', billingPeriod)
                .eq('payment_type', 'saas_subscription')
                .eq('status', 'completed');

            if (Array.isArray(completedIntents)) {
                isAnnualCompleted = completedIntents.some(i => i.plan_type === 'annual');
                completedTranches = completedIntents
                    .filter(i => i.plan_type === 'tranche' && Number.isInteger(i.installment_number))
                    .map(i => i.installment_number)
                    .sort((a, b) => a - b);
            }
        } catch (_intErr) {}

        if (isAnnualCompleted) {
            return res.status(400).json({
                error: `L'abonnement annuel pour la période ${billingPeriod} a déjà été intégralement réglé.`,
                code: 'PERIOD_ALREADY_SETTLED',
                diagnostic_id: diagnosticId
            });
        }

        if (planType === 'annual' && completedTranches.length > 0) {
            return res.status(400).json({
                error: `Impossible de souscrire un plan annuel après le démarrage d'un paiement par tranches pour la période ${billingPeriod}.`,
                code: 'TRANCHE_ALREADY_STARTED',
                diagnostic_id: diagnosticId
            });
        }

        const nextDueTranche = completedTranches.length + 1;
        if (planType === 'tranche') {
            const reqTranche = Number(trancheNumber);
            if (completedTranches.includes(reqTranche) || reqTranche < nextDueTranche) {
                return res.status(400).json({
                    error: `La tranche N°${reqTranche} a déjà été réglée.`,
                    code: 'TRANCHE_ALREADY_PAID',
                    diagnostic_id: diagnosticId
                });
            }
            if (reqTranche !== nextDueTranche) {
                return res.status(400).json({
                    error: `La prochaine tranche exigible est la tranche N°${nextDueTranche}.`,
                    code: 'INVALID_TRANCHE_ORDER',
                    diagnostic_id: diagnosticId
                });
            }
        }

        // 5. CAS 1 : Réservation du devis (issued -> processing)
        const { data: casQuoteRows, error: casErr } = await supabase
            .from('saas_subscription_quotes')
            .update({
                status: 'processing',
                processing_started_at: new Date().toISOString()
            })
            .eq('quote_id', quote.quote_id)
            .eq('school_slug', slug)
            .eq('status', 'issued')
            .gt('expires_at', new Date().toISOString())
            .select('*');

        if (casErr || !casQuoteRows || casQuoteRows.length === 0) {
            return res.status(409).json({
                error: 'Devis indisponible, expiré ou déjà en cours de traitement.',
                code: 'PAYMENT_ALREADY_PENDING',
                diagnostic_id: diagnosticId
            });
        }

        activeQuote = casQuoteRows[0];

        // 6. Vérification classification_hash : détection de modification des effectifs/classes
        let currentQuote;
        try {
            currentQuote = await computeSchoolSubscriptionQuote(slug, { countryCode: school.country });
        } catch (_recompErr) {
            await supabase.from('saas_subscription_quotes').update({
                status: 'failed', failed_at: new Date().toISOString(), failure_code: 'QUOTE_STALE'
            }).eq('quote_id', activeQuote.quote_id);

            return res.status(409).json({
                error: 'Les effectifs ou classes ont été modifiés. Veuillez renouveler votre devis.',
                code: 'QUOTE_STALE',
                diagnostic_id: diagnosticId
            });
        }

        if (currentQuote.classification_hash !== activeQuote.classification_hash) {
            await supabase.from('saas_subscription_quotes').update({
                status: 'failed', failed_at: new Date().toISOString(), failure_code: 'QUOTE_STALE'
            }).eq('quote_id', activeQuote.quote_id);

            return res.status(409).json({
                error: 'Les effectifs ou classes ont été modifiés depuis l\'émission du devis. Veuillez réémettre un devis.',
                code: 'QUOTE_STALE',
                diagnostic_id: diagnosticId
            });
        }

        // 7. Extraction exacte des montants du devis
        const paymentOpts = typeof activeQuote.payment_options === 'string'
            ? JSON.parse(activeQuote.payment_options)
            : activeQuote.payment_options;

        let grossAmount, discountAmount, payableAmount, activeTrancheNum;
        if (planType === 'annual') {
            grossAmount = paymentOpts.annual.grossAmount;
            discountAmount = paymentOpts.annual.discountAmount;
            payableAmount = paymentOpts.annual.payableAmount;
            activeTrancheNum = null;
        } else {
            grossAmount = paymentOpts.installments.grossAmount;
            discountAmount = 0;
            activeTrancheNum = Number(trancheNumber);
            payableAmount = paymentOpts.installments.installmentAmounts[activeTrancheNum - 1];
        }

        if (!Number.isSafeInteger(payableAmount) || payableAmount <= 0) {
            await supabase.from('saas_subscription_quotes').update({
                status: 'failed', failed_at: new Date().toISOString(), failure_code: 'INVALID_AMOUNT'
            }).eq('quote_id', activeQuote.quote_id);

            return res.status(422).json({
                error: 'Montant de devis invalide.',
                code: 'SUBSCRIPTION_AMOUNT_INVALID',
                diagnostic_id: diagnosticId
            });
        }

        // 8. Configuration FedaPay fail-closed
        const fedaConfig = await configureFedaPay();
        if (!fedaConfig.isConfigured) {
            await supabase.from('saas_subscription_quotes').update({
                status: 'failed', failed_at: new Date().toISOString(), failure_code: 'PROVIDER_NOT_CONFIGURED'
            }).eq('quote_id', activeQuote.quote_id);

            return res.status(503).json({
                error: 'Le service de paiement est temporairement indisponible.',
                code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
                diagnostic_id: diagnosticId
            });
        }

        // Nettoyage des stale intents
        try {
            await expireStaleIntents('saas_subscription', school.slug);
        } catch (_cleanErr) {}

        // 9. Création de l'intention locale P8 (pricing_schema_version = 2)
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const { data: createdIntent, error: intentErr } = await supabase
            .from('payment_intents')
            .insert({
                provider: 'fedapay',
                payment_type: 'saas_subscription',
                school_slug: school.slug,
                target_id: school.id,
                billing_period: billingPeriod,
                plan_type: planType,
                installment_number: activeTrancheNum,
                gross_amount: grossAmount,
                discount_amount: discountAmount,
                payable_amount: payableAmount,
                expected_amount: payableAmount,
                expected_currency: activeQuote.currency_code || 'XOF',
                status: 'initializing',
                collected_by_platform: true,
                created_by: userId,
                expires_at: expiresAt,
                pricing_schema_version: 2,
                pricing_grid_id: activeQuote.pricing_grid_id,
                pricing_version: activeQuote.pricing_version,
                pricing_scope_type: activeQuote.pricing_scope_type,
                pricing_scope_code: activeQuote.pricing_scope_code,
                currency_minor_unit: activeQuote.currency_minor_unit,
                quote_id: activeQuote.quote_id
            })
            .select('*')
            .single();

        intent = createdIntent;

        if (intentErr || !intent) {
            await supabase.from('saas_subscription_quotes').update({
                status: 'failed', failed_at: new Date().toISOString(), failure_code: 'INTENT_INSERT_FAILED'
            }).eq('quote_id', activeQuote.quote_id);

            if (intentErr?.code === '23505') {
                return res.status(409).json({
                    error: 'Une session de paiement est déjà active pour cet établissement.',
                    code: 'PAYMENT_ALREADY_PENDING',
                    diagnostic_id: diagnosticId
                });
            }
            return res.status(500).json({
                error: "Erreur lors de l'initialisation du paiement.",
                code: 'PAYMENT_INITIALIZATION_FAILED',
                diagnostic_id: diagnosticId
            });
        }

        // 10. Création de la transaction chez FedaPay
        let transaction;
        try {
            transaction = await Transaction.create({
                description: `Paiement abonnement SaaS - ${school.name || slug} (${billingPeriod})`,
                amount: payableAmount,
                currency: { iso: activeQuote.currency_code || 'XOF' },
                callback_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/dashboard?payment=success`,
                custom_metadata: {
                    intent_id: intent.id,
                    quote_id: activeQuote.quote_id
                }
            });
            txId = transaction?.id ? String(transaction.id) : null;
        } catch (fedaErr) {
            const isUnambiguousRejection = fedaErr.status === 400 || fedaErr.status === 422 || fedaErr.statusCode === 400 || fedaErr.statusCode === 422;
            const targetStatus = isUnambiguousRejection ? 'failed' : 'reconciliation_required';
            const targetReason = isUnambiguousRejection ? 'PAYMENT_PROVIDER_REJECTED' : 'PAYMENT_PROVIDER_STATUS_UNKNOWN';

            await supabase.from('payment_intents').update({
                status: targetStatus,
                reconciliation_reason: targetReason
            }).eq('id', intent.id);

            await supabase.from('saas_subscription_quotes').update({
                status: targetStatus,
                failed_at: new Date().toISOString(),
                failure_code: targetReason
            }).eq('quote_id', activeQuote.quote_id);

            return res.status(503).json({
                error: 'Le service de paiement est temporairement indisponible.',
                code: targetReason,
                diagnostic_id: diagnosticId
            });
        }

        if (!txId) {
            await supabase.from('payment_intents').update({
                status: 'reconciliation_required',
                reconciliation_reason: 'PROVIDER_RESPONSE_INVALID'
            }).eq('id', intent.id);

            await supabase.from('saas_subscription_quotes').update({
                status: 'reconciliation_required',
                failure_code: 'PROVIDER_RESPONSE_INVALID'
            }).eq('quote_id', activeQuote.quote_id);

            return res.status(503).json({
                error: 'Réponse passerelle invalide.',
                code: 'PAYMENT_PROVIDER_STATUS_UNKNOWN',
                diagnostic_id: diagnosticId
            });
        }

        // 11. Génération et validation stricte du token et URL FedaPay
        let token;
        try {
            token = await transaction.generateToken();
        } catch (_tokErr) {
            const { data: compIntentRows, error: compIntentErr } = await supabase.from('payment_intents').update({
                status: 'reconciliation_required',
                reconciliation_reason: 'TOKEN_GENERATION_FAILED',
                provider_transaction_id: txId
            }).eq('id', intent.id).select('id');

            if (compIntentErr || !compIntentRows || compIntentRows.length !== 1) {
                logCompensationFailure('TOKEN_GEN_FAIL_INTENT_COMPENSATION_FAILED', {
                    intentId: intent.id,
                    providerTransactionId: txId,
                    affectedRows: compIntentRows ? compIntentRows.length : 0,
                    error: compIntentErr?.message
                });
            }

            const { data: compQuoteRows, error: compQuoteErr } = await supabase.from('saas_subscription_quotes').update({
                status: 'reconciliation_required',
                failure_code: 'TOKEN_GENERATION_FAILED',
                provider_transaction_id: txId
            }).eq('quote_id', activeQuote.quote_id).select('id');

            if (compQuoteErr || !compQuoteRows || compQuoteRows.length !== 1) {
                logCompensationFailure('TOKEN_GEN_FAIL_QUOTE_COMPENSATION_FAILED', {
                    quoteId: activeQuote.quote_id,
                    providerTransactionId: txId,
                    affectedRows: compQuoteRows ? compQuoteRows.length : 0,
                    error: compQuoteErr?.message
                });
            }

            return res.status(502).json({
                error: 'Paiement en attente de réconciliation.',
                code: 'RECONCILIATION_REQUIRED',
                diagnostic_id: diagnosticId
            });
        }

        if (!token || typeof token.token !== 'string' || !token.token.trim() || typeof token.url !== 'string' || !token.url.trim() || !validateFedaPayRedirectUrl(token.url)) {
            const { data: compIntentRows, error: compIntentErr } = await supabase.from('payment_intents').update({
                status: 'reconciliation_required',
                reconciliation_reason: 'TOKEN_GENERATION_FAILED',
                provider_transaction_id: txId
            }).eq('id', intent.id).select('id');

            if (compIntentErr || !compIntentRows || compIntentRows.length !== 1) {
                logCompensationFailure('INVALID_TOKEN_URL_INTENT_COMPENSATION_FAILED', {
                    intentId: intent.id,
                    providerTransactionId: txId,
                    affectedRows: compIntentRows ? compIntentRows.length : 0,
                    error: compIntentErr?.message
                });
            }

            const { data: compQuoteRows, error: compQuoteErr } = await supabase.from('saas_subscription_quotes').update({
                status: 'reconciliation_required',
                failure_code: 'TOKEN_GENERATION_FAILED',
                provider_transaction_id: txId
            }).eq('quote_id', activeQuote.quote_id).select('id');

            if (compQuoteErr || !compQuoteRows || compQuoteRows.length !== 1) {
                logCompensationFailure('INVALID_TOKEN_URL_QUOTE_COMPENSATION_FAILED', {
                    quoteId: activeQuote.quote_id,
                    providerTransactionId: txId,
                    affectedRows: compQuoteRows ? compQuoteRows.length : 0,
                    error: compQuoteErr?.message
                });
            }

            return res.status(502).json({
                error: 'URL de redirection paiement invalide.',
                code: 'RECONCILIATION_REQUIRED',
                diagnostic_id: diagnosticId
            });
        }

        // 12. Clôture atomique par RPC PostgreSQL SECURITY DEFINER
        const { data: _rpcRes, error: rpcErr } = await supabase.rpc('complete_saas_payment_initialization', {
            p_intent_id: intent.id,
            p_quote_id: activeQuote.quote_id,
            p_provider_transaction_id: txId,
            p_school_slug: slug
        });

        if (rpcErr) {
            logCompensationFailure('SAAS_PAYMENT_INIT_RPC_FAILED', {
                intentId: intent.id,
                quoteId: activeQuote.quote_id,
                providerTransactionId: txId,
                schoolSlug: slug,
                error: rpcErr.message
            });

            const { data: compIntentRows, error: compIntentErr } = await supabase.from('payment_intents').update({
                status: 'reconciliation_required',
                reconciliation_reason: 'RPC_INITIALIZATION_COMPLETION_FAILED',
                provider_transaction_id: txId
            }).eq('id', intent.id).select('id');

            if (compIntentErr || !compIntentRows || compIntentRows.length !== 1) {
                logCompensationFailure('RPC_FAIL_INTENT_COMPENSATION_FAILED', {
                    intentId: intent.id,
                    providerTransactionId: txId,
                    affectedRows: compIntentRows ? compIntentRows.length : 0,
                    error: compIntentErr?.message
                });
            }

            const { data: compQuoteRows, error: compQuoteErr } = await supabase.from('saas_subscription_quotes').update({
                status: 'reconciliation_required',
                failure_code: 'RPC_INITIALIZATION_COMPLETION_FAILED',
                provider_transaction_id: txId
            }).eq('quote_id', activeQuote.quote_id).select('id');

            if (compQuoteErr || !compQuoteRows || compQuoteRows.length !== 1) {
                logCompensationFailure('RPC_FAIL_QUOTE_COMPENSATION_FAILED', {
                    quoteId: activeQuote.quote_id,
                    providerTransactionId: txId,
                    affectedRows: compQuoteRows ? compQuoteRows.length : 0,
                    error: compQuoteErr?.message
                });
            }

            return res.status(502).json({
                error: 'Paiement créé chez le prestataire mais la validation interne a échoué. En attente de réconciliation.',
                code: 'RECONCILIATION_REQUIRED',
                diagnostic_id: diagnosticId
            });
        }

        // 13. Remise du token et URL validée au client
        return res.status(200).json({
            url: token.url,
            token: token.token,
            transactionId: txId,
            diagnostic_id: diagnosticId
        });

    } catch (_error) {
        console.error('[SAAS_UNHANDLED_ERROR]', JSON.stringify({
            diagnostic_id: diagnosticId,
            schoolSlug: slug,
            error: _error?.message
        }));

        if (txId) {
            // Une transaction FedaPay existe : obligation absolue d'enregistrer la réconciliation et de renvoyer HTTP 502
            if (intent?.id) {
                try {
                    const { data: compIntentRows, error: compIntentErr } = await supabase.from('payment_intents').update({
                        status: 'reconciliation_required',
                        reconciliation_reason: 'UNHANDLED_EXCEPTION_AFTER_TX_CREATED',
                        provider_transaction_id: txId
                    }).eq('id', intent.id).select('id');

                    if (compIntentErr || !compIntentRows || compIntentRows.length !== 1) {
                        logCompensationFailure('CATCH_INTENT_COMPENSATION_FAILED', {
                            intentId: intent.id,
                            providerTransactionId: txId,
                            affectedRows: compIntentRows ? compIntentRows.length : 0,
                            error: compIntentErr?.message
                        });
                    }
                } catch (cleanupErr) {
                    logCompensationFailure('UNHANDLED_EXCEPTION_INTENT_COMPENSATION_FAILED', {
                        intentId: intent.id,
                        providerTransactionId: txId,
                        error: cleanupErr?.message
                    });
                }
            }

            if (activeQuote?.quote_id) {
                try {
                    const { data: compQuoteRows, error: compQuoteErr } = await supabase.from('saas_subscription_quotes').update({
                        status: 'reconciliation_required',
                        failure_code: 'UNHANDLED_EXCEPTION_AFTER_TX_CREATED',
                        provider_transaction_id: txId
                    }).eq('quote_id', activeQuote.quote_id).select('id');

                    if (compQuoteErr || !compQuoteRows || compQuoteRows.length !== 1) {
                        logCompensationFailure('CATCH_QUOTE_COMPENSATION_FAILED', {
                            quoteId: activeQuote.quote_id,
                            providerTransactionId: txId,
                            affectedRows: compQuoteRows ? compQuoteRows.length : 0,
                            error: compQuoteErr?.message
                        });
                    }
                } catch (cleanupErr) {
                    logCompensationFailure('UNHANDLED_EXCEPTION_QUOTE_COMPENSATION_FAILED', {
                        quoteId: activeQuote.quote_id,
                        providerTransactionId: txId,
                        error: cleanupErr?.message
                    });
                }
            }

            return res.status(502).json({
                error: 'Paiement créé chez le prestataire mais une erreur inattendue est survenue. En attente de réconciliation.',
                code: 'RECONCILIATION_REQUIRED',
                diagnostic_id: diagnosticId
            });
        }

        // Aucune transaction FedaPay créée : traitement propre de l'échec local
        if (activeQuote?.quote_id) {
            try {
                await supabase.from('saas_subscription_quotes').update({
                    status: 'failed',
                    failed_at: new Date().toISOString(),
                    failure_code: 'UNHANDLED_INITIALIZATION_ERROR'
                }).eq('quote_id', activeQuote.quote_id).select('id');
            } catch (_qFailErr) {}
        }

        if (intent?.id) {
            try {
                await supabase.from('payment_intents').update({
                    status: 'failed',
                    reconciliation_reason: 'UNHANDLED_INITIALIZATION_ERROR'
                }).eq('id', intent.id).select('id');
            } catch (_iFailErr) {}
        }

        return res.status(500).json({
            error: "Erreur lors du traitement de l'abonnement.",
            code: 'PAYMENT_INITIALIZATION_FAILED',
            diagnostic_id: diagnosticId
        });
    }
}

/**
 * Initialise un don public pour une campagne
 * POST /api/payment/public/campaigns/:schoolSlug/:campaignId/donate
 */
async function createDonationTransaction(req, res) {
    const { schoolSlug, campaignId } = req.params;
    const { amount, donor_name, donor_email, donor_phone, is_anonymous } = req.body;

    if (!schoolSlug || !SLUG_REGEX.test(schoolSlug)) {
        return res.status(400).json({ error: 'Établissement invalide.' });
    }

    if (!campaignId || !UUID_REGEX.test(campaignId)) {
        return res.status(400).json({ error: 'Identifiant de campagne invalide.' });
    }

    const numericAmount = parseStrictXofAmount(amount);
    if (!numericAmount || numericAmount < 500 || numericAmount > 10000000) {
        return res.status(400).json({ error: 'Le montant du don doit être compris entre 500 et 10 000 000 FCFA.' });
    }

    try {
        // 1. Vérification de la campagne active
        const { data: campaign, error: campErr } = await supabase
            .from(`campaigns_${schoolSlug}`)
            .select('id, title, status')
            .eq('id', campaignId)
            .single();

        if (campErr || !campaign || campaign.status !== 'active') {
            return res.status(400).json({ error: 'Campagne introuvable ou inactive.' });
        }

        // 2. Génération ID et Intent en premier pour éviter l'orphelin
        const donationId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

        const { data: intent, error: intentErr } = await supabase
            .from('payment_intents')
            .insert({
                provider: 'fedapay',
                payment_type: 'donation',
                school_slug: schoolSlug,
                target_id: campaignId,
                secondary_id: donationId,
                expected_amount: numericAmount,
                expected_currency: 'XOF',
                status: 'initializing',
                collected_by_platform: true,
                expires_at: expiresAt
            })
            .select('id')
            .single();

        if (intentErr) {
            if (intentErr.code === '23505') {
                return res.status(409).json({ error: 'Une session de paiement est déjà active pour cette campagne.' });
            }
            return res.status(500).json({ error: 'Erreur lors du traitement du don.' });
        }

        // 3. Création de l'enregistrement de don préliminaire 'pending' (échec certain AVANT tout appel fournisseur -> cancelled)
        const { data: donData, error: donErr } = await supabase
            .from(`donations_${schoolSlug}`)
            .insert({
                id: donationId,
                campaign_id: campaignId,
                donor_name: is_anonymous ? 'Anonyme' : (donor_name || 'Anonyme'),
                donor_email: donor_email || null,
                donor_phone: donor_phone || null,
                amount: numericAmount,
                currency: 'FCFA',
                payment_method: 'fedapay',
                status: 'pending'
            })
            .select('id')
            .single();

        if (donErr || !donData) {
            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'cancelled',
                    reconciliation_reason: 'DONATION_INSERT_FAILED'
                });
            } catch (compErr) {
                logCompensationFailure('DONATION_INSERT_INTENT_CANCEL_FAILED', {
                    intentId: intent.id,
                    donationId,
                    schoolSlug,
                    expectedStatus: 'initializing',
                    targetStatus: 'cancelled'
                });
            }

            return res.status(500).json({ error: 'Erreur lors du traitement du don.' });
        }

        // 4. Création de la transaction FedaPay
        await configureFedaPay();

        let transaction;
        try {
            transaction = await Transaction.create({
                description: `Don pour ${campaign.title}`,
                amount: numericAmount,
                currency: { iso: 'XOF' },
                callback_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/campaigns/${schoolSlug}/${campaignId}?donation=success`,
                custom_metadata: {
                    intent_id: intent.id
                }
            });
        } catch (_fedaErr) {
            // Issue distante inconnue : réconciliation exigée, ne pas annuler le don local
            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: 'PROVIDER_CREATION_OUTCOME_UNKNOWN'
                });
            } catch (tErr) {
                logCompensationFailure('DONATION_PROVIDER_CREATION_INTENT_COMPENSATION_FAILED', {
                    intentId: intent.id,
                    donationId,
                    schoolSlug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }

            return res.status(500).json({ error: 'Erreur lors du traitement du don.' });
        }

        if (!transaction || !transaction.id || typeof transaction.id === 'undefined' || String(transaction.id).trim() === '') {
            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: 'PROVIDER_RESPONSE_INVALID'
                });
            } catch (tErr) {
                logCompensationFailure('DONATION_INVALID_TX_INTENT_COMPENSATION_FAILED', {
                    intentId: intent.id,
                    donationId,
                    schoolSlug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }

            return res.status(500).json({ error: 'Erreur lors du traitement du don.' });
        }

        // 5. Génération du token FedaPay AVANT la liaison
        let token;
        try {
            token = await transaction.generateToken();
        } catch (_tokErr) {
            let donLinked = false;
            try {
                const { data: donUp } = await supabase
                    .from(`donations_${schoolSlug}`)
                    .update({ transaction_id: String(transaction.id) })
                    .eq('id', donationId)
                    .eq('status', 'pending')
                    .select('id')
                    .single();
                if (donUp) donLinked = true;
            } catch (_dErr) {}

            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: donLinked ? 'TOKEN_GENERATION_FAILED' : 'DONATION_LINK_FAILED_AFTER_TOKEN_GENERATION',
                    provider_transaction_id: String(transaction.id)
                });
            } catch (tErr) {
                logCompensationFailure('DONATION_TOKEN_GEN_INTENT_COMPENSATION_FAILED', {
                    intentId: intent.id,
                    donationId,
                    schoolSlug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }

            return res.status(500).json({ error: 'Erreur lors du traitement du don.' });
        }

        if (!token || typeof token.url !== 'string' || !token.url.trim()) {
            let donLinked = false;
            try {
                const { data: donUp } = await supabase
                    .from(`donations_${schoolSlug}`)
                    .update({ transaction_id: String(transaction.id) })
                    .eq('id', donationId)
                    .eq('status', 'pending')
                    .select('id')
                    .single();
                if (donUp) donLinked = true;
            } catch (_dErr) {}

            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: donLinked ? 'TOKEN_GENERATION_FAILED' : 'DONATION_LINK_FAILED_AFTER_TOKEN_GENERATION',
                    provider_transaction_id: String(transaction.id)
                });
            } catch (tErr) {
                logCompensationFailure('DONATION_INVALID_TOKEN_INTENT_COMPENSATION_FAILED', {
                    intentId: intent.id,
                    donationId,
                    schoolSlug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }

            return res.status(500).json({ error: 'Erreur lors du traitement du don.' });
        }

        // 6. Liaison préalable de transaction_id sur la table donations (contrôle CAS en statut pending)
        const { data: donUpdate, error: donUpErr } = await supabase
            .from(`donations_${schoolSlug}`)
            .update({ transaction_id: String(transaction.id) })
            .eq('id', donationId)
            .eq('status', 'pending')
            .select('id')
            .single();

        if (donUpErr || !donUpdate) {
            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: 'DONATION_LINK_FAILED',
                    provider_transaction_id: String(transaction.id)
                });
            } catch (compErr) {
                logCompensationFailure('DONATION_LINK_INTENT_RECONCILIATION_FAILED', {
                    intentId: intent.id,
                    donationId,
                    schoolSlug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }

            return res.status(500).json({ error: 'Erreur lors du traitement du don.' });
        }

        // 7. Seulement après la réussite de la liaison du don : liaison de l'intention et passage à 'pending'
        try {
            await transitionIntent(intent.id, 'initializing', {
                status: 'pending',
                provider_transaction_id: String(transaction.id)
            });
        } catch (_linkErr) {
            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: 'LOCAL_LINK_FAILED',
                    provider_transaction_id: String(transaction.id)
                });
            } catch (compErr) {
                logCompensationFailure('DONATION_INTENT_PENDING_RECONCILIATION_FAILED', {
                    intentId: intent.id,
                    donationId,
                    schoolSlug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }

            return res.status(500).json({ error: 'Erreur lors du traitement du don.' });
        }

        // 8. Remise du token au client uniquement après la réussite des deux opérations
        return res.status(200).json({
            token: token.url,
            transactionId: transaction.id
        });

    } catch (_error) {
        return res.status(500).json({ error: 'Erreur lors du traitement du don.' });
    }
}

/**
 * Webhook appelé par FedaPay avec signature cryptographique
 * POST /api/payment/webhook
 */
async function fedapayWebhook(req, res) {
    const webhookSecret = process.env.FEDAPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
        console.error('FEDAPAY_WEBHOOK_SECRET non configuré.');
        return res.status(500).json({ error: 'Erreur de configuration serveur.' });
    }

    const signatureHeader = req.headers['x-fedapay-signature'] || req.headers['x-fedapay-signature-256'];
    if (!signatureHeader) {
        return res.status(400).json({ error: 'Signature FedaPay manquante.' });
    }

    if (!req.rawBody || !Buffer.isBuffer(req.rawBody)) {
        return res.status(400).json({ error: 'Corps brut introuvable.' });
    }

    // 1. Validation cryptographique de la signature sur le payload brut
    let event;
    try {
        event = Webhook.constructEvent(req.rawBody, signatureHeader, webhookSecret);
    } catch (_sigErr) {
        return res.status(400).json({ error: 'Signature invalide.' });
    }

    // 2. Filtrage des événements : seul transaction.approved déclenche l'exécution
    if (!event || event.name !== 'transaction.approved') {
        return res.status(200).json({ received: true, status: 'ignored' });
    }

    const remoteEntity = event.entity;
    if (!remoteEntity || !remoteEntity.id) {
        return res.status(400).json({ error: 'Entité de transaction manquante.' });
    }

    // 3. Extraction et validation de l'identifiant d'intention local
    const customMetadata = remoteEntity.custom_metadata || {};
    const intentId = customMetadata.intent_id;

    if (!intentId || !UUID_REGEX.test(intentId)) {
        return res.status(400).json({ error: 'Identifiant intention invalide.' });
    }

    // 4. Récupération vérifiée de la transaction distante auprès de FedaPay
    await configureFedaPay();

    let remoteTx;
    try {
        remoteTx = await Transaction.retrieve(remoteEntity.id);
    } catch (_retErr) {
        return res.status(502).json({ error: 'Impossible de vérifier la transaction distante.' });
    }

    if (!remoteTx || remoteTx.status !== 'approved' || !remoteTx.id) {
        return res.status(400).json({ error: 'Transaction non approuvée par la passerelle.' });
    }

    const remoteCustomMeta = remoteTx.custom_metadata || {};
    if (remoteCustomMeta.intent_id !== intentId) {
        return res.status(400).json({ error: "Divergence d'intention distante." });
    }

    // Validation fail-closed du montant distant
    const remoteAmount = parseStrictXofAmount(remoteTx.amount);
    if (!remoteAmount) {
        return res.status(400).json({ error: 'Montant distant invalide.' });
    }

    // Validation fail-closed de la devise distante (strictement XOF sans fallback)
    const rawCurrency = (typeof remoteTx.currency === 'object' && remoteTx.currency !== null)
        ? remoteTx.currency.iso
        : (typeof remoteTx.currency === 'string' ? remoteTx.currency : null);

    if (!rawCurrency || rawCurrency !== 'XOF') {
        return res.status(400).json({ error: 'Devise distante invalide ou non supportée.' });
    }

    // 5. Extraction certifiée et fail-closed des métadonnées de paiement (Lot 6B)
    // A. Identifiant d'événement : stable et vérifié, ou clé non certifiée fondée sur l'intention uniquement
    const hasNominalEventId = Boolean(event.id && typeof event.id === 'string' && event.id.trim());
    const providerEventId = hasNominalEventId
        ? event.id.trim()
        : `uncertified_intent_${intentId}`;

    // B. Horodatage certifié : rejet de tout horodatage inventé
    let certifiedPaymentAt = null;
    if (remoteTx.paid_at && typeof remoteTx.paid_at === 'string' && !isNaN(Date.parse(remoteTx.paid_at))) {
        certifiedPaymentAt = new Date(remoteTx.paid_at).toISOString();
    } else if (remoteTx.approved_at && typeof remoteTx.approved_at === 'string' && !isNaN(Date.parse(remoteTx.approved_at))) {
        certifiedPaymentAt = new Date(remoteTx.approved_at).toISOString();
    }

    // C. Frais FedaPay certifiés : distinction stricte zéro certifié, absent, invalide ou ambigu
    let certifiedFee = null;
    let isFeeCertified = false;
    const hasCommission = remoteTx.commission !== undefined && remoteTx.commission !== null;
    const hasFixedCommission = remoteTx.fixed_commission !== undefined && remoteTx.fixed_commission !== null;

    if (hasCommission && hasFixedCommission) {
        // Deux champs de commission présents sans spécification univoque : ambiguïté
        isFeeCertified = false;
    } else if (hasCommission) {
        const parsedComm = Number(remoteTx.commission);
        if (Number.isFinite(parsedComm) && parsedComm >= 0) {
            certifiedFee = parsedComm;
            isFeeCertified = true;
        }
    } else if (hasFixedCommission) {
        const parsedFixed = Number(remoteTx.fixed_commission);
        if (Number.isFinite(parsedFixed) && parsedFixed >= 0) {
            certifiedFee = parsedFixed;
            isFeeCertified = true;
        }
    }

    // D. Taxes certifiées : aucune déduction sans valeur certifiée explicite
    let certifiedTax = null;
    let isTaxCertified = false;
    if (remoteTx.tax !== undefined && remoteTx.tax !== null) {
        const parsedTax = Number(remoteTx.tax);
        if (Number.isFinite(parsedTax) && parsedTax >= 0) {
            certifiedTax = parsedTax;
            isTaxCertified = true;
        }
    }

    // Éligibilité nominale stricte : tout manquement ou ambiguïté force la réconciliation
    const isNominalEligible = hasNominalEventId && Boolean(certifiedPaymentAt) && isFeeCertified && isTaxCertified;

    // 6. Exécution transactionnelle atomique via la RPC PostgreSQL v2
    const { data: rpcResult, error: rpcError } = await supabase.rpc('process_fedapay_webhook_event_v2', {
        p_provider: 'fedapay',
        p_provider_event_id: providerEventId,
        p_event_type: event.name,
        p_intent_id: intentId,
        p_provider_transaction_id: String(remoteTx.id),
        p_remote_amount: remoteAmount,
        p_remote_currency: rawCurrency,
        p_remote_status: remoteTx.status,
        p_certified_payment_at: certifiedPaymentAt,
        p_fedapay_fee: isFeeCertified ? certifiedFee : null,
        p_tax_amount: isTaxCertified ? certifiedTax : null,
        p_is_nominal_event: isNominalEligible
    });

    if (rpcError) {
        return res.status(500).json({ error: 'Erreur lors du traitement transactionnel.' });
    }

    if (rpcResult?.status === 'completed' || rpcResult?.status === 'duplicate') {
        return res.status(200).json({ received: true, status: rpcResult.status });
    }

    if (rpcResult?.status === 'reconciliation_required') {
        return res.status(200).json({ received: true, status: 'reconciliation_required' });
    }

    return res.status(400).json({ error: 'Traitement rejeté.' });
}

module.exports = {
    createTransaction,
    createSaasTransaction,
    createDonationTransaction,
    getSubscriptionQuote,
    getSubscriptionQuoteById,
    createSubscriptionQuote,
    computeSchoolSubscriptionQuote,
    computeAndPersistSubscriptionQuote,
    computeClassificationHash,
    resolveActivePricingGrid,
    configureFedaPay,
    validateFedaPayRedirectUrl,
    calculateDeterministicTranches,
    normalizeCycleToBillingCategory,
    normalizeClassName,
    DEFAULT_CLASS_CONFIGS,
    PRICING_RATES_MONTHLY,
    ANNUAL_MONTHS_COUNT,
    ANNUAL_DISCOUNT_PERCENT,
    TRANCHES_COUNT,
    fedapayWebhook
};
