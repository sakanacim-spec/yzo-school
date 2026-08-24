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
 * Calcule de manière autoritaire le devis d'abonnement SaaS à partir de l'effectif réel de l'établissement
 */
async function computeSchoolSubscriptionQuote(schoolSlug) {
    const diagnosticId = `diag_${crypto.randomBytes(8).toString('hex')}`;

    // 1. Récupération des paramètres de l'école (classes et année scolaire)
    let configuredClasses = [];
    let schoolYear = null;

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
        .select('id, classe, class_id');

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

    // 3. Indexation des classes configurées
    const classById = new Map();
    const classByName = new Map();

    if (Array.isArray(configuredClasses)) {
        for (const cls of configuredClasses) {
            if (cls && typeof cls === 'object') {
                if (cls.id) {
                    classById.set(String(cls.id).toLowerCase().trim(), cls);
                }
                if (cls.name) {
                    const norm = normalizeClassName(cls.name);
                    if (norm) classByName.set(norm, cls);
                }
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
        let matchedClass = null;
        if (student.class_id && classById.has(String(student.class_id).toLowerCase().trim())) {
            matchedClass = classById.get(String(student.class_id).toLowerCase().trim());
        } else if (student.classe) {
            const norm = normalizeClassName(student.classe);
            if (classByName.has(norm)) {
                matchedClass = classByName.get(norm);
            }
        }

        if (!matchedClass && student.classe) {
            const norm = normalizeClassName(student.classe);
            const defMatched = DEFAULT_CLASS_CONFIGS.find(c => normalizeClassName(c.name) === norm);
            if (defMatched) {
                matchedClass = defMatched;
            }
        }

        if (!matchedClass) {
            unclassifiedCount++;
            continue;
        }

        const billingCat = normalizeCycleToBillingCategory(matchedClass.cycle, matchedClass.billingCategory);
        if (!billingCat || !breakdown.hasOwnProperty(billingCat)) {
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

    const totalStudents = breakdown.maternelle_primaire + breakdown.college_secondaire + breakdown.superieur_formation;
    const monthlyPrimaire = breakdown.maternelle_primaire * PRICING_RATES_MONTHLY.maternelle_primaire;
    const monthlySecondaire = breakdown.college_secondaire * PRICING_RATES_MONTHLY.college_secondaire;
    const monthlySuperieur = breakdown.superieur_formation * PRICING_RATES_MONTHLY.superieur_formation;

    const totalMonthlyFcfa = monthlyPrimaire + monthlySecondaire + monthlySuperieur;
    const totalAnnualFcfa = totalMonthlyFcfa * ANNUAL_MONTHS_COUNT;
    const annualBonusFcfa = Math.round(totalAnnualFcfa * (ANNUAL_DISCOUNT_PERCENT / 100));
    const finalAnnualFcfa = totalAnnualFcfa - annualBonusFcfa;
    const tranches = calculateDeterministicTranches(totalAnnualFcfa);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    return {
        quote_id: `quote_${crypto.randomBytes(8).toString('hex')}`,
        calculated_at: now.toISOString(),
        expires_at: expiresAt,
        schoolSlug,
        billingPeriod: schoolYear,
        totalStudents,
        breakdown,
        ratesMonthly: PRICING_RATES_MONTHLY,
        monthlyAmount: totalMonthlyFcfa,
        totalAnnualAmount: totalAnnualFcfa,
        annualBonusAmount: annualBonusFcfa,
        finalAnnualAmount: finalAnnualFcfa,
        tranches,
        currency: 'XOF'
    };
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

        const quote = await computeSchoolSubscriptionQuote(slug);

        // Détermination de la source de vérité pour la période active
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
        if (err.code === 'SUBSCRIPTION_PERIOD_REQUIRED') {
            return res.status(422).json({
                error: err.message,
                code: err.code,
                diagnostic_id: err.diagnostic_id || diagnosticId
            });
        }
        if (err.code === 'SUBSCRIPTION_AMOUNT_INVALID') {
            return res.status(422).json({
                error: err.message,
                code: err.code,
                diagnostic_id: err.diagnostic_id || diagnosticId
            });
        }
        if (err.code === 'SUBSCRIPTION_CLASSIFICATION_INCOMPLETE') {
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
 * Initialise un abonnement SaaS pour un établissement
 * POST /api/payment/saas/schools/:slug/pay-init
 */
async function createSaasTransaction(req, res) {
    const slug = req.params.slug || req.body.schoolSlug;
    const { planType, trancheNumber } = req.body;
    const diagnosticId = `diag_${crypto.randomBytes(8).toString('hex')}`;

    if (!slug || !SLUG_REGEX.test(slug)) {
        return res.status(400).json({
            error: 'Slug établissement invalide.',
            code: 'INVALID_SLUG',
            diagnostic_id: diagnosticId
        });
    }

    // Validation stricte du planType
    if (planType !== 'annual' && planType !== 'tranche') {
        return res.status(400).json({
            error: "Plan d'abonnement invalide.",
            code: 'INVALID_PLAN',
            diagnostic_id: diagnosticId
        });
    }

    // Contrôle d'autorisation RBAC strict et minimal
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

    if (userRole === 'superadmin') {
        // Autorisé explicitement
    } else if (adminRoles.includes(userRole) && userSchoolSlug === slug) {
        // Autorisé pour la même école
    } else {
        return res.status(403).json({
            error: 'Non autorisé à gérer les paiements de cet établissement.',
            code: 'PAYMENT_FORBIDDEN',
            diagnostic_id: diagnosticId
        });
    }

    try {
        // 1. Récupération de l'école
        const { data: school, error: schErr } = await supabase
            .from('schools')
            .select('id, slug, name, total_revenue_paid, subscription_plan, paid_tranches_count')
            .eq('slug', slug)
            .single();

        if (schErr || !school) {
            return res.status(404).json({
                error: 'Établissement introuvable.',
                code: 'SCHOOL_NOT_FOUND',
                diagnostic_id: diagnosticId
            });
        }

        // 2. Calcul du devis autoritaire backend (période, effectifs et catégories tarifaires stables)
        let quote;
        try {
            quote = await computeSchoolSubscriptionQuote(slug);
        } catch (quoteErr) {
            if (quoteErr.code === 'SUBSCRIPTION_PERIOD_REQUIRED') {
                return res.status(422).json({
                    error: quoteErr.message,
                    code: quoteErr.code,
                    diagnostic_id: quoteErr.diagnostic_id || diagnosticId
                });
            }
            if (quoteErr.code === 'SUBSCRIPTION_AMOUNT_INVALID') {
                return res.status(422).json({
                    error: quoteErr.message,
                    code: quoteErr.code,
                    diagnostic_id: quoteErr.diagnostic_id || diagnosticId
                });
            }
            if (quoteErr.code === 'SUBSCRIPTION_CLASSIFICATION_INCOMPLETE') {
                return res.status(422).json({
                    error: quoteErr.message,
                    code: quoteErr.code,
                    unclassified_count: quoteErr.unclassified_count,
                    diagnostic_id: quoteErr.diagnostic_id || diagnosticId
                });
            }
            throw quoteErr;
        }

        const billingPeriod = quote.billingPeriod;

        // 3. Récupération de l'historique des intentions confirmées pour cette période précise
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

        let expectedAmount = 0;
        let grossAmount = 0;
        let discountAmount = 0;
        let payableAmount = 0;
        let activeTrancheNumber = null;

        if (planType === 'annual') {
            if (isAnnualCompleted) {
                return res.status(400).json({
                    error: `L'abonnement annuel pour la période ${billingPeriod} a déjà été intégralement réglé.`,
                    code: 'ANNUAL_ALREADY_PAID',
                    diagnostic_id: diagnosticId
                });
            }
            if (completedTranches.length > 0) {
                return res.status(400).json({
                    error: `Impossible de souscrire un plan annuel après le démarrage d'un paiement par tranches pour la période ${billingPeriod}.`,
                    code: 'TRANCHE_ALREADY_STARTED',
                    diagnostic_id: diagnosticId
                });
            }
            grossAmount = quote.totalAnnualAmount;
            discountAmount = quote.annualBonusAmount;
            payableAmount = quote.finalAnnualAmount;
            expectedAmount = quote.finalAnnualAmount;
        } else {
            // Mode Tranches
            if (isAnnualCompleted) {
                return res.status(400).json({
                    error: `L'abonnement pour la période ${billingPeriod} est déjà réglé au comptant.`,
                    code: 'PERIOD_ALREADY_SETTLED',
                    diagnostic_id: diagnosticId
                });
            }
            if (completedTranches.length >= 3) {
                return res.status(400).json({
                    error: `Toutes les tranches (3/3) pour la période ${billingPeriod} sont déjà réglées.`,
                    code: 'PERIOD_ALREADY_SETTLED',
                    diagnostic_id: diagnosticId
                });
            }

            const nextDueTranche = completedTranches.length + 1;
            if (typeof trancheNumber !== 'undefined' && trancheNumber !== null) {
                const reqTranche = Number(trancheNumber);
                if (completedTranches.includes(reqTranche) || reqTranche <= completedTranches.length) {
                    return res.status(400).json({
                        error: `La tranche N°${reqTranche} pour la période ${billingPeriod} a déjà été réglée et confirmée.`,
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

            activeTrancheNumber = nextDueTranche;
            expectedAmount = quote.tranches[activeTrancheNumber - 1];
            grossAmount = expectedAmount;
            discountAmount = 0;
            payableAmount = expectedAmount;
        }

        if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0) {
            return res.status(422).json({
                error: "Le montant d'abonnement calculé est invalide ou nul. Veuillez enregistrer vos effectifs scolaires.",
                code: 'SUBSCRIPTION_AMOUNT_INVALID',
                diagnostic_id: diagnosticId
            });
        }

        // 4. Configuration et validation fail-closed de la passerelle FedaPay
        const fedaConfig = await configureFedaPay();
        if (!fedaConfig.isConfigured) {
            console.error('[PAYMENT_PROVIDER_NOT_CONFIGURED]', JSON.stringify({
                diagnostic_id: diagnosticId,
                code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
                schoolSlug: slug,
                planType
            }));
            return res.status(503).json({
                error: 'Le service de paiement est temporairement indisponible.',
                code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
                diagnostic_id: diagnosticId
            });
        }

        // 5. Nettoyage sécurisé des intentions actives expirées
        try {
            await expireStaleIntents('saas_subscription', school.slug);
        } catch (_cleanErr) {
            console.error('[STALE_INTENTS_CLEANUP_FAILED]', JSON.stringify({
                diagnostic_id: diagnosticId,
                schoolSlug: slug
            }));
            return res.status(500).json({
                error: "Erreur lors du traitement de l'abonnement.",
                code: 'PAYMENT_INITIALIZATION_FAILED',
                diagnostic_id: diagnosticId
            });
        }

        // 6. Création de l'intention locale en statut 'initializing' avec période immuable et montants complets
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const { data: intent, error: intentErr } = await supabase
            .from('payment_intents')
            .insert({
                provider: 'fedapay',
                payment_type: 'saas_subscription',
                school_slug: school.slug,
                target_id: school.id,
                billing_period: billingPeriod,
                plan_type: planType,
                installment_number: activeTrancheNumber,
                gross_amount: grossAmount,
                discount_amount: discountAmount,
                payable_amount: payableAmount,
                expected_amount: expectedAmount,
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
                return res.status(409).json({
                    error: 'Une session de paiement est déjà active pour cet établissement.',
                    code: 'PAYMENT_ALREADY_PENDING',
                    diagnostic_id: diagnosticId
                });
            }
            console.error('[INTENT_CREATION_FAILED]', JSON.stringify({
                diagnostic_id: diagnosticId,
                schoolSlug: slug
            }));
            return res.status(500).json({
                error: "Erreur lors du traitement de l'abonnement.",
                code: 'PAYMENT_INITIALIZATION_FAILED',
                diagnostic_id: diagnosticId
            });
        }

        // 6. Création de la transaction FedaPay
        let transaction;
        try {
            transaction = await Transaction.create({
                description: `Paiement abonnement SaaS - ${school.name || slug}`,
                amount: expectedAmount,
                currency: { iso: 'XOF' },
                callback_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/dashboard?payment=success`,
                custom_metadata: {
                    intent_id: intent.id
                }
            });
        } catch (fedaErr) {
            console.error('[FEDAPAY_TX_CREATE_FAILED]', JSON.stringify({
                diagnostic_id: diagnosticId,
                schoolSlug: slug,
                planType,
                providerErrorStatus: fedaErr.statusCode || fedaErr.status || 'UNKNOWN'
            }));

            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: 'PROVIDER_CREATION_OUTCOME_UNKNOWN'
                });
            } catch (compErr) {
                logCompensationFailure('SAAS_PROVIDER_CREATION_INTENT_COMPENSATION_FAILED', {
                    intentId: intent.id,
                    schoolSlug: school.slug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }

            return res.status(503).json({
                error: 'Le service de paiement est temporairement indisponible.',
                code: 'PAYMENT_PROVIDER_UNAVAILABLE',
                diagnostic_id: diagnosticId
            });
        }

        if (!transaction || !transaction.id || typeof transaction.id === 'undefined' || String(transaction.id).trim() === '') {
            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: 'PROVIDER_RESPONSE_INVALID'
                });
            } catch (compErr) {
                logCompensationFailure('SAAS_INVALID_TX_INTENT_COMPENSATION_FAILED', {
                    intentId: intent.id,
                    schoolSlug: school.slug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }
            return res.status(503).json({
                error: 'Le service de paiement est temporairement indisponible.',
                code: 'PAYMENT_PROVIDER_UNAVAILABLE',
                diagnostic_id: diagnosticId
            });
        }

        // 7. Génération du token FedaPay AVANT la liaison
        let token;
        try {
            token = await transaction.generateToken();
        } catch (_tokErr) {
            console.error('[FEDAPAY_TOKEN_GEN_FAILED]', JSON.stringify({
                diagnostic_id: diagnosticId,
                schoolSlug: slug
            }));
            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: 'TOKEN_GENERATION_FAILED',
                    provider_transaction_id: String(transaction.id)
                });
            } catch (compErr) {
                logCompensationFailure('SAAS_TOKEN_GEN_INTENT_COMPENSATION_FAILED', {
                    intentId: intent.id,
                    schoolSlug: school.slug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }

            return res.status(503).json({
                error: 'Le service de paiement est temporairement indisponible.',
                code: 'PAYMENT_PROVIDER_UNAVAILABLE',
                diagnostic_id: diagnosticId
            });
        }

        if (!token || typeof token.url !== 'string' || !token.url.trim() || !validateFedaPayRedirectUrl(token.url)) {
            console.error('[FEDAPAY_INVALID_REDIRECT_URL]', JSON.stringify({
                diagnostic_id: diagnosticId,
                schoolSlug: slug
            }));
            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: 'TOKEN_GENERATION_FAILED',
                    provider_transaction_id: String(transaction.id)
                });
            } catch (compErr) {
                logCompensationFailure('SAAS_INVALID_TOKEN_INTENT_COMPENSATION_FAILED', {
                    intentId: intent.id,
                    schoolSlug: school.slug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }
            return res.status(500).json({
                error: 'Initialisation du paiement impossible.',
                code: 'PAYMENT_INITIALIZATION_FAILED',
                diagnostic_id: diagnosticId
            });
        }

        // 8. Liaison locale et passage à 'pending' (contrôle atomique CAS d'exactement 1 ligne)
        try {
            await transitionIntent(intent.id, 'initializing', {
                status: 'pending',
                provider_transaction_id: String(transaction.id)
            });
        } catch (_linkErr) {
            console.error('[SAAS_LOCAL_LINK_FAILED]', JSON.stringify({
                diagnostic_id: diagnosticId,
                schoolSlug: slug
            }));
            try {
                await transitionIntent(intent.id, 'initializing', {
                    status: 'reconciliation_required',
                    reconciliation_reason: 'LOCAL_LINK_FAILED',
                    provider_transaction_id: String(transaction.id)
                });
            } catch (compErr) {
                logCompensationFailure('SAAS_LOCAL_LINK_RECONCILIATION_FAILED', {
                    intentId: intent.id,
                    schoolSlug: school.slug,
                    expectedStatus: 'initializing',
                    targetStatus: 'reconciliation_required'
                });
            }

            return res.status(500).json({
                error: "Erreur lors du traitement de l'abonnement.",
                code: 'PAYMENT_INITIALIZATION_FAILED',
                diagnostic_id: diagnosticId
            });
        }

        // 9. Remise du token et URL validée au client
        return res.status(200).json({
            url: token.url,
            token: token.token,
            diagnostic_id: diagnosticId
        });

    } catch (_error) {
        console.error('[SAAS_UNHANDLED_ERROR]', JSON.stringify({
            diagnostic_id: diagnosticId,
            schoolSlug: slug
        }));
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

    // 5. Exécution transactionnelle atomique via la RPC PostgreSQL
    const { data: rpcResult, error: rpcError } = await supabase.rpc('process_fedapay_webhook_event', {
        p_intent_id: intentId,
        p_provider_transaction_id: String(remoteTx.id),
        p_remote_amount: remoteAmount,
        p_remote_currency: rawCurrency,
        p_remote_status: remoteTx.status
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
    computeSchoolSubscriptionQuote,
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
