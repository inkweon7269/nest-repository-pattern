import type { INestApplication } from '@nestjs/common';
import compression from 'compression';
import type { CompressionOptions } from 'compression';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Request, Response } from 'express';

export type { CompressionOptions };

// 응답 헤더 x-no-compression이 있으면 압축 건너뛰기 (SSE·스트리밍 등 opt-out 경로)
export function shouldCompressResponse(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  if (res.getHeader('x-no-compression')) return false;
  // @types/compression의 filter는 express Request/Response를 요구하나,
  // 런타임 객체는 실제 express 객체이므로 narrowing만 보정한다.
  return compression.filter(req as Request, res as Response);
}

export function applyCompressionMiddleware(
  app: INestApplication,
  options?: CompressionOptions,
): void {
  app.use(
    compression({
      // 작은 응답은 압축 오버헤드 회피 (compression 기본값 1KB 유지)
      threshold: 1024,
      filter: shouldCompressResponse,
      ...options,
    }),
  );
}
