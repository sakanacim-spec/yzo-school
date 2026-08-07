// En production, le site et l'API sont 100% hébergés et centralisés sur Vercel (yziow.com)
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : '');

export const API_BASE_URL = `${BACKEND_URL}/api`;
