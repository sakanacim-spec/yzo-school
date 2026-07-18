import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { VectorSearchService } from '../knowledge-base/vector-search.service';
import { LlmProviderService, LlmMessage } from './llm-provider.service';
import * as crypto from 'crypto';

export interface ChatSession {
  id: string;
  session_token: string;
  messages: LlmMessage[];
}

@Injectable()
export class AiConciergeService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly vectorSearch: VectorSearchService,
    private readonly llmProvider: LlmProviderService,
  ) {}

  /**
   * Traite un message utilisateur public, fait le RAG et retourne le flux SSE
   */
  async processChatMessage(tenantId: string, userMessage: string, sessionToken?: string) {
    let token: string;
    let history: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [];

    // 1. Gestion de la Session
    if (!sessionToken) {
      token = crypto.randomUUID();
      await this.saveSession(tenantId, token, []);
    } else {
      token = sessionToken;
      const session = await this.getSession(tenantId, token);
      if (session) history = session.messages;
    }

    // 2. RAG : Recherche sémantique stricte sur le contenu public publié
    // Le VectorSearchService appelle match_articles avec `p_only_public = true`
    const contextArticles = await this.vectorSearch.searchArticles(tenantId, userMessage, true, 3);
    
    // 3. Prompt Engineering
    const contextText = contextArticles.length > 0 
      ? contextArticles.map(a => `Titre: ${a.title}\nContenu: ${a.content}`).join('\n\n')
      : 'Aucun document pertinent trouvé dans la base de connaissances.';

    const systemPrompt: LlmMessage = {
      role: 'system',
      content: `Tu es l'assistant de conciergerie IA d'une organisation. 
Tu dois répondre aux questions des visiteurs EN TE BASANT STRICTEMENT sur les extraits de la base de connaissances ci-dessous.
Si les extraits ne contiennent pas la réponse exacte, tu dois t'excuser poliment et dire que tu ne sais pas. N'invente jamais d'informations.

=== EXTRAITS DE LA BASE DE CONNAISSANCES ===
${contextText}
============================================`
    };

    // 4. Construction de l'historique de contexte
    const llmMessages: LlmMessage[] = [
      systemPrompt,
      ...history,
      { role: 'user', content: userMessage }
    ];

    // 5. Appel au modèle LLM en streaming
    const responseStream = await this.llmProvider.chatStream(llmMessages);

    // 6. Hook pour sauvegarder la conversation complète APRÈS la fin du stream
    // (Géré par le contrôleur ou un intercepteur dans une implémentation avancée, 
    // ici on retourne les infos nécessaires pour que le contrôleur s'en occupe).
    return {
      sessionToken: token,
      stream: responseStream.stream,
      historyContext: [...history, { role: 'user' as const, content: userMessage }]
    };
  }

  // --- Helpers DB Sessions ---

  async getSession(tenantId: string, sessionToken: string): Promise<ChatSession | null> {
    const { data, error } = await this.supabase.admin
      .from('saas_ai_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('session_token', sessionToken)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async saveSession(tenantId: string, sessionToken: string, messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }>) {
    // Upsert session
    const { error } = await this.supabase.admin
      .from('saas_ai_sessions')
      .upsert(
        { tenant_id: tenantId, session_token: sessionToken, messages },
        { onConflict: 'tenant_id,session_token' }
      );

    if (error) throw new InternalServerErrorException(error.message);
  }
}
