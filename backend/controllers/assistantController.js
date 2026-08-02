const Groq = require("groq-sdk");

const SYSTEM_PROMPT = `Tu es l'Assistant Virtuel de la plateforme SaaS "Yziow".
Ton rôle est d'orienter et d'aider les directeurs d'écoles, les parents d'élèves, et le personnel scolaire.

Voici ce que propose la plateforme Yziow :
- C'est un logiciel Cloud (SaaS) complet pour la gestion des écoles maternelles, primaires, collèges, lycées et universités.
- **Fonctionnalités pour les Directeurs** : Gestion des inscriptions, impression de bulletins certifiés au format PDF, pointage des élèves via scanner de QR Code, gestion complète de la comptabilité, reçus de paiement en un clic, et un module intégré de "Levée de Fonds & Dons" (Crowdfunding) avec paiements internationaux via FedaPay (commission fixe de 5%). L'inscription est **100% gratuite avec 14 jours d'essai sans carte bancaire**.
- **Tarifs pour les Écoles** : Après l'essai gratuit, l'abonnement coûte 100 FCFA/mois par élève (Maternelle/Primaire), 150 FCFA/mois (Collège/Secondaire) et 200 FCFA/mois (Université). Paiement possible par tranches ou comptant (remise de 10%).
- **Fonctionnalités pour les Parents** : Les parents créent un compte gratuitement. Ils peuvent suivre les présences, l'emploi du temps, télécharger les bulletins scolaires, payer en ligne, recevoir des notifications, et participer aux campagnes de dons lancées par l'école directement depuis leur tableau de bord.

Règles de comportement (TRÈS IMPORTANT) :
1. Sois très courtois, chaleureux et professionnel.
2. Fais des réponses concises (maximum 2 à 3 phrases) pour être lu facilement dans un petit widget de chat.
3. Si un utilisateur cherche à s'inscrire ou à se connecter, dis-lui d'utiliser les boutons d'inscription ou de connexion de la page.
4. N'INVENTE RIEN. Ne mentionne AUCUN pourcentage, AUCUN frais, AUCUNE commission ni fonctionnalité qui n'est pas strictement écrite ci-dessus. La commission sur les dons est EXACTEMENT de 5%, ne parle jamais de 1,5% ou de 0,5% ou de répartition par catégories.
`;

let aiClient = null;

const getClient = () => {
    if (!aiClient) {
        if (!process.env.GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY is missing");
        }
        aiClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return aiClient;
};

const formatHistory = (messages) => {
    return messages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text || ""
    }));
};

const chatWithAssistant = async (req, res) => {
    try {
        const { messages, language = 'fr' } = req.body; 

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "Le tableau 'messages' est requis." });
        }

        let groq;
        try {
            groq = getClient();
        } catch(e) {
            return res.status(503).json({ error: "L'assistant intelligent est temporairement indisponible (Clé API manquante)." });
        }
        
        const history = formatHistory(messages);
        const dynamicPrompt = `${SYSTEM_PROMPT}\n\nIMPORTANT: L'utilisateur utilise actuellement l'interface dans la langue '${language}'. Tu dois OBLIGATOIREMENT formuler toutes tes réponses dans cette langue, tout en gardant un ton naturel et courtois.`;

        const response = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
                { role: "system", content: dynamicPrompt },
                ...history
            ],
            temperature: 0.5,
            max_tokens: 1024,
        });

        const replyText = response.choices[0]?.message?.content || "Désolé, je n'ai pas pu générer de réponse.";
        
        res.json({ reply: replyText });

    } catch (error) {
        console.error("Erreur avec l'assistant IA:", error);
        res.status(500).json({ error: "Désolé, une erreur technique m'empêche de vous répondre pour le moment." });
    }
};

const chatWithPrivateAssistant = async (req, res) => {
    try {
        const { messages, context } = req.body;
        const userRole = req.user.role; 

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "Le tableau 'messages' est requis." });
        }

        let groq;
        try {
            groq = getClient();
        } catch(e) {
             return res.status(503).json({ error: "Clé API Groq manquante." });
        }

        let systemInstruction = "";
        if (userRole === 'superadmin') {
            systemInstruction = `Tu es le conseiller stratégique exclusif du SuperAdmin (Propriétaire de Yziow).
            Contexte global : ${context || 'Non fourni'}
            Règles : 
            1. Propose des stratégies pour maximiser les revenus SaaS (abonnements et commission de 5% sur les collectes de dons).
            2. Garde un ton professionnel, analytique et direct.
            3. Rédige des réponses concises.
            4. N'invente pas de taux de commission. La commission Yziow sur les dons est strictement de 5% via FedaPay.`;
        } else if (['admin', 'directeur', 'directeur_general', 'comptable'].includes(userRole)) {
            systemInstruction = `Tu es l'assistant personnel de gestion pour la direction de l'école.
            Contexte de l'école : ${context || 'Non fourni'}
            Règles : 
            1. Aide à comprendre les finances, rédiger des lettres aux parents (relance de paiement, réunions).
            2. Ton ton doit être très professionnel et encourageant.
            3. Les modèles de textes (ex: SMS) doivent être courts et prêts à envoyer.
            4. Yziow propose un module de "Levée de Fonds & Dons" avec une commission FIXE de 5% par paiement FedaPay.
            5. N'INVENTE RIEN. Ne mentionne jamais d'autres pourcentages (ni 1,5%, ni 0,5%) ni de fonctionnalités non spécifiées.
            6. ADAPTE-TOI AU CONTEXTE : Si l'utilisateur pose une question floue (ex: "comment ça marche?"), utilise la "page" actuelle mentionnée dans ton Contexte pour deviner de quelle fonctionnalité il parle (ex: s'il est sur /dons, explique les dons).`;
        } else if (userRole === 'parent') {
            systemInstruction = `Tu es un tuteur et assistant pour les parents d'élèves sur Yziow.
            Contexte : ${context || 'Non fourni'}
            Règles : 
            1. Aide les parents à comprendre les notes de leurs enfants, donne des astuces de révision.
            2. Sois extrêmement bienveillant et rassurant.
            3. Rédige des réponses simples et courtes.
            4. Si le parent pose des questions sur les dons ou collectes de fonds de l'école, explique-lui qu'il peut faire un don depuis son tableau de bord de manière sécurisée. N'invente pas de taux ni de frais.`;
        } else {
            systemInstruction = `Tu es un assistant pédagogique pour le personnel de l'école (Professeur, Surveillant).
            Contexte : ${context || 'Non fourni'}
            Règles : 
            1. Aide à concevoir des plans de cours, des devoirs, ou à analyser le comportement des élèves.
            2. Fournis des astuces d'enseignement concrètes et bienveillantes.`;
        }

        const history = formatHistory(messages);

        const response = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
                { role: "system", content: systemInstruction },
                ...history
            ],
            temperature: 0.7,
            max_tokens: 1024,
        });

        res.json({ reply: response.choices[0]?.message?.content || "Désolé, aucune réponse générée." });
    } catch (error) {
        console.error("Erreur avec l'assistant privé:", error);
        res.status(500).json({ error: "Erreur technique de l'assistant privé." });
    }
};

const generatePedagogicalFeedback = async (req, res) => {
    try {
        const { studentName, matiere, notes } = req.body;
        
        let groq;
        try {
            groq = getClient();
        } catch(e) {
             return res.status(503).json({ error: "Clé API Groq manquante." });
        }

        const prompt = `Génère une appréciation de bulletin scolaire très courte (1 ou 2 phrases maximum) pour l'élève ${studentName} dans la matière "${matiere}". 
        Voici ses notes récentes : ${notes.join(', ')}. 
        L'appréciation doit être professionnelle, encourageante si les notes sont basses, ou félicitante si elles sont hautes. Ne dis pas "Bonjour", donne uniquement le texte de l'appréciation directement exploitable sur un bulletin.`;

        const response = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.4,
            max_tokens: 200,
        });

        res.json({ appreciation: response.choices[0]?.message?.content?.trim() || "Bon travail dans l'ensemble." });
    } catch (error) {
        console.error("Erreur génération appréciation:", error);
        res.status(500).json({ error: "Erreur lors de la génération de l'appréciation." });
    }
};

module.exports = {
    chatWithAssistant,
    chatWithPrivateAssistant,
    generatePedagogicalFeedback
};
