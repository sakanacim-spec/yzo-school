import { API_BASE_URL } from '../config';
import { parseResponse, getAuthHeaders } from './apiHelpers';

const API_URL = API_BASE_URL;

// alias for clarity in this file
const getHeaders = getAuthHeaders;

export const parentApi = {
    // ── Authentification ────────────────────────────────────────
    register: async (data: any) => {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await parseResponse(res);
        if (!res.ok) throw result;
        if (result.token) localStorage.setItem('parent_token', result.token);
        return result;
    },

    login: async (data: any) => {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await parseResponse(res);
        if (!res.ok) throw result;
        if (result.token) localStorage.setItem('parent_token', result.token);
        return result;
    },

    // ── Recherche d'élèves ───────────────────────────────────────
    searchStudents: async (params: { nom?: string, prenom?: string, classe?: string }) => {
        const query = new URLSearchParams(params as any).toString();
        const res = await fetch(`${API_URL}/students?${query}`, {
            headers: getHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    countStudents: async () => {
        const res = await fetch(`${API_URL}/students/count`, {
            headers: getHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    // ── Dashboard ──────────────────────────────────────────────
    getDashboard: async () => {
        const res = await fetch(`${API_URL}/parent/dashboard`, {
            headers: getHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },
    linkStudent: async (studentId: string) => {
        const res = await fetch(`${API_URL}/students/link`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ studentId })
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    linkStudents: async (studentIds: string[]) => {
        const res = await fetch(`${API_URL}/students/link`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ studentIds })
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    unlinkStudent: async (studentId: string) => {
        const res = await fetch(`${API_URL}/students/unlink/${studentId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    // ── Historique des paiements ───────────────────────────────
    getPayments: async (studentId: string) => {
        const res = await fetch(`${API_URL}/parent/payments/${studentId}`, {
            headers: getHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    getPresences: async (studentId: string) => {
        const res = await fetch(`${API_URL}/parent/presences/${studentId}`, {
            headers: getHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    // ── Badges ──────────────────────────────────────────────────
    getBadges: async () => {
        const res = await fetch(`${API_URL}/parent/badges`, {
            headers: getHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    // ── Messages ────────────────────────────────────────────────
    getMessages: async () => {
        const res = await fetch(`${API_URL}/parent/messages`, {
            headers: getHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    getActiveCount: async () => {
        const res = await fetch(`${API_URL}/parent/active-count`, {
            headers: getHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    getParentList: async () => {
        const res = await fetch(`${API_URL}/parent/list`, {
            headers: getHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    deleteAccount: async () => {
        const res = await fetch(`${API_URL}/auth/me`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    adminDeleteParent: async (parentId: string) => {
        const res = await fetch(`${API_URL}/parent/${parentId}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        if (!res.ok) throw await res.json();
        return await res.json();
    },

    // ── Annonces (temps réel) ────────────────────────────────
    getAnnouncements: async () => {
        const res = await fetch(`${API_URL}/announcements`, {
            headers: getHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data; // { announcements: [...] }
    },

    logout: () => {
        localStorage.removeItem('parent_token');
    }
};
