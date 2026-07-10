import { Injectable } from '@nestjs/common';
import { Profile } from '@saas/types';
import { SupabaseRepository } from '../../common/repositories/supabase.repository';

@Injectable()
export class UsersRepository extends SupabaseRepository<Profile & Record<string, unknown>> {
  protected readonly table = 'saas_profiles';

  async findByTenant(tenantId: string, orgId?: string) {
    let q = this.query()
      .select('*, saas_user_roles(*, saas_roles(*))')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (orgId) q = q.eq('org_id', orgId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  }

  async findByTenantAndId(tenantId: string, id: string) {
    const { data, error } = await this.query()
      .select('*, saas_user_roles(*, saas_roles(*))')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();
    if (error) return null;
    return data;
  }
}
