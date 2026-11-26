// src/services/apiHelpers.ts

/**
 * Standardized API Error class for frontend services and components.
 * Contains HTTP status, clean sanitized message, and optional error code.
 */
export class ApiError extends Error {
    public status: number;
    public code?: string;
    public error: string;
    public details?: any;

    constructor(message: string, status: number, code?: string, details?: any) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.error = message;
        this.details = details;
        Object.setPrototypeOf(this, ApiError.prototype);
    }
}

/**
 * Sanitizes backend error messages to prevent leaking internal SQL / traces / secrets.
 */
export function sanitizeErrorMessage(rawMessage: string | undefined | null, status: number): string {
    if (!rawMessage || typeof rawMessage !== 'string') {
        if (status === 401) return 'Session expirée ou invalide. Veuillez vous reconnecter.';
        if (status === 403) return 'Accès non autorisé.';
        if (status === 404) return 'Ressource introuvable.';
        if (status >= 500) return 'Une erreur interne est survenue sur le serveur.';
        return 'Une erreur est survenue lors de la communication avec le serveur.';
    }

    const trimmed = rawMessage.trim();

    // Check for internal database leaks (SQL, relations, syntax, postgres)
    const sqlLeakPatterns = [
        /relation\s+["'].*?["']\s+does not exist/i,
        /syntax error at or near/i,
        /column\s+["'].*?["']\s+does not exist/i,
        /foreign key constraint/i,
        /unique constraint/i,
        /42P01/i,
        /23505/i,
        /pg_/i,
        /supabase/i,
        /jwt/i,
        /bearer/i
    ];

    for (const pattern of sqlLeakPatterns) {
        if (pattern.test(trimmed)) {
            if (status >= 500) {
                return 'Une erreur interne est survenue sur le serveur. Veuillez réessayer ultérieurement.';
            }
            return 'Requête non valide ou ressource indisponible.';
        }
    }

    return trimmed;
}

/**
 * Parse a Response as JSON and provide a clear error when the body is invalid.
 */
export async function parseResponse(res: Response) {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch (err) {
        console.error('Failed to parse JSON response:', text);
        throw new ApiError('Format de réponse serveur non valide (JSON attendu).', res.status || 500, 'INVALID_JSON');
    }
}

/**
 * Handles an API response: parses JSON, and if !res.ok, throws a structured ApiError.
 */
export async function handleApiResponse<T = any>(res: Response): Promise<T> {
    const data = await parseResponse(res);
    if (!res.ok) {
        const rawMsg = data?.error || data?.message;
        const cleanMsg = sanitizeErrorMessage(rawMsg, res.status);
        const code = data?.code || (res.status === 401 ? 'UNAUTHORIZED' : res.status === 403 ? 'FORBIDDEN' : undefined);
        const err = new ApiError(cleanMsg, res.status, code, data);
        throw err;
    }
    return data as T;
}

/**
 * Common headers including JWT token from local storage when available.
 * `Content-Type` is always set to application/json because most endpoints expect JSON.
 * Garde défensive typeof localStorage pour compatibilité isomorphique navigateur / runner de test.
 */
export function getAuthHeaders(): Record<string, string> {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('parent_token') : null;
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}
