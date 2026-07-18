import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FastifyReply } from 'fastify';

/**
 * Intercepteur pour désactiver totalement la mise en cache HTTP sur les endpoints sensibles.
 */
@Injectable()
export class NoCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const response = http.getResponse<FastifyReply>();

    return next.handle().pipe(
      tap(() => {
        // Fastify utilise la méthode .header() ou .headers()
        response.header(
          'Cache-Control',
          'no-store, no-cache, must-revalidate, private',
        );
        response.header('Pragma', 'no-cache');
        response.header('Expires', '0');
      }),
    );
  }
}
