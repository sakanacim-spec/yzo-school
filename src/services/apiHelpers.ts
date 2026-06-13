/**
 * Parse a Response as JSON and provide a clear error when the body is invalid.
 */
export async function parseResponse(res: Response) {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch (err) {
        console.error('Failed to parse JSON response:', text);
        throw new Error('Invalid JSON returned from API');
    }
}

/**
 * Common headers including JWT token from local storage when available.
 * `Content-Type` is always set to application/json because most endpoints
 * expect JSON. For file uploads you'll still need to construct a FormData
 * request manually and omit the content type.
 */
export function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('parent_token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}
