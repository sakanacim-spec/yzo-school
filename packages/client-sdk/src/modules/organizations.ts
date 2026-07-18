import { OziowHttpClient } from '../client';

export interface Organization {
  id: string;
  tenant_id: string;
  name: string;
  code?: string;
  address?: string;
  metadata?: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export class OrganizationsModule {
  constructor(private readonly client: OziowHttpClient) {}

  /**
   * Récupère la liste des organisations du tenant (ex: toutes les écoles)
   */
  public async list(): Promise<Organization[]> {
    // Note: l'URL dépend de la façon dont l'API expose les routes.
    // Supposons /v1/organizations
    return (this.client as any).get('/v1/organizations');
  }

  /**
   * Crée une nouvelle organisation
   */
  public async create(data: Partial<Organization>): Promise<Organization> {
    return (this.client as any).post('/v1/organizations', data);
  }

  /**
   * Met à jour une organisation existante
   */
  public async update(id: string, data: Partial<Organization>): Promise<Organization> {
    return (this.client as any).put(`/v1/organizations/${id}`, data);
  }

  /**
   * Supprime (ou désactive) une organisation
   */
  public async delete(id: string): Promise<void> {
    return (this.client as any).delete(`/v1/organizations/${id}`);
  }
}
