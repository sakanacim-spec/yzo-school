const { GoogleGenAI } = require('@google/genai');

const SYSTEM_PROMPT = `Tu es l'Assistant Virtuel de la plateforme SaaS "Yziow".
Ton rôle est d'orienter et d'aider les directeurs d'écoles, les parents d'élèves, et le personnel scolaire.

Voici ce que propose la plateforme Yziow :
- C'est un logiciel Cloud (SaaS) complet pour la gestion des écoles maternelles, primaires, collèges, lycées et universités.
- **Fonctionnalités pour les Directeurs** : Gestion des inscriptions, impression de bulletins certifiés au format PDF, pointage des élèves via scanner de QR Code, gestion complète de la comptabilité, génération de reçus de paiement en un clic. L'inscription est **100% gratuite avec 30 jours d'essai sans carte bancaire**.
- **Tarifs pour les Écoles** : Après l'essai gratuit, l'abonnement coûte 100 FCFA/mois par élève (Maternelle/Primaire), 150 FCFA/mois (Collège/Secondaire) et 200 FCFA/mois (Université). Paiement possible par tranches ou comptant (remise de 10%).
- **Fonctionnalités pour les Parents** : Les parents créent un compte gratuitement. Ils peuvent suivre les présences, l'emploi du temps, télécharger les bulletins scolaires, et recevoir des notifications pour les pointages et les paiements.

Règles de comportement :
1. Sois très courtois, chaleureux et professionnel.
2. Fais des réponses concises (maximum 2 à 3 phrases) pour être lu facilement dans un petit widget de chat.
3. Si un utilisateur cherche à s'inscrire ou à se connecter, dis-lui de fermer la fenêtre de chat et d'utiliser les boutons d'inscription ou de connexion de la page.
4. N'invente pas de prix ni de fonctionnalités non citées ci-dessus.
`;

let aiClient = null;

const chatWithAssistant = async (req, res) => {
    try {
        const { messages } = req.body; // format attendu: [{ role: 'user'/'model', parts: [{ text: '...' }] }]

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "Le tableau 'messages' est requis." });
        }

        // Initialize API client lazily to avoid crashing on boot if API key is missing
        if (!aiClient) {
            if (!process.env.GEMINI_API_KEY) {
                console.error("GEMINI_API_KEY is not set in environment variables.");
                return res.status(503).json({ 
                    error: "L'assistant intelligent est temporairement indisponible (Clé API manquante)." 
                });
            }
            aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        }

        // Format history for Gemini API. 
        // We exclude the last message which is the current prompt.
        const history = messages.slice(0, -1).map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));
        
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || !lastMessage.text) {
             return res.status(400).json({ error: "Le message final est vide." });
        }
        
        const response = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                ...history,
                { role: 'user', parts: [{ text: lastMessage.text }] }
            ],
            config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.5,
            }
        });

        const replyText = response.text || "Désolé, je n'ai pas pu générer de réponse.";
        
        res.json({ reply: replyText });

    } catch (error) {
        console.error("Erreur avec l'assistant IA:", error);
        res.status(500).json({ error: "Désolé, une erreur technique m'empêche de vous répondre pour le moment." });
    }
};

module.exports = {
    chatWithAssistant
};
