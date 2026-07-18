import { Injectable, Logger } from '@nestjs/common';
import { CreateApiKeyDto, EnvironmentEnum } from '../api-keys/dto/create-api-key.dto';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { AnalyticsService } from '../analytics/analytics.service';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);

  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly analyticsService: AnalyticsService
    // AuditLogsService and KnowledgeBaseService can be added later as needed
  ) {}

  /**
   * Retourne la liste des outils disponibles pour le LLM,
   * formatée selon le standard OpenAI "tools".
   */
  getAvailableTools(): ToolDefinition[] {
    return [
      {
        type: 'function',
        function: {
          name: 'get_analytics_summary',
          description: 'Récupère les statistiques d\'utilisation du locataire (utilisateurs actifs, requêtes IA, erreurs API, consommation de tokens) pour les X derniers jours.',
          parameters: {
            type: 'object',
            properties: {
              days: {
                type: 'number',
                description: 'Le nombre de jours pour l\'historique (défaut: 30)'
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_api_key',
          description: 'Génère une nouvelle clé d\'API pour le locataire.',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Le nom ou la description de la clé d\'API (ex: "Clé Backend Production")'
              }
            },
            required: ['name']
          }
        }
      }
    ];
  }

  /**
   * Exécute l'outil demandé par le LLM.
   * L'exécution se fait dans le contexte sécurisé du tenantId.
   */
  async executeTool(name: string, args: any, tenantId: string, actorId: string): Promise<any> {
    this.logger.debug(`Execution de l'outil [${name}] pour le tenant [${tenantId}] avec les arguments:`, args);

    switch (name) {
      case 'get_analytics_summary': {
        const days = args.days || 30;
        return this.analyticsService.getTenantDashboardSummary(tenantId, days);
      }
      
      case 'create_api_key': {
        if (!args.name) throw new Error("Le nom de la clé (name) est requis.");
        const dto: CreateApiKeyDto = { name: String(args.name), environment: EnvironmentEnum.PRODUCTION, scopes: [] };
        return this.apiKeysService.generateKey(tenantId, dto);
      }
      
      default:
        throw new Error(`Outil inconnu : ${name}`);
    }
  }
}
