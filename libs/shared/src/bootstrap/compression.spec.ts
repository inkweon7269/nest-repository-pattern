import type { IncomingMessage, ServerResponse } from 'http';
import { shouldCompressResponse } from './compression';

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
