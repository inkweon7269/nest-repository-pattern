import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { IdempotencyInterceptor } from './idempotency.interceptor';

const VALID_UUID = '8d8b30e3-de52-4f62-90b3-4c8f1c1c1a1e';
const PROCESSING_MARKER = '__PROCESSING__';

type MockRedis = {
  set: jest.Mock;
  get: jest.Mock;
  del: jest.Mock;
};

type MockResponse = {
  statusCode: number;
  status: jest.Mock;
};

function createExecutionContext(
  request: Record<string, unknown>,
  response: MockResponse,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function createRequest(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    headers: { 'idempotency-key': VALID_UUID },
    user: { id: 1 },
    ...overrides,
  };
}

describe('IdempotencyInterceptor', () => {
  let redis: MockRedis;
  let response: MockResponse;
  let interceptor: IdempotencyInterceptor;
  let next: CallHandler;

  beforeEach(() => {
    redis = { set: jest.fn(), get: jest.fn(), del: jest.fn() };
    response = { statusCode: 201, status: jest.fn() };
    const logger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as PinoLogger;
    interceptor = new IdempotencyInterceptor(redis as unknown as Redis, logger);
    next = { handle: jest.fn().mockReturnValue(of({ id: 1 })) };
  });

  it('Idempotency-Key 헤더가 없으면 BadRequestException을 발생시킨다', async () => {
    const ctx = createExecutionContext(
      createRequest({ headers: {} }),
      response,
    );

    await expect(interceptor.intercept(ctx, next)).rejects.toThrow(
      BadRequestException,
    );
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('헤더가 UUID v4 형식이 아니면 BadRequestException을 발생시킨다', async () => {
    const ctx = createExecutionContext(
      createRequest({ headers: { 'idempotency-key': 'not-a-uuid' } }),
      response,
    );

    await expect(interceptor.intercept(ctx, next)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('인증된 사용자가 없으면 UnauthorizedException을 발생시킨다', async () => {
    const ctx = createExecutionContext(
      createRequest({ user: undefined }),
      response,
    );

    await expect(interceptor.intercept(ctx, next)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('헤더가 배열로 전달되면 첫 요소를 멱등성 키로 사용한다', async () => {
    redis.set.mockResolvedValue('OK');
    const ctx = createExecutionContext(
      createRequest({ headers: { 'idempotency-key': [VALID_UUID, 'other'] } }),
      response,
    );

    await firstValueFrom(await interceptor.intercept(ctx, next));

    expect(redis.set).toHaveBeenCalledWith(
      `idempotency:1:${VALID_UUID}`,
      PROCESSING_MARKER,
      'EX',
      60,
      'NX',
    );
  });

  it('선점에 성공하면 handler를 실행하고 응답을 24시간 TTL로 캐시한다', async () => {
    redis.set.mockResolvedValue('OK');
    const ctx = createExecutionContext(createRequest(), response);

    const result = await firstValueFrom(await interceptor.intercept(ctx, next));

    expect(result).toEqual({ id: 1 });
    expect(redis.set).toHaveBeenNthCalledWith(
      1,
      `idempotency:1:${VALID_UUID}`,
      PROCESSING_MARKER,
      'EX',
      60,
      'NX',
    );
    expect(redis.set).toHaveBeenNthCalledWith(
      2,
      `idempotency:1:${VALID_UUID}`,
      JSON.stringify({ statusCode: 201, body: { id: 1 } }),
      'PX',
      1000 * 60 * 60 * 24,
    );
  });

  it('handler가 실패하면 선점 키를 해제하고 원본 에러를 다시 던진다', async () => {
    redis.set.mockResolvedValue('OK');
    redis.del.mockResolvedValue(1);
    next = {
      handle: jest.fn().mockReturnValue(throwError(() => new Error('boom'))),
    };
    const ctx = createExecutionContext(createRequest(), response);

    await expect(
      firstValueFrom(await interceptor.intercept(ctx, next)),
    ).rejects.toThrow('boom');
    expect(redis.del).toHaveBeenCalledWith(`idempotency:1:${VALID_UUID}`);
  });

  it('다른 요청이 처리 중(PROCESSING 마커)이면 ConflictException을 발생시킨다', async () => {
    redis.set.mockResolvedValue(null);
    redis.get.mockResolvedValue(PROCESSING_MARKER);
    const ctx = createExecutionContext(createRequest(), response);

    await expect(interceptor.intercept(ctx, next)).rejects.toThrow(
      ConflictException,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('캐시된 응답이 있으면 handler를 실행하지 않고 저장된 상태 코드와 본문을 재생한다', async () => {
    redis.set.mockResolvedValue(null);
    redis.get.mockResolvedValue(
      JSON.stringify({ statusCode: 201, body: { id: 5 } }),
    );
    const ctx = createExecutionContext(createRequest(), response);

    const result = await firstValueFrom(await interceptor.intercept(ctx, next));

    expect(result).toEqual({ id: 5 });
    expect(response.status).toHaveBeenCalledWith(201);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('캐시 엔트리가 손상되었으면 키를 삭제하고 ConflictException을 발생시킨다 (PRD §7-1: 현재 동작 고정)', async () => {
    redis.set.mockResolvedValue(null);
    redis.get.mockResolvedValue('{corrupted');
    redis.del.mockResolvedValue(1);
    const ctx = createExecutionContext(createRequest(), response);

    await expect(interceptor.intercept(ctx, next)).rejects.toThrow(
      ConflictException,
    );
    expect(redis.del).toHaveBeenCalledWith(`idempotency:1:${VALID_UUID}`);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('선점 실패 후 키가 만료되어 GET이 null이면 ConflictException으로 안전하게 차단한다', async () => {
    redis.set.mockResolvedValue(null);
    redis.get.mockResolvedValue(null);
    const ctx = createExecutionContext(createRequest(), response);

    await expect(interceptor.intercept(ctx, next)).rejects.toThrow(
      ConflictException,
    );
    expect(next.handle).not.toHaveBeenCalled();
  });
});
