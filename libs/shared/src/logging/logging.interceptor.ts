import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { PinoLogger } from 'nestjs-pino';
import { context as otelContext, trace } from '@opentelemetry/api';
import {
  pushHttpContext,
  clearHttpContext,
} from '../otel/http-context-registry';

const SENSITIVE_FIELDS = new Set([
  'password',
  'token',
  'refreshtoken',
  'accesstoken',
  'secret',
  'authorization',
]);

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>);
  }
  return value;
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = SENSITIVE_FIELDS.has(key.toLowerCase())
      ? '[REDACTED]'
      : sanitizeValue(value);
  }
  return sanitized;
}

function sanitizeBody(
  body: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length === 0
  ) {
    return undefined;
  }

  return sanitizeObject(body);
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(LoggingInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const controller = context.getClass().name;
    const method = context.getHandler().name;
    const req = context.switchToHttp().getRequest<Request>();
    const body = sanitizeBody(req.body as Record<string, unknown>);
    const startTime = Date.now();

    // OTEL active span의 traceId를 키로 HTTP 컨텍스트를 모듈 레벨 Map에 push.
    // 같은 요청 내에서 발생한 PG slow query span이 SlowQuerySpanProcessor.onEnd에서
    // 동일 traceId로 lookup해 알림 메시지에 합칠 수 있도록 한다.
    // OTEL 비활성화(OTEL_ENABLED=false) 환경에선 traceId가 없어 push가 스킵된다.
    const traceId = trace.getSpan(otelContext.active())?.spanContext().traceId;

    if (traceId) {
      // Express는 컨트롤러 매칭 후 req.route.path에 파라미터화된 경로(/v1/posts/:id)를 채운다.
      // express의 Request 타입에 route가 명시돼 있지 않아 별도 타입 가드로 안전하게 꺼낸다.
      const expressRoute = (req as unknown as { route?: { path?: string } })
        .route;
      const userId = (req.user as { id?: number } | undefined)?.id;

      pushHttpContext(traceId, {
        method: req.method,
        route: expressRoute?.path,
        userId,
      });
    }

    return next.handle().pipe(
      // 요청 종료 시점(정상/예외 무관)에 Map entry 정리. 누적 메모리 leak 방지.
      finalize(() => {
        if (traceId) clearHttpContext(traceId);
      }),
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.info(
            { controller, handler: method, body, durationMs: duration },
            '%s.%s completed in %dms',
            controller,
            method,
            duration,
          );
        },
        error: (err: Error) => {
          const duration = Date.now() - startTime;
          const status = err instanceof HttpException ? err.getStatus() : 500;
          const logData = {
            controller,
            handler: method,
            body,
            durationMs: duration,
            err,
          };
          const msg = '%s.%s failed after %dms';

          if (status >= 500) {
            this.logger.error(logData, msg, controller, method, duration);
          } else {
            this.logger.warn(logData, msg, controller, method, duration);
          }
        },
      }),
    );
  }
}
