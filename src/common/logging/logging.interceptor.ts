import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(LoggingInterceptor.name);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const controller = context.getClass().name;
    const method = context.getHandler().name;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.info(
            { controller, handler: method, durationMs: duration },
            '%s.%s completed in %dms',
            controller,
            method,
            duration,
          );
        },
        error: (err: Error) => {
          const duration = Date.now() - startTime;
          this.logger.error(
            { controller, handler: method, durationMs: duration, err },
            '%s.%s failed after %dms',
            controller,
            method,
            duration,
          );
        },
      }),
    );
  }
}
