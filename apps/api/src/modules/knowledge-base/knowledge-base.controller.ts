import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { KnowledgeBaseService, CreateCategoryDto, CreateArticleDto } from './knowledge-base.service';
import { VectorSearchService } from './vector-search.service';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Knowledge Base')
@ApiBearerAuth('JWT')
@Controller({ path: 'knowledge-base', version: '1' })
export class KnowledgeBaseController {
  constructor(
    private readonly kbService: KnowledgeBaseService,
    private readonly vectorService: VectorSearchService,
  ) {}

  // --- CATÉGORIES ---
  
  @Get('categories')
  @ApiOperation({ summary: 'Lister les catégories' })
  listCategories(@TenantId() tenantId: string) {
    return this.kbService.listCategories(tenantId);
  }

  @Post('categories')
  @ApiOperation({ summary: 'Créer une catégorie' })
  @Roles('SAAS_SUPER_ADMIN', 'TENANT_ADMIN')
  createCategory(
    @TenantId() tenantId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.kbService.createCategory(tenantId, dto);
  }

  // --- ARTICLES ---

  @Get('articles')
  @ApiOperation({ summary: 'Lister les articles' })
  @ApiQuery({ name: 'category_id', required: false })
  listArticles(
    @TenantId() tenantId: string,
    @Query('category_id') categoryId?: string,
  ) {
    return this.kbService.listArticles(tenantId, categoryId);
  }

  @Post('articles')
  @ApiOperation({ summary: 'Créer un article' })
  @Roles('SAAS_SUPER_ADMIN', 'TENANT_ADMIN')
  createArticle(
    @TenantId() tenantId: string,
    @Body() dto: CreateArticleDto,
  ) {
    return this.kbService.createArticle(tenantId, dto);
  }

  // --- RECHERCHE IA (RAG) ---

  @Post('search')
  @ApiOperation({ summary: 'Recherche sémantique par similarité (RAG)' })
  @ApiQuery({ name: 'only_public', required: false, type: Boolean })
  searchArticles(
    @TenantId() tenantId: string,
    @Body('query') query: string,
    @Query('only_public') onlyPublic?: boolean,
  ) {
    // Si la requête provient d'une clé API M2M utilisée par l'AI Concierge public,
    // le paramètre only_public devrait être forcé à TRUE par sécurité, mais pour l'instant 
    // on l'expose tel quel pour la flexibilité.
    const isPublic = onlyPublic === true || onlyPublic === 'true' as any;
    return this.vectorService.searchArticles(tenantId, query, isPublic);
  }
}
