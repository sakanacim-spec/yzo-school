import { Controller, Post, Body, UnauthorizedException, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { FastifyReply } from 'fastify';
import { ServerResponse } from 'http';
import { AiConciergeService } from './ai-concierge.service';
import { TenantId, AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

export class ChatDto {
  @ApiProperty({ description: 'Message de l\'utilisateur' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({ description: 'Token de session pour continuer une conversation' })
  @IsString()
  @IsOptional()
  session_token?: string;
}

@ApiTags('AI Concierge')
@ApiBearerAuth('JWT') // Utilisera x-api-key en réalité via JwtAuthGuard
@Controller({ path: 'ai-concierge', version: '1' })
export class AiConciergeController {
  constructor(private readonly conciergeService: AiConciergeService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Discuter avec le Concierge IA (Streaming SSE)' })
  async chatStream(
    @CurrentUser() user: AuthUser,
    @TenantId() tenantId: string,
    @Body() dto: ChatDto,
    @Res() res: FastifyReply,
  ) {
    if (!tenantId) {
      throw new UnauthorizedException('Tenant ID manquant');
    }

    const { sessionToken, stream, historyContext } = await this.conciergeService.processChatMessage(
      tenantId,
      dto.message,
      dto.session_token
    );

    // Compatibilité Fastify: res.raw est l'objet http.ServerResponse de Node
    const raw = (res.raw ? res.raw : res) as unknown as ServerResponse;
    
    raw.setHeader('Content-Type', 'text/event-stream');
    raw.setHeader('Cache-Control', 'no-cache');
    raw.setHeader('Connection', 'keep-alive');
    if (raw.flushHeaders) {
      raw.flushHeaders();
    }

    // 1. Envoyer le token de session en premier
    raw.write(`data: ${JSON.stringify({ type: 'session', token: sessionToken })}\n\n`);

    let fullAssistantReply = '';

    try {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) {
          fullAssistantReply += text;
          raw.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
        }
      }
      raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (e: any) {
      raw.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
    } finally {
      raw.end();
      // Sauvegarde en DB
      const newHistory: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [
        ...historyContext,
        { role: 'assistant', content: fullAssistantReply }
      ];
      this.conciergeService.saveSession(tenantId, sessionToken as string, newHistory).catch(err => {
        console.error('Erreur sauvegarde session IA:', err);
      });
    }
  }
}
