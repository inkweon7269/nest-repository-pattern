import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { isUUID } from 'class-validator';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';

interface CachedResponse {
  statusCode: number;
  body: Record<string, unknown> | null;
}

const PROCESSING_MARKER = '__PROCESSING__';
const IDEMPOTENCY_TTL_MS = 1000 * 60 * 60 * 24; // 24시간 (밀리초, ioredis PX 옵션 기준)
const PROCESSING_TTL_SEC = 60; // ioredis SET NX의 EX 옵션은 초 단위

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(IdempotencyInterceptor.name);
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();
    const rawHeader = request.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    // 1. 헤더 검증
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    if (!isUUID(idempotencyKey, '4')) {
      throw new BadRequestException('Idempotency-Key must be a valid UUID');
    }

    const userId = (request as Request & { user?: { id?: number } }).user?.id;
    if (!userId) {
      throw new UnauthorizedException(
        'Idempotent endpoints require authentication',
      );
    }
    const cacheKey = `idempotency:${userId}:${idempotencyKey}`;

    // 2. 원자적 선점: SET NX (ioredis 직접 사용)
    const acquired = await this.redis.set(
      cacheKey,
      PROCESSING_MARKER,
      'EX',
      PROCESSING_TTL_SEC,
      'NX',
    );

    if (!acquired) {
      // 이미 키가 존재 → 캐시 히트이거나 다른 요청이 처리 중
      const raw = await this.redis.get(cacheKey);
      if (raw === PROCESSING_MARKER) {
        throw new ConflictException(
          'A request with this Idempotency-Key is currently being processed',
        );
      }
      if (raw) {
        try {
          const existing = JSON.parse(raw) as CachedResponse;
          this.logger.info(
            { cacheKey },
            'Idempotency cache hit — returning cached response',
          );
          response.status(existing.statusCode);
          return of(existing.body);
        } catch {
          this.logger.warn({ cacheKey }, 'Corrupted cache entry, reprocessing');
          await this.redis.del(cacheKey);
        }
      }
      // SET NX 실패 후 GET이 null (키가 두 명령 사이에 만료됨) → 409로 안전하게 차단
      throw new ConflictException(
        'A request with this Idempotency-Key is currently being processed',
      );
    }

    // 3. Handler 실행 + 응답 저장
    return next.handle().pipe(
      tap((responseBody: unknown) => {
        const cachedValue: CachedResponse = {
          statusCode: response.statusCode,
          body: (responseBody as Record<string, unknown>) ?? null,
        };
        this.redis
          .set(cacheKey, JSON.stringify(cachedValue), 'PX', IDEMPOTENCY_TTL_MS)
          .catch((err: Error) => {
            this.logger.error(
              { cacheKey, err },
              'Failed to cache idempotency response — subsequent retries may create duplicates',
            );
          });
        this.logger.info(
          { cacheKey, statusCode: response.statusCode },
          'Idempotency response cached',
        );
      }),
      catchError((error: Error) => {
        return from(this.redis.del(cacheKey)).pipe(
          switchMap(() => throwError(() => error)),
        );
      }),
    );
  }
}
