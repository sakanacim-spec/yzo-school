import { Module } from '@nestjs/common';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { VectorSearchService } from './vector-search.service';
import { SupabaseModule } from '../../common/supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService, VectorSearchService],
  exports: [KnowledgeBaseService, VectorSearchService],
})
export class KnowledgeBaseModule {}
