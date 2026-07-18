/**
 * Tokens d'injection Supabase — fichier séparé pour éviter
 * les dépendances circulaires entre supabase.module et les repositories.
 *
 * SÉPARATION FUTURE :
 * SAAS_* → projet SaaS dédié (changer SAAS_SUPABASE_URL suffit)
 * SUPABASE_* → projet Yziow (inchangé)
 */
export const SAAS_SUPABASE_CLIENT       = 'SAAS_SUPABASE_CLIENT';
export const SAAS_SUPABASE_ADMIN_CLIENT = 'SAAS_SUPABASE_ADMIN_CLIENT';

// Alias rétrocompatibles
export const SUPABASE_CLIENT       = SAAS_SUPABASE_CLIENT;
export const SUPABASE_ADMIN_CLIENT = SAAS_SUPABASE_ADMIN_CLIENT;
