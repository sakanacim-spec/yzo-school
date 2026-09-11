'use strict';
const Groq = require('groq-sdk');
const aiQuotaService = require('../utils/aiQuotaService');
const {
    normalizeLanguage,
    getLocalizedErrorMessage
} = require('../utils/assistantLocale');
const {
    buildPublicSystemPrompt,
    buildPrivateSystemPrompt,
    buildPedagogicalPrompt
} = require('../utils/assistantPrompts');

const {
    getAssistantPricingContext,
    extractGuestCountry,
    detectPricingIntent,
    detectGlobalPricingRequest,
    formatMultipleCountriesClarification,
    buildCountryPricingResponse,
    COUNTRY_CONFIG,
    COUNTRY_DISPLAY_NAMES
} = require('../services/assistantPricingContextService');

const {
    getProductPresentation,
    isFeatureDiscoveryIntent
} = require('../utils/assistantProductCatalog');

const assistantSecurityGuard = require('../services/assistantSecurityGuard');
const assistantKnowledgeService = require('../services/assistantKnowledgeService');

let aiClient = null;

const getClient = () => {
    // Allow test injection of a mocked AI client via exported property.
    if (module && module.exports && module.exports.aiClient) {
        return module.exports.aiClient;
    }
    if (!aiClient) {
        if (!process.env.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY is missing');
        }
        aiClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return aiClient;
};

const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

const formatHistory = (messages) => {
    return messages.map(msg => ({
        role: (msg.sender === 'user' || msg.role === 'user') ? 'user' : 'assistant',
        content: (msg.text !== undefined ? msg.text : msg.content) || ''
    }));
};

/**
 * Assistant public (visiteur non connecté)
 * POST /api/assistant/chat
 */
const chatWithAssistant = async (req, res) => {
    const { messages, language } = req.body || {};
    const safeLang = normalizeLanguage(language);

    // 1. Validation de l'action et assainissement de l'état conversationnel (req.body uniquement)
    const assistantAction = typeof req.body?.assistant_action === 'string' ? req.body.assistant_action.trim() : '';
    const rawState = req.body?.conversation_state;
    const awaiting = (rawState && typeof rawState === 'object' && rawState.awaiting === 'pricing_country')
        ? 'pricing_country'
        : null;
    const conversation_state = awaiting ? { awaiting } : null;

    try {
        // 2. Validation fail-closed structurelle des messages
        const validation = aiQuotaService.validateChatMessages(messages);
        if (!validation.isValid) {
            return res.status(400).json({
                error: getLocalizedErrorMessage(400, null, safeLang)
            });
        }

        // Extraction stricte de la question utilisateur du tour courant (dernier message user)
        const userMessages = messages.filter(m => (m && typeof m === 'object' && (m.sender === 'user' || m.role === 'user')));
        const lastUserMsg = userMessages[userMessages.length - 1];
        const currentQuery = String(lastUserMsg?.text !== undefined ? lastUserMsg.text : lastUserMsg?.content || '').trim();

        // 3. Filtre de sécurité côté serveur sur le tour courant (injections, secrets, prompt leaks, PII, etc.)
        const securityCheck = assistantSecurityGuard.inspectCurrentTurn(currentQuery);
        if (!securityCheck.isSafe) {
            return res.json({
                reply: securityCheck.publicRefusalMessage,
                conversation_state: null
            });
        }

        // 4. Traitement déterministe des demandes globales de tous les tarifs (0 appel IA, 0 quota)
        if (detectGlobalPricingRequest(messages)) {
            return res.json({
                reply: "Les tarifs YZIOW sont adaptés au pays de chaque établissement. Je peux uniquement vous communiquer la grille applicable au pays de votre établissement.",
                conversation_state: null
            });
        }

        // 5. Découverte des fonctionnalités & Présentation commerciale déterministe (0 appel IA, 0 quota)
        if (assistantAction === 'discover_features_and_pricing' || isFeatureDiscoveryIntent(messages)) {
            const presentation = getProductPresentation({ language: safeLang });
            return res.json({
                reply: presentation,
                conversation_state: { awaiting: 'pricing_country' }
            });
        }

        // 6. Traitement déterministe des demandes tarifaires et résolutions de pays (0 appel IA, 0 quota)
        const countryResult = extractGuestCountry(messages, req.body?.countryCode || req.body?.country, conversation_state);

        if (countryResult.status === 'MULTIPLE_COUNTRIES_IN_INPUT') {
            return res.json({
                reply: formatMultipleCountriesClarification(countryResult.countries),
                conversation_state: { awaiting: 'pricing_country' }
            });
        }

        if (countryResult.status === 'RESOLVED' && countryResult.countryCode) {
            try {
                const pricingContext = await getAssistantPricingContext({
                    requestedCountryCode: countryResult.countryCode
                });
                return res.json({
                    reply: buildCountryPricingResponse(pricingContext),
                    conversation_state: null
                });
            } catch (pricingErr) {
                const countryArticle = COUNTRY_CONFIG[countryResult.countryCode]?.article || COUNTRY_DISPLAY_NAMES[countryResult.countryCode] || countryResult.countryCode;
                return res.json({
                    reply: pricingErr.code === 'PRICING_NOT_CONFIGURED'
                        ? `La grille tarifaire YZIOW n’est pas encore disponible pour ${countryArticle}. Notre équipe commerciale peut vous renseigner sur les prochaines disponibilités.`
                        : "Une indisponibilité temporaire empêche la consultation de la grille tarifaire. Veuillez réessayer ultérieurement.",
                    conversation_state: null
                });
            }
        }

        // Si nous attendons un pays ou si une intention tarifaire est détectée, demander le pays (0 appel IA, 0 quota)
        if (awaiting === 'pricing_country' || detectPricingIntent(messages, conversation_state)) {
            return res.json({
                reply: "Veuillez préciser le pays de votre établissement pour obtenir les tarifs.",
                conversation_state: { awaiting: 'pricing_country' }
            });
        }

        // 7. Sélection déterministe des connaissances publiques pertinentes depuis le registre officiel
        // Utilise STRICTEMENT la question utilisateur courante (aucune contamination par les anciens sujets)
        const knowledgeResult = assistantKnowledgeService.selectRelevantKnowledge(currentQuery);

        // Si aucune information pertinente ne dépasse le seuil : Réponse déterministe (0 appel IA, 0 quota)
        if (!knowledgeResult.hasRelevantKnowledge) {
            return res.json({
                reply: assistantKnowledgeService.PUBLIC_OUT_OF_SCOPE_RESPONSE,
                conversation_state: null
            });
        }

        // 8. Contrôle et consommation atomique du quota (5/h, 10/j par IP) UNIQUEMENT pour les appels réels au modèle
        const clientIp = aiQuotaService.getClientIp(req);
        const quotaResult = await aiQuotaService.enforceQuota({
            scope: 'public_ip',
            subjectIdentifier: clientIp,
            hourLimit: 5,
            dayLimit: 10
        });

        if (!quotaResult.allowed) {
            res.set('Retry-After', String(quotaResult.retryAfter));
            return res.status(quotaResult.status).json({
                error: getLocalizedErrorMessage(quotaResult.status, quotaResult.retryAfter, safeLang),
                retryAfter: quotaResult.retryAfter
            });
        }

        // 9. Construction du prompt système avec contexte public plafonné à 2 500 caractères
        const formattedKnowledge = assistantKnowledgeService.formatKnowledgeContext(knowledgeResult.entries);
        const systemPrompt = buildPublicSystemPrompt(safeLang, formattedKnowledge);

        // 10. Préparation de la requête au fournisseur IA : ISOLATION STRICTE DU TOUR COURANT
        // Exactement le message système serveur et la question utilisateur courante
        // Aucun ancien message brut du navigateur, aucun rôle assistant forgé par le client
        const groqMessages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: currentQuery.slice(0, 1000) }
        ];

        // 11. Appel au fournisseur IA
        let groq;
        try {
            groq = getClient();
        } catch (_e) {
            return res.status(503).json({
                error: getLocalizedErrorMessage(503, null, safeLang)
            });
        }

        const response = await groq.chat.completions.create({
            model: GROQ_MODEL,
            messages: groqMessages,
            temperature: 0.5,
            max_tokens: 1024,
        });

        // 12. Validation et assainissement de la sortie avant envoi
        let rawReply = response.choices[0]?.message?.content;
        if (typeof rawReply !== 'string' || !rawReply.trim()) {
            rawReply = getLocalizedErrorMessage(500, null, safeLang);
        }

        let sanitizedReply = rawReply
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
            .trim();

        if (sanitizedReply.length > 1500) {
            sanitizedReply = sanitizedReply.slice(0, 1500).trim() + '...';
        }

        // Rejet de fuite d'identifiants techniques de modèle ou variables internes
        const FORBIDDEN_LEAK_REGEX = /\b(groq-sdk|gpt-oss-20b|groq_api_key|openai\/gpt-oss|supabase_service_role|ai_quota_hash_secret)\b/i;
        if (FORBIDDEN_LEAK_REGEX.test(sanitizedReply)) {
            sanitizedReply = assistantKnowledgeService.PUBLIC_OUT_OF_SCOPE_RESPONSE;
        }

        return res.json({ reply: sanitizedReply });

    } catch (error) {
        console.error("Erreur technique avec l'assistant IA:", error.name || 'AI_ERROR');
        return res.status(500).json({
            error: getLocalizedErrorMessage(500, null, safeLang)
        });
    }
};

/**
 * Assistant privé (utilisateur connecté)
 * POST /api/assistant/private
 * POST /api/assistant/private-chat
 */
const chatWithPrivateAssistant = async (req, res) => {
    const { messages, context, language } = req.body || {};
    const safeLang = normalizeLanguage(language);

    try {
        const userRole = req.user?.role;
        const userId = req.user?.id;

        // Contrôle strict de l'identité canonique exclusive (req.user.id uniquement)
        if (!userId || typeof userId !== 'string' || !userId.trim()) {
            return res.status(401).json({
                error: getLocalizedErrorMessage(401, null, safeLang)
            });
        }

        // 1. Validation fail-closed des entrées utilisateur
        const validation = aiQuotaService.validateChatMessages(messages);
        if (!validation.isValid) {
            return res.status(400).json({
                error: getLocalizedErrorMessage(400, null, safeLang)
            });
        }

        // 2. Contrôle et consommation atomique du quota (30/j par compte)
        const quotaResult = await aiQuotaService.enforceQuota({
            scope: 'authenticated_user',
            subjectIdentifier: String(userId).trim(),
            hourLimit: null,
            dayLimit: 30
        });

        if (!quotaResult.allowed) {
            res.set('Retry-After', String(quotaResult.retryAfter));
            return res.status(quotaResult.status).json({
                error: getLocalizedErrorMessage(quotaResult.status, quotaResult.retryAfter, safeLang),
                retryAfter: quotaResult.retryAfter
            });
        }

        // 3. Traitement déterministe des demandes tarifaires (0 appel IA)
        if (detectGlobalPricingRequest(messages)) {
            return res.json({
                reply: "Les tarifs YZIOW sont adaptés au pays de chaque établissement. Je peux uniquement vous communiquer la grille applicable au pays de votre établissement.",
                conversation_state: null
            });
        }

        try {
            // Utilise exclusivement le pays officiel de l'école (req.user.schoolSlug)
            const pricingContext = await getAssistantPricingContext({
                authenticatedUser: req.user
            });
            const reply = buildCountryPricingResponse(pricingContext);
            return res.json({
                reply,
                conversation_state: null
            });
        } catch (pricingErr) {
            if (pricingErr.code === 'PRICING_NOT_CONFIGURED') {
                return res.json({
                    reply: "La grille tarifaire YZIOW n’est pas encore disponible pour votre pays. Notre équipe commerciale peut vous renseigner sur les prochaines disponibilités.",
                    conversation_state: null
                });
            }
            // Continue to AI assistant if not a pricing error
        }

        // 4. Appel Groq sécurisé pour les requêtes non-tarifaires
        let groq;
        try {
            groq = getClient();
        } catch (_e) {
            return res.status(503).json({
                error: getLocalizedErrorMessage(503, null, safeLang)
            });
        }

        const safeContext = (typeof context === 'string' && context.length <= 500) ? context.trim() : 'Non fourni';
        const systemPrompt = buildPrivateSystemPrompt(userRole, safeContext, safeLang);
        const history = formatHistory(messages);

        const response = await groq.chat.completions.create({
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                ...history
            ],
            temperature: 0.7,
            max_tokens: 1024,
        });

        const replyText = response.choices[0]?.message?.content || getLocalizedErrorMessage(500, null, safeLang);
        return res.json({ reply: replyText });

    } catch (error) {
        console.error("Erreur technique avec l'assistant privé:", error.name || 'AI_ERROR');
        return res.status(500).json({
            error: getLocalizedErrorMessage(500, null, safeLang)
        });
    }
};

/**
 * Génération de retours pédagogiques
 * POST /api/assistant/pedagogy
 * POST /api/assistant/pedagogical-feedback
 */
const generatePedagogicalFeedback = async (req, res) => {
    const { language } = req.body || {};
    const safeLang = normalizeLanguage(language);

    try {
        const userId = req.user?.id;
        if (!userId || typeof userId !== 'string' || !userId.trim()) {
            return res.status(401).json({
                error: getLocalizedErrorMessage(401, null, safeLang)
            });
        }

        // 1. Validation fail-closed des entrées utilisateur
        const validation = aiQuotaService.validatePedagogicalInput(req.body);
        if (!validation.isValid) {
            return res.status(400).json({
                error: getLocalizedErrorMessage(400, null, safeLang)
            });
        }

        // 2. Contrôle et consommation atomique du quota (60/j par compte)
        const quotaResult = await aiQuotaService.enforceQuota({
            scope: 'pedagogical_user',
            subjectIdentifier: String(userId).trim(),
            hourLimit: null,
            dayLimit: 60
        });

        if (!quotaResult.allowed) {
            res.set('Retry-After', String(quotaResult.retryAfter));
            return res.status(quotaResult.status).json({
                error: getLocalizedErrorMessage(quotaResult.status, quotaResult.retryAfter, safeLang),
                retryAfter: quotaResult.retryAfter
            });
        }

        // 3. Appel Groq sécurisé
        let groq;
        try {
            groq = getClient();
        } catch (_e) {
            return res.status(503).json({
                error: getLocalizedErrorMessage(503, null, safeLang)
            });
        }

        const { studentName, matiere, notes } = validation;
        const prompt = buildPedagogicalPrompt(studentName, matiere, notes, safeLang);

        const response = await groq.chat.completions.create({
            model: GROQ_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.4,
            max_tokens: 200,
        });

        return res.json({ appreciation: response.choices[0]?.message?.content?.trim() || "Bon travail dans l'ensemble." });
    } catch (error) {
        console.error('Erreur technique génération appréciation:', error.name || 'AI_ERROR');
        return res.status(500).json({
            error: getLocalizedErrorMessage(500, null, safeLang)
        });
    }
};

module.exports = {
    chatWithAssistant,
    chatWithPrivateAssistant,
    generatePedagogicalFeedback
};
// Export aiClient for test injection (allows mocking in unit tests)
module.exports.aiClient = null;
