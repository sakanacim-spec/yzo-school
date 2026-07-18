import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResponseStream {
  stream: AsyncIterable<any>;
  usage?: () => Promise<{ promptTokens: number; completionTokens: number }>;
}

@Injectable()
export class LlmProviderService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    // On ne lève pas d'erreur au démarrage si la clé n'est pas là,
    // mais on le fera lors de l'appel.
    this.openai = new OpenAI({ 
      apiKey: apiKey || 'missing',
      timeout: 15000, // Circuit breaker de 15 secondes max
      maxRetries: 1,  // Pas de retry abusif pour éviter les coûts
    });
  }

  /**
   * Appelle le modèle LLM et retourne un stream
   */
  async chatStream(messages: LlmMessage[]): Promise<LlmResponseStream> {
    try {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      
      if (!apiKey || apiKey === 'mock-key') {
        // Mock stream pour les tests locaux
        async function* mockStream() {
          const words = "Bonjour ! Je suis le concierge IA d'Oziow. Comment puis-je vous aider ?".split(' ');
          for (const word of words) {
            yield { choices: [{ delta: { content: word + ' ' } }] };
            await new Promise(r => setTimeout(r, 50));
          }
        }
        return { stream: mockStream() };
      }

      const stream = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        stream: true,
        max_tokens: 500, // Limite MVP pour éviter de générer des réponses kilométriques coûteuses
        stream_options: { include_usage: true }, // Pour récupérer l'usage en fin de stream
      });

      // Dans une implémentation avancée, on pourrait wrapper le stream pour extraire l'usage
      // et le renvoyer séparément pour le metering.
      return { stream };
    } catch (error: any) {
      throw new InternalServerErrorException(`Erreur LLM Provider: ${error.message}`);
    }
  }
}
