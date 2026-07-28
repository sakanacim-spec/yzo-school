const PROD_BACKEND = 'https://gestioschool-wfw6.onrender.com';

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 
  (typeof window !== 'undefined' && window.location.hostname.includes('localhost') ? window.location.origin : PROD_BACKEND);

export const API_BASE_URL = `${BACKEND_URL}/api`;

