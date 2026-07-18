import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { LlmOrchestratorService } from './llm-orchestrator.service';
import { TenantId, AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { LlmMessage } from './llm-provider.service';

export class AssistantChatDto {
  @ApiProperty({ description: 'Message de l\'utilisateur pour l\'assistant' })
  @IsString()
  @IsNotEmpty()
  message: string;
}

@ApiTags('AI Assistant')
@ApiBearerAuth('JWT')
@Controller({ path: 'assistant', version: '1' })
export class AiAssistantController {
  constructor(private readonly orchestrator: LlmOrchestratorService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Discuter avec l\'Assistant IA (Function Calling - Bloquant)' })
  async chatWithAssistant(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string,
    @Body() dto: AssistantChatDto,
  ) {
    if (!tenantId) {
      throw new UnauthorizedException('Tenant ID manquant');
    }

    const messages: LlmMessage[] = [
      {
        role: 'system',
        content: `Tu es l'assistant intelligent de la plateforme Oziow SaaS. 
        Tu aides l'utilisateur à gérer son espace de travail. Tu as accès à des outils (fonctions) 
        pour créer des clés API, lire les statistiques, etc. Utilise-les si nécessaire.`
      },
      {
        role: 'user',
        content: dto.message
      }
    ];

    const actorId = user?.id || 'unknown_actor';
    const result = await this.orchestrator.processChat(messages, tenantId, actorId);

    return {
      message: result.response,
      usage: result.usage
    };
  }
}
