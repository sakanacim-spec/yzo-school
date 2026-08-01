// En production, le frontend (Vercel/yziow.com) appelle le backend (Render/yzo-backend)
export const BACKEND_URL = import.meta.env.PROD
  ? 'https://yzo-backend.onrender.com'
  : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');

export const API_BASE_URL = `${BACKEND_URL}/api`;
