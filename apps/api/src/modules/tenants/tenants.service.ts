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
}
