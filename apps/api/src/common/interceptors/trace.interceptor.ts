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

    // Standard W3C Trace Context (traceparent: version-trace_id-parent_id-trace_flags)
    const w3cTraceParent = req.headers['traceparent'] as string;
    const w3cTraceState = req.headers['tracestate'] as string;

    let traceId: string;
    let spanId: string = crypto.randomBytes(8).toString('hex');
    let traceParentHeader: string;

    if (w3cTraceParent && w3cTraceParent.startsWith('00-')) {
      const parts = w3cTraceParent.split('-');
      if (parts.length >= 4) {
        traceId = parts[1];
        traceParentHeader = `00-${traceId}-${spanId}-01`;
      } else {
        traceId = crypto.randomUUID().replace(/-/g, '');
        traceParentHeader = `00-${traceId}-${spanId}-01`;
      }
    } else {
      traceId = (req.headers['x-trace-id'] as string) || (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
      const cleanTraceId = traceId.replace(/-/g, '').padEnd(32, '0').slice(0, 32);
      traceParentHeader = `00-${cleanTraceId}-${spanId}-01`;
    }

    req.traceId = traceId;
    req.spanId = spanId;
    req.traceParent = traceParentHeader;

    if (res.setHeader && typeof res.setHeader === 'function') {
      res.setHeader('traceparent', traceParentHeader);
      if (w3cTraceState) res.setHeader('tracestate', w3cTraceState);
      res.setHeader('x-trace-id', traceId);
    }

    return next.handle().pipe(
      tap(() => {
        // Trace span completion
      }),
    );
  }
}
