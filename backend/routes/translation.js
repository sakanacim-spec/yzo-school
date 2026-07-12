const router = require('express').Router();

// Simple in-memory translation cache to avoid hitting MyMemory repeatedly for the same string during high load
const serverCache = new Map();

router.post('/', async (req, res) => {
    const { text, targetLanguage, sourceLanguage = 'fr' } = req.body;

    if (!text || !targetLanguage) {
        return res.status(400).json({ error: 'Champs requis: text, targetLanguage' });
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

            // Process unique texts with a basic concurrency limit of 3
            const concurrencyLimit = 3;
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
                                // Validate MyMemory didn't return an error disguised as a translation
                                const translated = data.responseData.translatedText;
                                if (translated !== t && !translated.startsWith('MYMEMORY WARNING')) {
                                    translationMap.set(t, translated);
                                    serverCache.set(cacheKey, translated);
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
                
                // Small delay between chunks to avoid hitting absolute rate limits too fast
                if (i + concurrencyLimit < uniqueTexts.length) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
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
        // Fallback ultime : renvoie le texte d'origine
        return res.json({
            translations: text,
            provider: 'fallback_error',
            error: err.message
        });
    }
});

module.exports = router;
