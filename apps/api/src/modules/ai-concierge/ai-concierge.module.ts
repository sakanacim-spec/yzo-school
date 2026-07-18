import { Module } from '@nestjs/common';
import { AiConciergeController } from './ai-concierge.controller';
import { AiAssistantController } from './ai-assistant.controller';
import { AiConciergeService } from './ai-concierge.service';
import { LlmProviderService } from './llm-provider.service';
import { LlmOrchestratorService } from './llm-orchestrator.service';
import { ToolRegistryService } from './tool-registry.service';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { SupabaseModule } from '../../common/supabase/supabase.module';

@Module({
  imports: [
    SupabaseModule, 
    KnowledgeBaseModule,
    ApiKeysModule,
    AnalyticsModule
  ],
  controllers: [AiConciergeController, AiAssistantController],
  providers: [
    AiConciergeService, 
    LlmProviderService, 
    LlmOrchestratorService, 
    ToolRegistryService
  ],
  exports: [AiConciergeService],
})
export class AiConciergeModule {}
