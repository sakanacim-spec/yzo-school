// ============================================================
// UTILITAIRE — Synchronisation Frontend → Backend
// À appeler depuis le frontend React/Zustand
// ============================================================

import { BACKEND_URL } from '../config';
import { getAuthHeaders } from './apiHelpers';

import { AppState } from '../store/useStore';

/**
 * Synchronise les données du store Zustand vers le backend Supabase.
 * Appeler cette fonction depuis l'application React.
 *
 * @param {AppState} store - L'état complet du store Zustand
 * @param {boolean} replace - Si vrai, vide la base avant d'insérer
 * @returns {Promise<any>} - Résultat de la sync
 */
export async function syncToBackend(store: Partial<AppState>, replace: boolean = false) {
    // 🛡️ Sécurité SaaS : Les parents n'ont pas accès à l'API /sync (réservée admin)
    // On vérifie le rôle pour éviter les erreurs 403 persistantes dans le dashboard parent
    const currentUser = (store as any).user || null;
    if (currentUser?.role === 'parent') {
        // console.log('👤 [Sync] Skip sync for parent (restricted endpoint)');
        return null;
    }

    const payload: any = { replace };
    
    // N'inclure que les champs fournis dans l'objet store pour éviter d'envoyer des tableaux vides par erreur
    if (store.students !== undefined) payload.students = store.students;
    if (store.parents !== undefined) payload.parents = store.parents;
    if (store.presences !== undefined) payload.presences = store.presences;
    if (store.activityLogs !== undefined) payload.activityLogs = store.activityLogs;
    if (store.announcements !== undefined) payload.announcements = store.announcements;
    if (store.announcementReads !== undefined) payload.announcementReads = store.announcementReads;
    if (store.matieres !== undefined) payload.matieres = store.matieres;
    if (store.classeMatieres !== undefined) payload.classeMatieres = store.classeMatieres;
    if (store.notes !== undefined) payload.notes = store.notes;

    const { 
        appName, schoolName, schoolYear, 
        messageRemerciement, messageRappel, 
        schoolLogo, schoolStamp, cycleSchedules, tranches 
    } = store;
    
    // Si l'un des paramètres de configuration est fourni, on envoie appSettings
    if (appName !== undefined || schoolName !== undefined || schoolLogo !== undefined || schoolStamp !== undefined || cycleSchedules !== undefined || tranches !== undefined) {
        payload.appSettings = {
            appName,
            schoolName,
            schoolYear,
            messageRemerciement,
            messageRappel,
            schoolLogo,
            schoolStamp,
            cycleSchedules,
            tranches
        };
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/sync`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload),
        });

        // read text first so we can fall back if it's not JSON
        const text = await response.text();

        // If response is empty, server is likely down
        if (!text) {
            console.warn('⚠️ Sync: empty response from backend');
            return null;
        }

        let result: any;
        try {
            result = JSON.parse(text);
        } catch (parseErr) {
            // Response is not JSON (HTML error page, nginx error, etc)
            const preview = text.substring(0, 150).replace(/\n/g, ' ');
            console.warn('⚠️ Sync: non-JSON response:', `[${response.status}]`, preview);
            return null;
        }

        if (!response.ok) {
            const errorMsg = result?.error || result?.message || 'Unknown sync error';
            console.warn('⚠️ Sync failed:', `[${response.status}]`, errorMsg);
            return null;
        }

        if (payload.appSettings) {
            console.log('✅ Settings Sync: SUCCESS');
        } else {
            console.log('✅ Data Sync successful:', result.count || 0, 'students synced');
        }
        return result;
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.warn('⚠️ Sync fetch error:', errorMessage);
        return null;
    }
}

/**
 * Récupère toutes les données depuis le backend Supabase (Single Source of Truth).
 */
export async function fetchFromBackend() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/sync?t=${Date.now()}`, {
            method: 'GET',
            headers: getAuthHeaders(),
        });

        if (!response.ok) {
            console.warn('⚠️ Fetch from backend failed:', response.status);
            return null;
        }

        const data = await response.json();
        return data;
    } catch (err) {
        console.error('⚠️ Fetch from backend error:', err);
        return null;
    }
}

/**
 * Vérifie que le backend est disponible.
 * @returns {Promise<boolean>}
 */
export async function isBackendAvailable() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
        return response.ok;
    } catch {
        return false;
    }
}
