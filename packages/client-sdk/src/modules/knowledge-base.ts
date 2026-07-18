import { OziowHttpClient } from '../client';

export interface Category {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Article {
  id: string;
  category_id?: string;
  title: string;
  language: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  is_public: boolean;
  updated_at: string;
}

export interface SemanticSearchResult {
  id: string;
  title: string;
  content: string;
  metadata: any;
  similarity: number;
}

export class KnowledgeBaseModule {
  constructor(private client: OziowHttpClient) {}

  // --- Catégories ---

  async listCategories(): Promise<Category[]> {
    return this.client.get<Category[]>('/knowledge-base/categories');
  }

  async createCategory(data: { name: string; slug: string }): Promise<Category> {
    return this.client.post<Category>('/knowledge-base/categories', data);
  }

  // --- Articles ---

  async listArticles(categoryId?: string): Promise<Article[]> {
    const query = categoryId ? `?category_id=${categoryId}` : '';
    return this.client.get<Article[]>(`/knowledge-base/articles${query}`);
  }

  async createArticle(data: {
    title: string;
    content: string;
    category_id?: string;
    language?: string;
    status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    is_public?: boolean;
    metadata?: any;
  }): Promise<Article> {
    return this.client.post<Article>('/knowledge-base/articles', data);
  }

  // --- Recherche IA ---

  /**
   * Effectue une recherche de similarité cosinus (RAG)
   */
  async search(query: string, onlyPublic: boolean = false): Promise<SemanticSearchResult[]> {
    return this.client.post<SemanticSearchResult[]>(`/knowledge-base/search?only_public=${onlyPublic}`, { query });
  }
}
