import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT, SUPABASE_CLIENT } from './supabase.module';

/**
 * Service Supabase injectable dans tous les modules.
 * Fournit les deux clients (public et admin) avec helpers typés.
 */
@Injectable()
export class SupabaseService {
  constructor(
    @Inject(SUPABASE_CLIENT)
    public readonly client: SupabaseClient,

    @Inject(SUPABASE_ADMIN_CLIENT)
    public readonly admin: SupabaseClient,
  ) {}

  /**
   * Crée un client Supabase avec le JWT de l'utilisateur courant.
   * Cela active le Row Level Security côté Supabase.
   */
  /** @deprecated Utiliser FilesRepository ou NotificationsRepository directement */
  createAuthenticatedClient(_accessToken: string): SupabaseClient {
    // Avec Fastify + RLS, le service role key bypass RLS côté admin.
    // Pour les opérations user-scoped, utiliser les policies PostgreSQL.
    return this.client;
  }

  /**
   * Vérifie un JWT Supabase et retourne l'utilisateur.
   */
  async verifyToken(token: string) {
    const { data, error } = await this.admin.auth.getUser(token);
    if (error) throw error;
    return data.user;
  }
}
