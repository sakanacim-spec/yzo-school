// ============================================================
// SERVICE — Upload photo passeport d'un élève
// Envoie la photo base64 au backend → Supabase Storage
// ============================================================

import { BACKEND_URL } from '../config';
import { getAuthHeaders } from './apiHelpers';

/**
 * Uploade la photo passeport d'un élève vers Supabase Storage via le backend.
 *
 * @param studentId  - ID de l'élève
 * @param imageBase64 - Data URL base64 : "data:image/jpeg;base64,..."
 * @returns          - L'URL publique Supabase de la photo, ou null en cas d'échec
 */
export async function uploadStudentPhoto(
    studentId: string,
    imageBase64: string
): Promise<string | null> {
    try {
        const response = await fetch(`${BACKEND_URL}/api/students/upload-photo/${studentId}`, {
            method: 'POST',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ imageBase64 }),
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            console.error('[PhotoService] Upload failed:', data.error || data.warning);
            // Si c'est un 207 (warning), on a quand même une URL
            if (data.photoUrl) return data.photoUrl;
            return null;
        }

        console.log('[PhotoService] Upload success:', data.photoUrl);
        return data.photoUrl ?? null;
    } catch (err) {
        console.error('[PhotoService] Network error:', err);
        return null;
    }
}

/**
 * Supprime la photo d'un élève.
 * @param studentId - ID de l'élève
 */
export async function deleteStudentPhoto(studentId: string): Promise<boolean> {
    try {
        const response = await fetch(`${BACKEND_URL}/api/students/photo/${studentId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
        });
        return response.ok;
    } catch {
        return false;
    }
}
