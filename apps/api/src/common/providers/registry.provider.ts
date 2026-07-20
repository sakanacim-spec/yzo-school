import { Injectable } from '@nestjs/common';
import { SHARED_SAAS_REGISTRY, SaaSDefinition } from '@saas/types';

export interface IRegistryProvider {
  getSaaSList(): Promise<SaaSDefinition[]>;
  getSaaSById(id: string): Promise<SaaSDefinition | null>;
  getRequiredModules(saasId: string): Promise<string[]>;
}

@Injectable()
export class StaticRegistryProvider implements IRegistryProvider {
  async getSaaSList(): Promise<SaaSDefinition[]> {
    return SHARED_SAAS_REGISTRY;
  }

  async getSaaSById(id: string): Promise<SaaSDefinition | null> {
    const found = SHARED_SAAS_REGISTRY.find((s) => s.id === id);
    return found || null;
  }

  async getRequiredModules(saasId: string): Promise<string[]> {
    const saas = await this.getSaaSById(saasId);
    return saas ? saas.modules : [];
  }
}
