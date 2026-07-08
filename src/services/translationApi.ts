import { API_BASE_URL } from '../config';

export const translationApi = {
    translate: async (text: string | string[], targetLanguage: string, sourceLanguage = 'fr'): Promise<string | string[]> => {
        try {
            const res = await fetch(`${API_BASE_URL}/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, targetLanguage, sourceLanguage })
            });
            if (!res.ok) {
                throw new Error('Failed to translate text');
            }
            const data = await res.json();
            return data.translations;
        } catch (err) {
            console.error('Translation API call failed:', err);
            return text;
        }
    }
};
