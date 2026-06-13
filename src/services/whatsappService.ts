// ============================================================
// WHATSAPP SERVICE — Envoi direct (Background API)
// ============================================================

import { BACKEND_URL } from '../config';
import { getAuthHeaders } from './apiHelpers';

/**
 * Envoie une notification WhatsApp via une API backend payante ou un gateway.
 * Contrairement à sendWhatsApp (wa.me), cette fonction s'exécute en arrière-plan
 * sans ouvrir de nouvel onglet ou de fenêtre.
 */
export async function sendDirectNotification(phone: string, message: string): Promise<boolean> {
    try {
        // Option A: Envoyer via votre propre backend (qui appelle l'API payante)
        const response = await fetch(`${BACKEND_URL}/api/whatsapp/send`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ phone, message })
        });

        if (response.ok) {
            console.log('✅ WhatsApp notification sent successfully');
            return true;
        } else {
            console.warn('⚠️ Direct WhatsApp notification failed:', response.status);
            return false;
        }
    } catch (err) {
        // En cas d'erreur API, on peut revenir sur wa.me si vraiment nécessaire ou juste logger
        console.error('⚠️ WhatsApp direct API error:', err);
        return false;
    }
}
