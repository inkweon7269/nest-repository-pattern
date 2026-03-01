import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { PinoLogger } from 'nestjs-pino';

const SENSITIVE_FIELDS = new Set([
  'password',
  'token',
  'refreshtoken',
  'accesstoken',
  'secret',
  'authorization',
]);

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

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    sanitized[key] = SENSITIVE_FIELDS.has(key.toLowerCase())
      ? '[REDACTED]'
      : value;
  }
  return sanitized;
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

    return next.handle().pipe(
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
