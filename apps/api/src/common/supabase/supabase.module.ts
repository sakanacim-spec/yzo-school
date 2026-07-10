import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

// ── Tokens d'injection ────────────────────────────────────────────────────────
// SAAS_* → projet SaaS (actuellement = Yziow pour le MVP)
// En production : SAAS_SUPABASE_URL pointe vers le projet SaaS dédié
// La séparation ne nécessite que de changer 2 variables d'environnement.
export const SAAS_SUPABASE_CLIENT       = 'SAAS_SUPABASE_CLIENT';
export const SAAS_SUPABASE_ADMIN_CLIENT = 'SAAS_SUPABASE_ADMIN_CLIENT';

// Alias rétrocompatibles (non supprimés pour ne pas casser les imports existants)
export const SUPABASE_CLIENT       = SAAS_SUPABASE_CLIENT;
export const SUPABASE_ADMIN_CLIENT = SAAS_SUPABASE_ADMIN_CLIENT;

/**
 * SupabaseModule — Module global qui expose deux clients Supabase :
 *
 * MVP :    SAAS_SUPABASE_URL = SUPABASE_URL (même projet Yziow)
 * Prod :   SAAS_SUPABASE_URL = projet SaaS dédié (changement de 2 env vars)
 *
 * Aucune réécriture de code nécessaire pour la séparation.
 */
@Global()
@Module({
  providers: [
    // ── Client public (anon key) ──────────────────────────────
    {
      provide: SAAS_SUPABASE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SupabaseClient =>
        createClient(
          // Cherche SAAS_SUPABASE_URL en priorité, fallback sur SUPABASE_URL
          config.get<string>('SAAS_SUPABASE_URL') ??
            config.getOrThrow<string>('SUPABASE_URL'),
          config.get<string>('SAAS_SUPABASE_ANON_KEY') ??
            config.getOrThrow<string>('SUPABASE_ANON_KEY'),
          { auth: { autoRefreshToken: false, persistSession: false } },
        ),
    },

    // ── Client admin (service_role key) ──────────────────────
    {
      provide: SAAS_SUPABASE_ADMIN_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SupabaseClient =>
        createClient(
          config.get<string>('SAAS_SUPABASE_URL') ??
            config.getOrThrow<string>('SUPABASE_URL'),
          config.get<string>('SAAS_SUPABASE_SERVICE_ROLE_KEY') ??
            config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
          { auth: { autoRefreshToken: false, persistSession: false } },
        ),
    },

    SupabaseService,
  ],
  exports: [
    SAAS_SUPABASE_CLIENT,
    SAAS_SUPABASE_ADMIN_CLIENT,
    SupabaseService,
  ],
})
export class SupabaseModule {}
