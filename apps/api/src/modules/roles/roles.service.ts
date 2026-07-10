import { Injectable } from '@nestjs/common';
import { RolesRepository } from './roles.repository';

@Injectable()
export class RolesService {
  constructor(private readonly repo: RolesRepository) {}

  findAll(tenantId: string) {
    return this.repo.findByTenant(tenantId);
  }

  create(tenantId: string, payload: { name: string; level: number; permissions: string[] }) {
    return this.repo.create({ ...payload, tenant_id: tenantId } as any);
  }

  assignToUser(_tenantId: string, userId: string, roleId: string, orgId: string) {
    return this.repo.assignToUser(userId, roleId, orgId);
  }
}
