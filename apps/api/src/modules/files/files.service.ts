import { Injectable, NotFoundException } from '@nestjs/common';
import { FilesRepository } from './files.repository';

/**
 * FilesService — logique métier uniquement.
 * Upload/download/delete via FilesRepository (table: saas_files + bucket: saas-files).
 */
@Injectable()
export class FilesService {
  constructor(private readonly repo: FilesRepository) {}

  async createUploadUrl(
    tenantId: string,
    orgId: string,
    userId: string,
    filename: string,
    mimeType: string,
    sizeBytes: number,
  ) {
    return this.repo.createUploadUrl(tenantId, orgId, userId, filename, mimeType, sizeBytes);
  }

  findAll(tenantId: string, orgId?: string) {
    return this.repo.findByTenant(tenantId, orgId);
  }

  async getSignedUrl(tenantId: string, id: string, expiresInSeconds?: number) {
    const result = await this.repo.getSignedDownloadUrl(tenantId, id, expiresInSeconds);
    if (!result) throw new NotFoundException('Fichier introuvable');
    return result;
  }

  async delete(tenantId: string, id: string) {
    const deleted = await this.repo.deleteFile(tenantId, id);
    if (!deleted) throw new NotFoundException('Fichier introuvable');
    return { message: 'Fichier supprimé' };
  }
}
