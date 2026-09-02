// src/config.ts
// En production, le site et l'API sont 100% hébergés et centralisés sur Vercel (yziow.com)
// Chaînage optionnel sur import.meta.env pour assurer la compatibilité isomorphique (Vite + Node test runner)
export const BACKEND_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BACKEND_URL) || (typeof window !== 'undefined' ? window.location.origin : '');

export const API_BASE_URL = `${BACKEND_URL}/api`;
