// ============================================================
// NOTIFICATION SERVICE — Push Notifications
// ============================================================

import { API_BASE_URL } from '../config';
import { getAuthHeaders } from './apiHelpers';

export const notificationService = {
    /**
     * Envoie une notification push aux parents liés à un élève.
     */
    notifyParents: async (studentId: string, message: string): Promise<boolean> => {
        try {
            const res = await fetch(`${API_BASE_URL}/notifications/send`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ studentId, message })
            });

            if (res.ok) {
                console.log('✅ Push notification sent to parents');
                return true;
            }
            return false;
        } catch (err) {
            console.error('❌ Push notification error:', err);
            return false;
        }
    },

    /**
     * Vérifie si un élève a des parents liés sur le cloud.
     */
    checkStudentLink: async (studentId: string): Promise<boolean> => {
        try {
            const res = await fetch(`${API_BASE_URL}/students/has-link/${studentId}`, {
                headers: getAuthHeaders()
            });
            if (res.ok) {
                const data = await res.json();
                return !!data.hasLink;
            }
            return false;
        } catch (err) {
            console.error('❌ Check link error:', err);
            return false;
        }
    }
};
