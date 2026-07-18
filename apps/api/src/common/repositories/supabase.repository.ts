import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SAAS_SUPABASE_ADMIN_CLIENT, SAAS_SUPABASE_CLIENT } from '../supabase/supabase.tokens';

/**
 * SupabaseRepository<T> — Couche d'abstraction entre les services NestJS
 * et Supabase. Toutes les opérations DB passent ici.
 *
 * PRINCIPE DE SÉPARATION :
 * - La propriété `table` contient le nom complet de la table (ex: 'saas_tenants')
 * - En production séparée, seul le client Supabase change (via env vars)
 * - Aucun code métier à modifier lors de la migration vers un projet dédié
 *
 * USAGE :
 * ```typescript
 * @Injectable()
 * export class TenantsRepository extends SupabaseRepository<Tenant> {
 *   protected readonly table = 'saas_tenants';
 * }
 * ```
 */
@Injectable()
export abstract class SupabaseRepository<T extends Record<string, unknown>> {
  /** Nom de la table Supabase (ex: 'saas_tenants') */
  protected abstract readonly table: string;

  constructor(
    @Inject(SAAS_SUPABASE_ADMIN_CLIENT)
    protected readonly db: SupabaseClient,

    @Inject(SAAS_SUPABASE_CLIENT)
    protected readonly publicClient: SupabaseClient,
  ) {}

  // ── READ ──────────────────────────────────────────────────────────────────

  async findById(id: string): Promise<T | null> {
    const { data, error } = await this.db
      .from(this.table)
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data as T;
  }

  async findAll(filters: Partial<T> = {}): Promise<T[]> {
    let query = this.db.from(this.table).select('*');
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) query = query.eq(key, value as string);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as T[];
  }

  async findOne(filters: Partial<T>): Promise<T | null> {
    let query = this.db.from(this.table).select('*');
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) query = query.eq(key, value as string);
    }
    const { data, error } = await query.single();
    if (error) return null;
    return data as T;
  }

  async findAllPaginated(
    filters: Partial<T>,
    page: number,
    limit: number,
    orderBy = 'created_at',
    ascending = false,
  ): Promise<{ data: T[]; total: number }> {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.db
      .from(this.table)
      .select('*', { count: 'exact' })
      .order(orderBy, { ascending })
      .range(from, to);

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) query = query.eq(key, value as string);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { data: (data ?? []) as T[], total: count ?? 0 };
  }

  // ── WRITE ─────────────────────────────────────────────────────────────────

  async create(payload: Partial<T>): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await this.db
      .from(this.table)
      .insert(payload as any)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as T;
  }

  async update(id: string, payload: Partial<T>): Promise<T> {
    const { data, error } = await this.db
      .from(this.table)
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as T;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from(this.table).delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  /** Soft delete — met is_active à false au lieu de supprimer */
  async archive(id: string): Promise<void> {
    const { error } = await this.db
      .from(this.table)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async upsert(payload: Partial<T>): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await this.db
      .from(this.table)
      .upsert(payload as any)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as T;
  }

  async count(filters: Partial<T> = {}): Promise<number> {
    let query = this.db.from(this.table).select('id', { count: 'exact', head: true });
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) query = query.eq(key, value as string);
    }
    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  // ── QUERY BUILDER (pour les cas complexes) ────────────────────────────────

  /**
   * Accès direct au query builder Supabase pour les requêtes complexes.
   * À utiliser uniquement quand les méthodes génériques ne suffisent pas.
   */
  protected query() {
    return this.db.from(this.table);
  }
}
