import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import {
  SAAS_SUPABASE_CLIENT,
  SAAS_SUPABASE_ADMIN_CLIENT,
  SUPABASE_CLIENT,
  SUPABASE_ADMIN_CLIENT,
} from './supabase.tokens';

export { SAAS_SUPABASE_CLIENT, SAAS_SUPABASE_ADMIN_CLIENT, SUPABASE_CLIENT, SUPABASE_ADMIN_CLIENT };

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
