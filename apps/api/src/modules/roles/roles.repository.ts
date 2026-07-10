import { Injectable } from '@nestjs/common';
import { Role } from '@saas/types';
import { SupabaseRepository } from '../../common/repositories/supabase.repository';

@Injectable()
export class RolesRepository extends SupabaseRepository<Role & Record<string, unknown>> {
  protected readonly table = 'saas_roles';

  async findByTenant(tenantId: string) {
    const { data, error } = await this.query()
      .select('*')
      .eq('tenant_id', tenantId)
      .order('level', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async assignToUser(userId: string, roleId: string, orgId: string) {
    const { data, error } = await this.db
      .from('saas_user_roles')
      .upsert({ user_id: userId, role_id: roleId, org_id: orgId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
}
