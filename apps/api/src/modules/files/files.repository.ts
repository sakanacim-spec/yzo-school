import { Injectable } from '@nestjs/common';
import { FileRecord } from '@saas/types';
import { SupabaseRepository } from '../../common/repositories/supabase.repository';

const BUCKET_NAME = 'saas-files';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

@Injectable()
export class FilesRepository extends SupabaseRepository<FileRecord & Record<string, unknown>> {
  protected readonly table = 'saas_files';

  async createUploadUrl(
    tenantId: string,
    orgId: string,
    userId: string,
    filename: string,
    mimeType: string,
    sizeBytes: number,
  ) {
    if (sizeBytes > MAX_FILE_SIZE) {
      throw new Error(`Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`);
    }

    const storagePath = `${tenantId}/${orgId}/${Date.now()}-${filename}`;

    const { data: signedData, error: storageError } = await this.db.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(storagePath);

    if (storageError) throw new Error(storageError.message);

    const fileRecord = await this.create({
      tenant_id: tenantId,
      org_id: orgId,
      uploaded_by: userId,
      storage_path: storagePath,
      filename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
    } as any);

    return {
      fileId: fileRecord.id,
      uploadUrl: signedData.signedUrl,
      path: storagePath,
      token: signedData.token,
    };
  }

  async findByTenant(tenantId: string, orgId?: string) {
    let q = this.query()
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (orgId) q = q.eq('org_id', orgId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async getSignedDownloadUrl(tenantId: string, id: string, expiresInSeconds = 3600) {
    const { data: file, error: dbError } = await this.query()
      .select('storage_path, filename')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (dbError || !file) return null;

    const { data, error } = await this.db.storage
      .from(BUCKET_NAME)
      .createSignedUrl((file as any).storage_path, expiresInSeconds);

    if (error) throw new Error(error.message);

    return {
      url: data.signedUrl,
      filename: (file as any).filename,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  async deleteFile(tenantId: string, id: string) {
    const { data: file } = await this.query()
      .select('storage_path')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (!file) return null;

    await this.db.storage.from(BUCKET_NAME).remove([(file as any).storage_path]);
    await this.delete(id);
    return true;
  }
}
