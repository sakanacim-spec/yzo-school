import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import * as crypto from 'crypto';

import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auditLogs: AuditLogsService
  ) {}

  /**
   * Génère une nouvelle clé d'API de manière sécurisée.
   * Retourne la clé brute (affichée une seule fois au client) et stocke le hash.
   */
  async generateKey(tenantId: string, dto: CreateApiKeyDto) {
    // 1. Génération sécurisée de la clé brute
    const prefix = dto.environment === 'sandbox' ? 'oz_test_' : 'oz_live_';
    const randomBytes = crypto.randomBytes(32).toString('hex');
    const rawKey = `${prefix}${randomBytes}`;

    // 2. Hashage (SHA-256) pour le stockage
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    
    // Le prefix sauvegardé sert à l'affichage partiel (ex: oz_live_***)
    const storedPrefix = rawKey.substring(0, 16); 

    // 3. Stockage en base de données
    const client = this.supabase.admin;
    const { data, error } = await client
      .from('saas_api_keys')
      .insert({
        tenant_id: tenantId,
        name: dto.name,
        key_hash: keyHash,
        prefix: storedPrefix,
        environment: dto.environment,
        scopes: dto.scopes || [],
      })
      .select('id, name, environment, prefix, created_at')
      .single();

    if (error) {
      throw new InternalServerErrorException(`Erreur lors de la création de la clé : ${error.message}`);
    }

    this.auditLogs.log({
      tenantId,
      action: 'apikey.created',
      severity: 'SECURITY',
      entityType: 'apikey',
      entityId: data.id,
      metadata: { environment: dto.environment, name: dto.name, scopes: dto.scopes }
    });

    // On retourne la clé brute (UNE SEULE FOIS) et les métadonnées
    return {
      apiKey: rawKey,
      metadata: data
    };
  }

  /**
   * Récupère la liste des clés du tenant (sans les clés brutes, bien sûr)
   */
  async listKeys(tenantId: string) {
    const client = this.supabase.admin;
    const { data, error } = await client
      .from('saas_api_keys')
      .select('id, name, prefix, environment, scopes, is_revoked, last_used_at, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  /**
   * Révoque une clé d'API
   */
  async revokeKey(tenantId: string, keyId: string) {
    const client = this.supabase.admin;
    const { error } = await client
      .from('saas_api_keys')
      .update({ is_revoked: true, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', keyId);

    if (error) throw new InternalServerErrorException(error.message);

    this.auditLogs.log({
      tenantId,
      action: 'apikey.revoked',
      severity: 'WARNING',
      entityType: 'apikey',
      entityId: keyId,
    });

    return { success: true };
  }
}
