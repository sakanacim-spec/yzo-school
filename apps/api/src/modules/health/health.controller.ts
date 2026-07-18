import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SupabaseService } from '../../common/supabase/supabase.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly supabase: SupabaseService) {}
  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check étendu — vérifie API et BDD' })
  @ApiResponse({ status: 200, description: 'Tout est opérationnel' })
  @ApiResponse({ status: 503, description: 'Service indisponible (BDD HS)' })
  async check() {
    try {
      // Test de la connexion Supabase via un appel simple
      const { data, error } = await this.supabase.admin.from('saas_tenants').select('id').limit(1);
      
      if (error) {
        throw new Error('Supabase unreachable');
      }

      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? '1.0.0',
        environment: process.env.NODE_ENV ?? 'development',
      };
    } catch (err) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }
  }

  @Public()
  @Get('ping')
  @ApiOperation({ summary: 'Ping simple' })
  ping() {
    return { pong: true };
  }
}
