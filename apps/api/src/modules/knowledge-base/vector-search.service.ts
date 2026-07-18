import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import OpenAI from 'openai';

export interface SemanticSearchResult {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);
  private readonly openai: OpenAI | null;

  constructor(private readonly supabase: SupabaseService) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      this.openai = null;
      this.logger.warn(
        'OPENAI_API_KEY non définie — la recherche vectorielle sera désactivée. ' +
        'Configurez OPENAI_API_KEY dans votre .env pour activer le RAG.'
      );
    }
  }

  /**
   * Génère un embedding vectoriel via OpenAI text-embedding-3-small.
   * Modèle: text-embedding-3-small — 1536 dimensions, optimisé coût/qualité.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new InternalServerErrorException(
        'OPENAI_API_KEY non configurée. Impossible de générer un embedding.'
      );
    }

    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8191), // Limite token OpenAI
    });

    return response.data[0].embedding;
  }

  /**
   * Effectue une recherche de similarité cosinus (RAG) dans la base de connaissances.
   * Utilise OpenAI text-embedding-3-small pour l'embedding de la requête,
   * puis pgvector (opérateur <=>) sur saas_kb_articles via la fonction RPC match_articles.
   */
  async searchArticles(
    tenantId: string,
    query: string,
    onlyPublic: boolean = false,
    limit: number = 5
  ): Promise<SemanticSearchResult[]> {
    if (!this.openai) {
      this.logger.warn('Recherche vectorielle ignorée : OPENAI_API_KEY non configurée.');
      return [];
    }

    // 1. Génère l'embedding réel de la requête utilisateur
    const queryEmbedding = await this.generateEmbedding(query);

    // 2. Appel à la fonction RPC PostgreSQL `match_articles` (pgvector cosine similarity)
    const client = this.supabase.admin;
    const { data, error } = await client.rpc('match_articles', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: limit,
      p_tenant_id: tenantId,
      p_only_public: onlyPublic,
    });

    if (error) {
      throw new InternalServerErrorException(`Erreur RAG pgvector: ${error.message}`);
    }

    return data as SemanticSearchResult[];
  }
}
