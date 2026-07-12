export const translationApi = {
    translate: async (text: string | string[], targetLanguage: string, sourceLanguage = 'fr'): Promise<string | string[]> => {
        const isArray = Array.isArray(text);
        const texts = isArray ? text : [text];
        const results: string[] = new Array(texts.length);
        
        const fetchTranslation = async (currentText: string, index: number) => {
            if (!currentText || currentText.trim() === '') {
                results[index] = currentText;
                return;
            }
            try {
                // Appel direct et ultra-rapide à l'API Google Translate depuis le frontend (sans passer par un backend inexistant)
                const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLanguage}&tl=${targetLanguage}&dt=t&q=${encodeURIComponent(currentText)}`;
                const res = await fetch(url);
                
                if (!res.ok) throw new Error('HTTP error ' + res.status);
                const data = await res.json();
                
                if (data && data[0] && data[0].length > 0) {
                    // Recomposer la traduction complète (si le texte contenait des sauts de ligne)
                    let fullTranslation = '';
                    for (let i = 0; i < data[0].length; i++) {
                        if (data[0][i][0]) fullTranslation += data[0][i][0];
                    }
                    results[index] = fullTranslation;
                } else {
                    results[index] = currentText;
                }
            } catch (err) {
                console.error(`❌ Erreur API Google Translate pour le texte "${currentText}":`, err);
                results[index] = currentText; // Fallback sécurisé
            }
        };

        // Traitement par lots (chunks de 10) pour ne pas saturer le navigateur
        const chunkSize = 10;
        for (let i = 0; i < texts.length; i += chunkSize) {
            const chunk = texts.slice(i, i + chunkSize);
            await Promise.all(chunk.map((txt, idx) => fetchTranslation(txt, i + idx)));
        }
        
        return isArray ? results : results[0];
    }
};
