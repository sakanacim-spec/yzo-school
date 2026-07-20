import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as crypto from 'crypto';

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const traceId =
      (req.headers['x-trace-id'] as string) ||
      (req.headers['x-correlation-id'] as string) ||
      crypto.randomUUID();
    req.traceId = traceId;

    if (res.setHeader && typeof res.setHeader === 'function') {
      res.setHeader('x-trace-id', traceId);
    }

    return next.handle().pipe(
      tap(() => {
        // Trace span completion
      }),
    );
  }
}
