'use strict';
const Groq = require('groq-sdk');
const {
    getClientIp,
    validateChatMessages,
    validatePedagogicalInput,
    enforceQuota
} = require('../utils/aiQuotaService');
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
    buildCountryPricingResponse
} = require('../services/assistantPricingContextService');

let aiClient = null;

const getClient = () => {
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

    try {
        // 1. Validation fail-closed des entrées utilisateur
        const validation = validateChatMessages(messages);
        if (!validation.isValid) {
            return res.status(400).json({
                error: getLocalizedErrorMessage(400, null, safeLang)
            });
        }

        // 2. Contrôle et consommation atomique du quota (5/h, 10/j par IP)
        const clientIp = getClientIp(req);
        const quotaResult = await enforceQuota({
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

        // 3. Traitement déterministe des demandes tarifaires (0 appel IA)
        if (detectGlobalPricingRequest(messages)) {
            return res.json({
                reply: "Les tarifs YZIOW sont adaptés au pays de chaque établissement. Je peux uniquement vous communiquer la grille applicable au pays de votre établissement."
            });
        }

        if (detectPricingIntent(messages)) {
            const guestCountry = extractGuestCountry(messages, req.body?.countryCode || req.body?.country);
            if (!guestCountry) {
                return res.json({
                    reply: "Pour vous communiquer les tarifs exacts d'YZIOW, veuillez préciser le pays de votre établissement."
                });
            }

            try {
                const pricingContext = await getAssistantPricingContext({
                    requestedCountryCode: guestCountry
                });
                const reply = buildCountryPricingResponse(pricingContext);
                return res.json({ reply });
            } catch (pricingErr) {
                if (pricingErr.code === 'COUNTRY_REQUIRED') {
                    return res.json({
                        reply: "Pour vous communiquer les tarifs exacts d'YZIOW, veuillez préciser le pays de votre établissement."
                    });
                }
                if (pricingErr.code === 'PRICING_NOT_CONFIGURED') {
                    return res.json({
                        reply: "Aucune grille tarifaire n'est actuellement configurée pour ce pays. Veuillez contacter notre équipe commerciale."
                    });
                }
                return res.json({
                    reply: "Une indisponibilité temporaire empêche la consultation de la grille tarifaire. Veuillez réessayer ultérieurement."
                });
            }
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

        const history = formatHistory(messages);
        const systemPrompt = buildPublicSystemPrompt(safeLang);

        const response = await groq.chat.completions.create({
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                ...history
            ],
            temperature: 0.5,
            max_tokens: 1024,
        });

        const replyText = response.choices[0]?.message?.content || getLocalizedErrorMessage(500, null, safeLang);
        return res.json({ reply: replyText });

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
        const validation = validateChatMessages(messages);
        if (!validation.isValid) {
            return res.status(400).json({
                error: getLocalizedErrorMessage(400, null, safeLang)
            });
        }

        // 2. Contrôle et consommation atomique du quota (30/j par compte)
        const quotaResult = await enforceQuota({
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
                reply: "Les tarifs YZIOW sont adaptés au pays de chaque établissement. Je peux uniquement vous communiquer la grille applicable au pays de votre établissement."
            });
        }

        if (detectPricingIntent(messages)) {
            try {
                // Utilise exclusivement le pays officiel de l'école (req.user.schoolSlug)
                const pricingContext = await getAssistantPricingContext({
                    authenticatedUser: req.user
                });
                const reply = buildCountryPricingResponse(pricingContext);
                return res.json({ reply });
            } catch (pricingErr) {
                if (pricingErr.code === 'PRICING_NOT_CONFIGURED') {
                    return res.json({
                        reply: "Aucune grille tarifaire n'est actuellement configurée pour votre établissement. Veuillez contacter notre équipe commerciale."
                    });
                }
                return res.json({
                    reply: "Une indisponibilité temporaire empêche la consultation de la grille tarifaire. Veuillez réessayer ultérieurement."
                });
            }
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
        const validation = validatePedagogicalInput(req.body);
        if (!validation.isValid) {
            return res.status(400).json({
                error: getLocalizedErrorMessage(400, null, safeLang)
            });
        }

        // 2. Contrôle et consommation atomique du quota (60/j par compte)
        const quotaResult = await enforceQuota({
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
