import assert from 'node:assert';
import {
    prepareAssistantHistory,
    formatRetryAfterMessage,
    getAssistantErrorMessage,
    loadStoredAssistantHistory,
    saveStoredAssistantHistory,
    ASSISTANT_STORAGE_KEY
} from './assistantChatService.ts';

// Mock localStorage pour l'environnement de test
class MockLocalStorage implements Storage {
    private store = new Map<string, string>();

    get length(): number {
        return this.store.size;
    }

    key(index: number): string | null {
        return Array.from(this.store.keys())[index] || null;
    }

    getItem(key: string): string | null {
        return this.store.has(key) ? this.store.get(key)! : null;
    }

    setItem(key: string, value: string): void {
        this.store.set(key, String(value));
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }

    clear(): void {
        this.store.clear();
    }
}

console.log('--- Démarrage de la suite de tests frontend Assistant Yziow ---');

// 1. Réponse 429 avec Retry-After: 3600
{
    const msg = getAssistantErrorMessage(429, '3600');
    assert.strictEqual(msg, 'Vous avez atteint votre limite de questions. Veuillez réessayer dans 60 minute(s).');
    console.log('✅ Test 1: 429 avec Retry-After 3600 -> 60 minute(s)');
}

// 2. Réponse 429 avec Retry-After: 45
{
    const msg = getAssistantErrorMessage(429, 45);
    assert.strictEqual(msg, 'Vous avez atteint votre limite de questions. Veuillez réessayer dans 1 minute(s).');
    console.log('✅ Test 2: 429 avec Retry-After 45 -> 1 minute(s)');
}

// 3. Réponse 429 sans Retry-After
{
    const msgNone = getAssistantErrorMessage(429, null);
    assert.strictEqual(msgNone, 'Vous avez atteint votre limite de questions. Veuillez réessayer plus tard.');

    const msgInvalid = getAssistantErrorMessage(429, 'invalide');
    assert.strictEqual(msgInvalid, 'Vous avez atteint votre limite de questions. Veuillez réessayer plus tard.');

    const msgEmpty = getAssistantErrorMessage(429, '');
    assert.strictEqual(msgEmpty, 'Vous avez atteint votre limite de questions. Veuillez réessayer plus tard.');
    console.log('✅ Test 3: 429 sans Retry-After ou invalide -> Veuillez réessayer plus tard.');
}

// 4. Historique supérieur à 10 messages
{
    const manyMessages = [];
    for (let i = 1; i <= 25; i++) {
        manyMessages.push({
            sender: i % 2 === 0 ? 'bot' : 'user',
            text: `Message conversationnel numéro ${i}`
        });
    }
    const prepared = prepareAssistantHistory(manyMessages);
    assert.strictEqual(prepared.length, 10);
    assert.strictEqual(prepared[0].content, 'Message conversationnel numéro 16');
    assert.strictEqual(prepared[9].content, 'Message conversationnel numéro 25');
    console.log('✅ Test 4: Historique supérieur à 10 messages -> tronqué aux 10 derniers');
}

// 5. Historique localStorage corrompu
{
    const storage = new MockLocalStorage();
    storage.setItem('autre_cle_site', 'valeur_importante_conservee');
    storage.setItem(ASSISTANT_STORAGE_KEY, '{ json_totalement_invalide !!!');

    const loaded = loadStoredAssistantHistory(ASSISTANT_STORAGE_KEY, storage);
    assert.deepStrictEqual(loaded, []);
    assert.strictEqual(storage.getItem(ASSISTANT_STORAGE_KEY), null, 'La clé corrompue doit être purgée');
    assert.strictEqual(storage.getItem('autre_cle_site'), 'valeur_importante_conservee', 'Les autres clés ne doivent pas être affectées');
    console.log('✅ Test 5: localStorage corrompu nettoyé sans impacter les autres données du site');
}

// 6. Exclusion des messages système et des éléments sans texte
{
    const mixedMessages = [
        { role: 'system', text: 'System prompt secret' },
        { sender: 'admin', text: 'Message admin interne' },
        { sender: 'bot', text: '', options: [{ label: 'Option 1' }] },
        { sender: 'user', text: '   ' },
        { sender: 'user', text: 'Bonjour, pouvez-vous m\'aider ?' },
        { sender: 'bot', text: 'Bien sûr !' }
    ];

    const prepared = prepareAssistantHistory(mixedMessages);
    assert.strictEqual(prepared.length, 2);
    assert.strictEqual(prepared[0].role, 'user');
    assert.strictEqual(prepared[0].content, 'Bonjour, pouvez-vous m\'aider ?');
    assert.strictEqual(prepared[1].role, 'assistant');
    assert.strictEqual(prepared[1].content, 'Bien sûr !');
    console.log('✅ Test 6: Exclusion des rôles système, admin et messages vides/visuels');
}

// 7. Absence de doublon de la question actuelle
{
    const messages = [
        { sender: 'user', text: 'Quelle est la formule d\'abonnement ?' }
    ];
    const currentQuestion = 'Quelle est la formule d\'abonnement ?';

    const prepared = prepareAssistantHistory(messages, currentQuestion);
    assert.strictEqual(prepared.length, 1);
    assert.strictEqual(prepared[0].content, 'Quelle est la formule d\'abonnement ?');
    console.log('✅ Test 7: Absence de duplication de la question actuelle si déjà présente');
}

// 8. Conservation de la question actuelle dans les 10 derniers messages
{
    const fifteenMessages = [];
    for (let i = 1; i <= 15; i++) {
        fifteenMessages.push({
            sender: i % 2 === 0 ? 'bot' : 'user',
            text: `Historique ${i}`
        });
    }
    const currentQuestion = 'Dernière question urgente';
    const prepared = prepareAssistantHistory(fifteenMessages, currentQuestion);

    assert.strictEqual(prepared.length, 10);
    assert.strictEqual(prepared[prepared.length - 1].role, 'user');
    assert.strictEqual(prepared[prepared.length - 1].content, 'Dernière question urgente');
    console.log('✅ Test 8: Conservation de la question actuelle dans les 10 derniers messages');
}

// 9. Réponse HTTP 400
{
    const msg = getAssistantErrorMessage(400);
    assert.strictEqual(msg, 'Votre message ou l’historique de la conversation n’est pas valide. Veuillez recommencer.');
    console.log('✅ Test 9: HTTP 400 -> Message clair de recommencement sans détail technique');
}

// 10. Réponse HTTP 503
{
    const msg = getAssistantErrorMessage(503);
    assert.strictEqual(msg, 'L’assistant est temporairement indisponible. Veuillez réessayer plus tard.');
    console.log('✅ Test 10: HTTP 503 -> Message clair d’indisponibilité temporaire');
}

// 11. Autres erreurs (500, réseau)
{
    const msg500 = getAssistantErrorMessage(500);
    assert.strictEqual(msg500, 'Une erreur est survenue. Veuillez réessayer plus tard.');
    console.log('✅ Test 11: Erreur 500 / inconnue -> Message générique sécurisé');
}

// 12. Sécurité : Aucune fuite d'information technique
{
    const testCases = [
        getAssistantErrorMessage(429, '60'),
        getAssistantErrorMessage(429, null),
        getAssistantErrorMessage(400),
        getAssistantErrorMessage(503),
        getAssistantErrorMessage(500)
    ];

    const forbiddenStrings = ['AI_QUOTA', 'AI_USER_QUOTA_EXCEEDED', '127.0.0.1', 'hash', 'secret', 'PostgreSQL', 'RPC'];
    for (const msg of testCases) {
        for (const forbidden of forbiddenStrings) {
            assert.ok(!msg.includes(forbidden), `Le message utilisateur contient un détail interdit: ${forbidden}`);
        }
    }
    console.log('✅ Test 12: Aucune information technique ni code interne divulgué');
}

console.log('--- Tous les tests frontend Assistant Yziow ont réussi avec succès ! ---');
