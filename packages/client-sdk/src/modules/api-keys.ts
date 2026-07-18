import { OziowHttpClient } from '../client';

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  environment: 'production' | 'sandbox';
  scopes: string[];
  is_revoked: boolean;
  last_used_at?: string;
  created_at: string;
}

export interface CreateApiKeyDto {
  name: string;
  environment: 'production' | 'sandbox';
  scopes?: string[];
}

export class ApiKeysModule {
  constructor(private client: OziowHttpClient) {}

  /**
   * Liste les clés d'API du tenant courant
   */
  async list(): Promise<ApiKey[]> {
    return this.client.get<ApiKey[]>('/api-keys');
  }

  /**
   * Crée une nouvelle clé d'API.
   * ATTENTION: La clé brute (apiKey) n'est retournée qu'ici.
   */
  async create(data: CreateApiKeyDto): Promise<{ apiKey: string; metadata: ApiKey }> {
    return this.client.post<{ apiKey: string; metadata: ApiKey }>('/api-keys', data);
  }

  /**
   * Révoque une clé d'API existante
   */
  async revoke(id: string): Promise<{ success: boolean }> {
    return this.client.patch<{ success: boolean }>(`/api-keys/${id}/revoke`);
  }
}
