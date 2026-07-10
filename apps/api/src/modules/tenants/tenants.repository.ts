import { Injectable } from '@nestjs/common';
import { Tenant } from '@saas/types';
import { SupabaseRepository } from '../../common/repositories/supabase.repository';

@Injectable()
export class TenantsRepository extends SupabaseRepository<Tenant & Record<string, unknown>> {
  protected readonly table = 'saas_tenants';

  async findBySlug(slug: string) {
    return this.findOne({ slug } as any);
  }

  async findActive() {
    const { data, error } = await this.query()
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(error.message);
    return data;
  }

  async updatePlan(id: string, plan: string) {
    return this.update(id, { plan } as any);
  }
}
