import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { VectorSearchService } from './vector-search.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

export interface CreateCategoryDto {
  name: string;
  slug: string;
}

export interface CreateArticleDto {
  title: string;
  content: string;
  category_id?: string;
  language?: string;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  is_public?: boolean;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly vectorSearch: VectorSearchService,
    private readonly auditLogs: AuditLogsService
  ) {}

  // --- CATÉGORIES ---

  async createCategory(tenantId: string, dto: CreateCategoryDto) {
    const client = this.supabase.admin; // Bypasses RLS for M2M (App-level isolation via tenant_id)
    const { data, error } = await client
      .from('saas_kb_categories')
      .insert({ tenant_id: tenantId, ...dto })
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async listCategories(tenantId: string) {
    const { data, error } = await this.supabase.admin
      .from('saas_kb_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');
    
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  // --- ARTICLES ---

  async createArticle(tenantId: string, dto: CreateArticleDto) {
    // 1. Générer l'embedding réel via OpenAI text-embedding-3-small
    let embedding: string | null = null;
    try {
      const vector = await this.vectorSearch.generateEmbedding(
        `${dto.title}\n\n${dto.content}`
      );
      embedding = `[${vector.join(',')}]`;
    } catch (e: any) {
      // OPENAI_API_KEY non configurée : on stocke l'article sans embedding
      // La recherche vectorielle retournera 0 résultat pour cet article
    }

    const client = this.supabase.admin;
    const { data, error } = await client
      .from('saas_kb_articles')
      .insert({
        tenant_id: tenantId,
        title: dto.title,
        content: dto.content,
        category_id: dto.category_id,
        language: dto.language || 'fr',
        status: dto.status || 'DRAFT',
        is_public: dto.is_public ?? false,
        metadata: dto.metadata || {},
        embedding,
      })
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);

    this.auditLogs.log({
      tenantId,
      action: 'article.created',
      severity: 'INFO',
      entityType: 'article',
      entityId: data.id,
      metadata: { title: dto.title, is_public: dto.is_public }
    });

    return data;
  }

  async listArticles(tenantId: string, categoryId?: string) {
    let query = this.supabase.admin
      .from('saas_kb_articles')
      .select('id, title, category_id, language, status, is_public, updated_at')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false });

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }
}
