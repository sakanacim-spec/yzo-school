const router = require('express').Router();

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

            for (const t of textToTranslate) {
                const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=${sourceLanguage}|${targetLanguage}`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data.responseData && data.responseData.translatedText) {
                        translations.push(data.responseData.translatedText);
                        continue;
                    }
                }
                // Mock fallback si MyMemory échoue
                translations.push(`[${targetLanguage}] ${t}`);
            }

            return res.json({
                translations: Array.isArray(text) ? translations : translations[0],
                provider: 'mymemory'
            });
        }
    } catch (err) {
        console.error('❌ Erreur de traduction:', err.message);
        // Fallback ultime : renvoie le texte d'origine pour éviter tout crash de l'interface
        return res.json({
            translations: text,
            provider: 'fallback_error',
            error: err.message
        });
    }
});

module.exports = router;
