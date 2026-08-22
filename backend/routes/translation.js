const router = require('express').Router();
const rateLimit = require('express-rate-limit');

// Simple bounded in-memory translation cache to avoid hitting MyMemory repeatedly for the same string
const serverCache = new Map();
const MAX_CACHE_SIZE = 1000;

function setInCache(key, value) {
    if (serverCache.size >= MAX_CACHE_SIZE) {
        // Supprime les 200 entrées les plus anciennes pour éviter la fuite mémoire
        const keysToDelete = Array.from(serverCache.keys()).slice(0, 200);
        for (const k of keysToDelete) {
            serverCache.delete(k);
        }
    }
    serverCache.set(key, value);
}

const translationLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    message: { error: 'Trop de requêtes de traduction, veuillez réessayer dans 1 minute.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/', translationLimiter, async (req, res) => {
    const { text, targetLanguage, sourceLanguage = 'fr' } = req.body;

    if (!text || !targetLanguage) {
        return res.status(400).json({ error: 'Champs requis: text, targetLanguage' });
    }

    if (typeof targetLanguage !== 'string' || targetLanguage.trim().length < 2 || targetLanguage.trim().length > 10) {
        return res.status(400).json({ error: 'Code langue cible invalide.' });
    }

    if (typeof sourceLanguage !== 'string' || sourceLanguage.trim().length < 2 || sourceLanguage.trim().length > 10) {
        return res.status(400).json({ error: 'Code langue source invalide.' });
    }

    // Validation et bornage de la taille du texte
    if (Array.isArray(text)) {
        if (text.length > 25) {
            return res.status(400).json({ error: 'Nombre maximal de textes par requête dépassé (max 25).' });
        }
        for (const item of text) {
            if (typeof item !== 'string' || item.length > 5000) {
                return res.status(400).json({ error: 'Chaque élément de texte doit être une chaîne de moins de 5000 caractères.' });
            }
        }
    } else if (typeof text !== 'string' || text.length > 5000) {
        return res.status(400).json({ error: 'Le texte doit être une chaîne de moins de 5000 caractères.' });
    }

    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

    try {
        if (apiKey) {
            // ── Google Cloud Translation API ──
            const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    q: Array.isArray(text) ? text : [text],
                    target: targetLanguage,
                    source: sourceLanguage
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Google API error: ${errText}`);
            }

            const data = await response.json();
            const translations = data.data.translations.map(t => t.translatedText);
            
            return res.json({
                translations: Array.isArray(text) ? translations : translations[0],
                provider: 'google'
            });
        } else {
            // ── Fallback: MyMemory API (Service de traduction gratuit) ──
            const textToTranslate = Array.isArray(text) ? text : [text];
            const translations = [];
            
            // Deduplication strategy
            const uniqueTexts = [...new Set(textToTranslate)];
            const translationMap = new Map();

            // Function to fetch with timeout
            const fetchWithTimeout = async (url, timeoutMs = 5000) => {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), timeoutMs);
                try {
                    const response = await fetch(url, { signal: controller.signal });
                    clearTimeout(id);
                    return response;
                } catch (err) {
                    clearTimeout(id);
                    throw err;
                }
            };

            // Process unique texts with a concurrency limit of 15
            const concurrencyLimit = 15;
            for (let i = 0; i < uniqueTexts.length; i += concurrencyLimit) {
                const chunk = uniqueTexts.slice(i, i + concurrencyLimit);
                
                await Promise.all(chunk.map(async (t) => {
                    const cacheKey = `${sourceLanguage}:${targetLanguage}:${t}`;
                    if (serverCache.has(cacheKey)) {
                        translationMap.set(t, serverCache.get(cacheKey));
                        return;
                    }

                    try {
                        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=${sourceLanguage}|${targetLanguage}&de=admin@yziow.com`;
                        const response = await fetchWithTimeout(url, 5000);
                        
                        if (response.ok) {
                            const data = await response.json();
                            if (data.responseData && data.responseData.translatedText) {
                                const translated = data.responseData.translatedText;
                                if (translated !== t && !translated.startsWith('MYMEMORY WARNING')) {
                                    translationMap.set(t, translated);
                                    setInCache(cacheKey, translated);
                                    return;
                                }
                            }
                        }
                    } catch (err) {
                        console.error(`[MyMemory API Error] for text "${t.substring(0, 15)}...":`, err.message);
                    }
                    
                    // Fallback ultime SANS préfixe (on renvoie le texte source)
                    translationMap.set(t, t);
                }));
            }

            // Reconstruct the array in original order
            for (const t of textToTranslate) {
                translations.push(translationMap.get(t));
            }

            return res.json({
                translations: Array.isArray(text) ? translations : translations[0],
                provider: 'mymemory'
            });
        }
    } catch (err) {
        console.error('❌ Erreur de traduction globale:', err.message);
        // Fallback ultime : renvoie le texte d'origine sans révéler d'erreur interne
        return res.json({
            translations: text,
            provider: 'fallback_error'
        });
    }
});

module.exports = router;
