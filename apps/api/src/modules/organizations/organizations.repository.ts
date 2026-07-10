import { Injectable } from '@nestjs/common';
import { Organization } from '@saas/types';
import { SupabaseRepository } from '../../common/repositories/supabase.repository';

@Injectable()
export class OrganizationsRepository extends SupabaseRepository<Organization & Record<string, unknown>> {
  protected readonly table = 'saas_organizations';

  async findByTenant(tenantId: string, activeOnly = true) {
    let q = this.query().select('*').eq('tenant_id', tenantId).order('name');
    if (activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  }

  async findByTenantPaginated(tenantId: string, page: number, limit: number) {
    return this.findAllPaginated(
      { tenant_id: tenantId, is_active: true } as any,
      page,
      limit,
      'name',
      true,
    );
  }

  async findByTenantAndId(tenantId: string, id: string) {
    const { data, error } = await this.query()
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();
    if (error) return null;
    return data;
  }

  async getOrgStats(tenantId: string, orgId: string) {
    const [usersResult, filesResult] = await Promise.all([
      this.db
        .from('saas_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('tenant_id', tenantId),
      this.db
        .from('saas_files')
        .select('size_bytes', { count: 'exact' })
        .eq('org_id', orgId)
        .eq('tenant_id', tenantId),
    ]);

    const totalStorage = ((filesResult.data ?? []) as Array<{ size_bytes: number }>)
      .reduce((sum, f) => sum + (f.size_bytes ?? 0), 0);

    return {
      organizationId: orgId,
      usersCount: usersResult.count ?? 0,
      filesCount: filesResult.count ?? 0,
      totalStorageBytes: totalStorage,
    };
  }
}
