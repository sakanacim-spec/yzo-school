export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || window.location.origin;
export const API_BASE_URL = import.meta.env.VITE_BACKEND_URL ? `${import.meta.env.VITE_BACKEND_URL}/api` : '/api';
