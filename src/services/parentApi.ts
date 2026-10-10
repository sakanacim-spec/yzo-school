import { API_BASE_URL } from '../config.ts';
import { parseResponse, getAuthHeaders } from './apiHelpers.ts';

const API_URL = API_BASE_URL;

// alias for clarity in this file
const getHeaders = getAuthHeaders;

// ── Types Portefeuille Global P25-T.5b ─────────────────────────────
export type ParentPackAccessState =
    | 'PAID_ACTIVE'
    | 'GRACE_ACTIVE'
    | 'LEGACY_UNDECIDED'
    | 'PACK_SUSPENDED';

export interface GlobalChildSchoolInfo {
    school_slug: string;
    school_name: string;
}

export interface GlobalChildAccessInfo {
    state: ParentPackAccessState;
    accessAllowed: boolean;
    grace_expires_at?: string;
}

export interface EnrichedGlobalChild {
    student_global_id: string;
    display_name: string;
    schools: GlobalChildSchoolInfo[];
    access: GlobalChildAccessInfo;
}

export interface GlobalPortfolioResponse {
    children: EnrichedGlobalChild[];
}

const VALID_PACK_STATES = new Set<string>([
    'PAID_ACTIVE',
    'GRACE_ACTIVE',
    'LEGACY_UNDECIDED',
    'PACK_SUSPENDED'
]);

export function validateGlobalPortfolioResponse(data: any): GlobalPortfolioResponse {
    if (!data || typeof data !== 'object' || !Array.isArray(data.children)) {
        throw new Error('Réponse portefeuille invalide : format attendu non respecté.');
    }

    const validatedChildren: EnrichedGlobalChild[] = [];

    for (const child of data.children) {
        if (!child || typeof child !== 'object') {
            throw new Error('Réponse portefeuille invalide : structure enfant invalide.');
        }
        if (typeof child.student_global_id !== 'string' || !child.student_global_id.trim()) {
            throw new Error('Réponse portefeuille invalide : student_global_id manquant ou invalide.');
        }
        if (typeof child.display_name !== 'string' || !child.display_name.trim()) {
            throw new Error('Réponse portefeuille invalide : display_name manquant ou invalide.');
        }
        if (!Array.isArray(child.schools)) {
            throw new Error('Réponse portefeuille invalide : liste des écoles invalide.');
        }

        const validatedSchools: GlobalChildSchoolInfo[] = [];
        for (const s of child.schools) {
            if (!s || typeof s !== 'object' || typeof s.school_slug !== 'string' || !s.school_slug.trim() || typeof s.school_name !== 'string' || !s.school_name.trim()) {
                throw new Error('Réponse portefeuille invalide : établissement associé invalide.');
            }
            validatedSchools.push({
                school_slug: s.school_slug.trim(),
                school_name: s.school_name.trim()
            });
        }

        if (!child.access || typeof child.access !== 'object') {
            throw new Error("Réponse portefeuille invalide : état d'accès manquant.");
        }
        if (!VALID_PACK_STATES.has(child.access.state)) {
            throw new Error('Réponse portefeuille invalide : état Parent Pack inconnu.');
        }
        if (typeof child.access.accessAllowed !== 'boolean') {
            throw new Error('Réponse portefeuille invalide : accessAllowed doit être un booléen.');
        }

        const validatedAccess: GlobalChildAccessInfo = {
            state: child.access.state,
            accessAllowed: child.access.accessAllowed
        };

        if (child.access.grace_expires_at !== undefined && child.access.grace_expires_at !== null) {
            if (typeof child.access.grace_expires_at !== 'string' || isNaN(Date.parse(child.access.grace_expires_at))) {
                throw new Error('Réponse portefeuille invalide : date de fin de grâce invalide.');
            }
            validatedAccess.grace_expires_at = child.access.grace_expires_at;
        }

        validatedChildren.push({
            student_global_id: child.student_global_id.trim(),
            display_name: child.display_name.trim(),
            schools: validatedSchools,
            access: validatedAccess
        });
    }

    return { children: validatedChildren };
}

export const parentApi = {
    // ── Authentification ────────────────────────────────────────
    register: async (data: any) => {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await parseResponse(res);
        if (!res.ok) {
            const err: any = new Error(result.error || result.message || 'API Error');
            Object.assign(err, result);
            throw err;
        }
        if (result.token) localStorage.setItem('parent_token', result.token);
        return result;
    },

    registerSchool: async (data: any) => {
        const res = await fetch(`${API_URL}/auth/register-school`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await parseResponse(res);
        if (!res.ok) {
            const err: any = new Error(result.error || result.message || 'API Error');
            Object.assign(err, result);
            throw err;
        }
        if (result.token) localStorage.setItem('parent_token', result.token); // using the same token storage for all roles
        return result;
    },

    login: async (data: any) => {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await parseResponse(res);
        if (!res.ok) {
            const err: any = new Error(result.error || result.message || 'API Error');
            Object.assign(err, result);
            throw err;
        }
        if (result.token) localStorage.setItem('parent_token', result.token);
        return result;
    },

    // 💰 Paiement (FedaPay)
    initPayment: async (data: { studentId: string, amount: number, parentPhone: string, parentName: string }) => {
        const res = await fetch(`${API_URL}/payment/create-transaction`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(data)
        });
        const result = await parseResponse(res);
        if (!res.ok) throw result;
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

    transferIdentity: async (studentId: string, target_student_global_id: string) => {
        const res = await fetch(`${API_URL}/students/transfer-identity`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ studentId, target_student_global_id })
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

    toggleDevoirComplete: async (devoirId: string, studentId: string, completed: boolean) => {
        const res = await fetch(`${API_URL}/parent/devoir/${devoirId}/complete`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ studentId, completed })
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return data;
    },

    logout: () => {
        localStorage.removeItem('parent_token');
    },
    // ── Parent Pack Pricing & Payment ────────────────────────
    getParentPackPricing: async (schoolSlug: string, studentId: string) => {
        const res = await fetch(`${API_URL}/payment/parent-pack/pricing/${schoolSlug}/${studentId}`, {
            headers: getHeaders()
        });
        const result = await parseResponse(res);
        if (!res.ok) throw result;
        return result; // { monthly: {...}, annual: {...} }
    },
    initParentPackPayment: async (schoolSlug: string, studentId: string, planType: 'monthly' | 'annual') => {
        const res = await fetch(`${API_URL}/payment/parent-pack/init/${schoolSlug}/${studentId}`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ planType })
        });
        const result = await parseResponse(res);
        if (!res.ok) throw result;
        return result; // { url: string }
    },

    // ── Portefeuille Global Parent (P25-T.5b) ─────────────────
    getGlobalChildren: async (): Promise<GlobalPortfolioResponse> => {
        const res = await fetch(`${API_URL}/parent/global-children`, {
            headers: getHeaders()
        });
        const data = await parseResponse(res);
        if (!res.ok) throw data;
        return validateGlobalPortfolioResponse(data);
    }
};
