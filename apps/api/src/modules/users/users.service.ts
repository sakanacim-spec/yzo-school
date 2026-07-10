import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository';

/**
 * UsersService — logique métier uniquement, zéro Supabase direct.
 * Toute interaction DB passe par UsersRepository (table: saas_profiles).
 */
@Injectable()
export class UsersService {
  constructor(private readonly repo: UsersRepository) {}

  findAll(tenantId: string, orgId?: string) {
    return this.repo.findByTenant(tenantId, orgId);
  }

  findOne(tenantId: string, id: string) {
    return this.repo.findByTenantAndId(tenantId, id);
  }

  updateProfile(tenantId: string, id: string, updates: Record<string, unknown>) {
    return this.repo.update(id, updates as any);
  }
}
