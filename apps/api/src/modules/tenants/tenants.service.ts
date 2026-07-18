import { Injectable } from '@nestjs/common';
import { TenantsRepository } from './tenants.repository';

@Injectable()
export class TenantsService {
  constructor(private readonly repo: TenantsRepository) {}

  findAll()                           { return this.repo.findActive(); }
  findOne(id: string)                 { return this.repo.findById(id); }
  findBySlug(slug: string)            { return this.repo.findBySlug(slug); }
  create(p: { slug: string; name: string; plan?: string }) {
    return this.repo.create({ ...p, plan: p.plan ?? 'free' } as any);
  }
  updatePlan(id: string, plan: string) { return this.repo.updatePlan(id, plan); }

  async updateModules(id: string, modules: string[]) {
    const tenant = await this.repo.findById(id);
    if (!tenant) throw new Error('Tenant not found');
    
    const settings = typeof tenant.settings === 'object' ? tenant.settings : {};
    const newSettings = { ...settings, modules };
    
    return this.repo.update(id, { settings: newSettings } as any);
  }
}
