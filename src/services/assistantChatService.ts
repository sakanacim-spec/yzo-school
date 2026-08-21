/**
 * Service et utilitaires pour l'Assistant Yziow (Frontend)
 * Gestion stricte de l'historique, normalisation localStorage, quotas 429, statuts HTTP 400/503 et i18n 9 langues.
 */

import type { AssistantLanguage } from './assistantLocale.ts';
import { normalizeAssistantLanguage } from './assistantLocale.ts';
import { getAssistantTranslations } from './assistantTranslations.ts';

export interface RawMessage {
    id?: string;
    sender?: string;
    role?: string;
    text?: string;
    content?: string;
    options?: any;
    [key: string]: any;
}

export interface PreparedChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface ChatMessageItem {
    id: string;
    sender: 'user' | 'bot';
    text: string;
    options?: { label: string; action: () => void; icon?: any }[];
}

export const ASSISTANT_STORAGE_KEY = 'yziow_assistant_chat_history';

/**
 * Normalise strictement l'expéditeur ou le rôle :
 * - utilisateur -> 'user'
 * - bot / assistant -> 'assistant'
 * - tout autre rôle -> null (rejeté)
 */
export function normalizeSender(senderOrRole?: string | null): 'user' | 'assistant' | null {
    if (!senderOrRole || typeof senderOrRole !== 'string') {
        return null;
    }
    const normalized = senderOrRole.trim().toLowerCase();
    if (normalized === 'user') {
        return 'user';
    }
    if (normalized === 'bot' || normalized === 'assistant') {
        return 'assistant';
    }
    return null;
}

/**
 * Extrait et nettoie le texte d'un message
 */
export function extractMessageText(msg: RawMessage): string {
    if (!msg || typeof msg !== 'object') {
        return '';
    }
    const rawText = msg.text !== undefined ? msg.text : msg.content;
    if (typeof rawText !== 'string') {
        return '';
    }
    return rawText.trim();
}

/**
 * Prépare l'historique conversationnel pour le backend :
 * - Accepte uniquement les messages conversationnels valides (texte non vide)
 * - Exclut menus, boutons, suggestions, messages système ou éléments sans texte
 * - Limite chaque contenu à 1 000 caractères maximum
 * - Mappe strictement les rôles (user / assistant) et rejette tout autre rôle
 * - Conserve la question actuelle dans les 10 derniers messages sans doublon
 * - Conserve au maximum les 10 derniers messages
 */
export function prepareAssistantHistory(
    messages: RawMessage[],
    currentQuestion?: string
): PreparedChatMessage[] {
    const validMessages: PreparedChatMessage[] = [];

    if (Array.isArray(messages)) {
        for (const msg of messages) {
            if (!msg || typeof msg !== 'object') continue;

            const role = normalizeSender(msg.sender || msg.role);
            if (!role) {
                // Rejette tout autre rôle (ex: system, admin, etc.)
                continue;
            }

            const rawText = extractMessageText(msg);
            if (!rawText) {
                // Exclut les messages vides ou purement visuels / menus sans texte
                continue;
            }

            // Limite à 1000 caractères max
            const content = rawText.slice(0, 1000);

            validMessages.push({
                role,
                content
            });
        }
    }

    // Gestion de la question actuelle
    if (typeof currentQuestion === 'string') {
        const trimmedQuestion = currentQuestion.trim().slice(0, 1000);
        if (trimmedQuestion.length > 0) {
            const lastMsg = validMessages[validMessages.length - 1];
            const isAlreadyLast = lastMsg && lastMsg.role === 'user' && lastMsg.content === trimmedQuestion;
            if (!isAlreadyLast) {
                validMessages.push({
                    role: 'user',
                    content: trimmedQuestion
                });
            }
        }
    }

    // Ne conserver que les 10 derniers messages conversationnels
    return validMessages.slice(-10);
}

/**
 * Formate le message pour HTTP 429 avec Retry-After et support multi-langue
 */
export function formatRetryAfterMessage(
    retryAfter?: string | number | null,
    targetLang?: string | null
): string {
    const t = getAssistantTranslations(targetLang);

    if (retryAfter === undefined || retryAfter === null || retryAfter === '') {
        return t.error429Generic;
    }

    const seconds = typeof retryAfter === 'number' ? retryAfter : Number(String(retryAfter).trim());

    if (!Number.isFinite(seconds) || seconds <= 0) {
        return t.error429Generic;
    }

    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return t.error429WithMinutes(minutes);
}

/**
 * Fournit un message d'erreur utilisateur sécurisé selon le code de statut HTTP et la langue
 * Ne divulgue aucun code interne, secret ou détail technique.
 */
export function getAssistantErrorMessage(
    status: number,
    retryAfter?: string | number | null,
    targetLang?: string | null
): string {
    const t = getAssistantTranslations(targetLang);

    if (status === 429) {
        return formatRetryAfterMessage(retryAfter, targetLang);
    }
    if (status === 400) {
        return t.error400;
    }
    if (status === 401) {
        return t.error401;
    }
    if (status === 503) {
        return t.error503;
    }
    return t.error500;
}

/**
 * Charge, valide et normalise l'historique depuis localStorage
 * Supprime proprement la clé sans toucher au reste de localStorage en cas de corruption JSON.
 */
export function loadStoredAssistantHistory(
    storageKey = ASSISTANT_STORAGE_KEY,
    storage: Storage | null = typeof window !== 'undefined' ? window.localStorage : null
): ChatMessageItem[] {
    if (!storage) {
        return [];
    }

    let raw: string | null = null;
    try {
        raw = storage.getItem(storageKey);
    } catch {
        return [];
    }

    if (!raw) {
        return [];
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        // Données JSON corrompues : suppression propre sans impacter les autres clés
        try {
            storage.removeItem(storageKey);
        } catch {
            // ignore
        }
        return [];
    }

    if (!Array.isArray(parsed)) {
        try {
            storage.removeItem(storageKey);
        } catch {
            // ignore
        }
        return [];
    }

    const validItems: ChatMessageItem[] = [];

    for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;

        const role = normalizeSender((item as any).sender || (item as any).role);
        if (!role) continue;

        const rawText = extractMessageText(item as RawMessage);
        if (!rawText) continue;

        const id = typeof (item as any).id === 'string' && (item as any).id.trim()
            ? (item as any).id
            : Date.now().toString() + Math.random().toString(36).substring(2, 6);

        validItems.push({
            id,
            sender: role === 'user' ? 'user' : 'bot',
            text: rawText.slice(0, 1000)
        });
    }

    // Tronquer aux 10 derniers messages valides
    return validItems.slice(-10);
}

/**
 * Sauvegarde l'historique normalisé dans localStorage (max 10 messages valides)
 */
export function saveStoredAssistantHistory(
    messages: (RawMessage | ChatMessageItem)[],
    storageKey = ASSISTANT_STORAGE_KEY,
    storage: Storage | null = typeof window !== 'undefined' ? window.localStorage : null
): void {
    if (!storage) {
        return;
    }

    const validItems: ChatMessageItem[] = [];

    for (const item of messages) {
        if (!item || typeof item !== 'object') continue;

        const role = normalizeSender((item as any).sender || (item as any).role);
        if (!role) continue;

        const rawText = extractMessageText(item as RawMessage);
        if (!rawText) continue;

        const id = typeof (item as any).id === 'string' && (item as any).id.trim()
            ? (item as any).id
            : Date.now().toString() + Math.random().toString(36).substring(2, 6);

        validItems.push({
            id,
            sender: role === 'user' ? 'user' : 'bot',
            text: rawText.slice(0, 1000)
        });
    }

    const truncated = validItems.slice(-10);

    try {
        storage.setItem(storageKey, JSON.stringify(truncated));
    } catch {
        // En cas de dépassement de quota localStorage, fail-safe sans bloquer l'interface
    }
}
