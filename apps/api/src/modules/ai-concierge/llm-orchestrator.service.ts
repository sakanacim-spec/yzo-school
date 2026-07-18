import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ToolRegistryService } from './tool-registry.service';
import { LlmMessage } from './llm-provider.service';

@Injectable()
export class LlmOrchestratorService {
  private openai: OpenAI;
  private readonly logger = new Logger(LlmOrchestratorService.name);

  constructor(
    private configService: ConfigService,
    private toolRegistry: ToolRegistryService
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.openai = new OpenAI({ 
      apiKey: apiKey || 'missing',
      timeout: 30000,
    });
  }

  /**
   * Orchestre la conversation avec l'IA.
   * Gère la boucle de Function Calling si le LLM décide d'appeler un outil.
   */
  async processChat(
    messages: LlmMessage[], 
    tenantId: string, 
    actorId: string
  ): Promise<{ response: string; usage?: any }> {
    try {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey || apiKey === 'mock-key') {
        this.logger.warn('Clé OpenAI manquante ou mock-key détectée. Utilisation du Mock Assistant avec Tool calling simulé.');
        
        // Simulation: si on demande une clé API
        const userMsg = messages[messages.length - 1].content.toLowerCase();
        if (userMsg.includes('clé api') || userMsg.includes('api key')) {
          const mockArgs = { name: 'Clé générée par Mock IA' };
          const result = await this.toolRegistry.executeTool('create_api_key', mockArgs, tenantId, actorId);
          return { response: `[MOCK] J'ai créé votre clé API. Résultat: ${JSON.stringify(result)}` };
        } else if (userMsg.includes('stat')) {
          const result = await this.toolRegistry.executeTool('get_analytics_summary', { days: 30 }, tenantId, actorId);
          return { response: `[MOCK] Voici vos statistiques: ${JSON.stringify(result.overview)}` };
        }

        return { response: '[MOCK] Bonjour, je suis l\'assistant IA. Précisez si vous voulez une clé API ou des stats.' };
      }

      const tools = this.toolRegistry.getAvailableTools();
      const messagesHistory: any[] = [...messages];

      // Premier appel à OpenAI
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messagesHistory,
        tools: tools,
        tool_choice: 'auto',
      });

      const message = response.choices[0].message;
      messagesHistory.push(message); // Ajouter la réponse de l'assistant à l'historique

      // Vérifier si le modèle veut utiliser un outil
      if (message.tool_calls && message.tool_calls.length > 0) {
        this.logger.log(`Le LLM a demandé à appeler ${message.tool_calls.length} fonction(s).`);

        for (const toolCall of message.tool_calls) {
          if (toolCall.type !== 'function') continue;
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          let toolResult;
          try {
            // Exécution sécurisée de l'outil côté Backend
            toolResult = await this.toolRegistry.executeTool(functionName, functionArgs, tenantId, actorId);
          } catch (err: any) {
            this.logger.error(`Erreur d'exécution de l'outil ${functionName} :`, err.message);
            toolResult = { error: err.message };
          }

          // Renvoyer le résultat de la fonction au modèle
          messagesHistory.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify(toolResult),
          });
        }

        // Deuxième appel à OpenAI avec les résultats des fonctions
        const finalResponse = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: messagesHistory,
        });

        return {
          response: finalResponse.choices[0].message.content || '',
          usage: finalResponse.usage
        };
      }

      // Si pas d'outil appelé, on retourne la réponse directe
      return {
        response: message.content || '',
        usage: response.usage
      };
      
    } catch (error: any) {
      this.logger.error(`Erreur LlmOrchestrator: ${error.message}`);
      throw new InternalServerErrorException(`Erreur Orchestrateur IA: ${error.message}`);
    }
  }
}
