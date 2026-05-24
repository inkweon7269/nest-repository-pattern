import type { INestApplication } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'http';
import {
  applyCompressionMiddleware,
  shouldCompressResponse,
} from './compression';

describe('shouldCompressResponse', () => {
  // compression의 기본 filter는 req를 읽지 않으므로 최소 mock으로 충분하다.
  const req = { headers: {} } as unknown as IncomingMessage;

  function createRes(headers: Record<string, unknown>): ServerResponse {
    return {
      getHeader: (name: string) => headers[name.toLowerCase()],
    } as unknown as ServerResponse;
  }

  it('응답에 x-no-compression 헤더가 있으면 false를 반환한다', () => {
    const res = createRes({
      'x-no-compression': 'true',
      'content-type': 'application/json',
    });

    expect(shouldCompressResponse(req, res)).toBe(false);
  });

  it('compressible content-type이고 opt-out 헤더가 없으면 true를 반환한다', () => {
    const res = createRes({ 'content-type': 'application/json' });

    expect(shouldCompressResponse(req, res)).toBe(true);
  });

  it('이미 압축된 content-type(image/png)이면 false를 반환한다', () => {
    const res = createRes({ 'content-type': 'image/png' });

    expect(shouldCompressResponse(req, res)).toBe(false);
  });
});

describe('applyCompressionMiddleware', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  function createApp(): { use: jest.Mock } {
    return { use: jest.fn() };
  }

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  // production-skip 경로는 통합 테스트(NODE_ENV=test)가 커버할 수 없는 유일한 분기이므로 단위 테스트로 검증한다.
  // 등록 경로(local·development·test)는 통합 테스트가 gzip 동작으로 이미 증명하므로 중복 테스트하지 않는다.
  it('production 환경에서는 압축 미들웨어를 등록하지 않는다 (nginx가 압축 담당)', () => {
    process.env.NODE_ENV = 'production';
    const app = createApp();

    applyCompressionMiddleware(app as unknown as INestApplication);

    expect(app.use).not.toHaveBeenCalled();
  });
});
