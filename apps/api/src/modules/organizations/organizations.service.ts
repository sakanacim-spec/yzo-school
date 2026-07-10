import { Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationsRepository } from './organizations.repository';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

/**
 * OrganizationsService — logique métier uniquement.
 * Toute interaction DB passe par OrganizationsRepository.
 *
 * SÉPARATION FUTURE :
 * Quand le SaaS migre vers son propre projet Supabase, seul le client
 * injecté dans OrganizationsRepository change. Ce service ne bouge pas.
 */
@Injectable()
export class OrganizationsService {
  constructor(private readonly repo: OrganizationsRepository) {}

  async create(tenantId: string, dto: CreateOrganizationDto) {
    return this.repo.create({
      tenant_id: tenantId,
      name: dto.name,
      code: dto.code,
      address: dto.address,
      metadata: dto.metadata ?? {},
    } as any);
  }

  async findAll(tenantId: string, page = 1, limit = 20) {
    const { data, total } = await this.repo.findByTenantPaginated(tenantId, page, limit);
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(tenantId: string, id: string) {
    const org = await this.repo.findByTenantAndId(tenantId, id);
    if (!org) throw new NotFoundException(`Organisation ${id} introuvable`);
    return org;
  }

  async update(tenantId: string, id: string, dto: UpdateOrganizationDto) {
    await this.findOne(tenantId, id); // vérification d'appartenance
    return this.repo.update(id, dto as any);
  }

  async archive(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.repo.archive(id);
    return { message: 'Organisation archivée avec succès' };
  }

  async getStats(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.repo.getOrgStats(tenantId, id);
  }
}
