// En production (Vercel), on force l'utilisation du même domaine (window.location.origin)
// pour que le frontend tape toujours sur l'API Serverless incluse, peu importe les vieilles variables d'environnement.
export const BACKEND_URL = import.meta.env.PROD
  ? (typeof window !== 'undefined' ? window.location.origin : '')
  : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');

export const API_BASE_URL = `${BACKEND_URL}/api`;
