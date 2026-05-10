import {
  pushHttpContext,
  getHttpContext,
  clearHttpContext,
  resetHttpContextForTest,
  HttpContext,
} from './http-context-registry';

describe('http-context-registry', () => {
  beforeEach(() => {
    resetHttpContextForTest();
  });

  it('pushHttpContext 후 동일 traceId로 getHttpContext하면 저장한 컨텍스트가 반환된다', () => {
    const ctx: HttpContext = {
      method: 'POST',
      route: '/v1/posts',
      userId: 7,
    };

    pushHttpContext('trace-1', ctx);

    expect(getHttpContext('trace-1')).toEqual(ctx);
  });

  it('등록되지 않은 traceId로 조회하면 undefined를 반환한다', () => {
    expect(getHttpContext('unknown-trace')).toBeUndefined();
  });

  it('clearHttpContext 후 같은 traceId로 조회하면 undefined를 반환한다', () => {
    pushHttpContext('trace-1', { method: 'GET', route: '/v1/posts/:id' });

    clearHttpContext('trace-1');

    expect(getHttpContext('trace-1')).toBeUndefined();
  });

  it('같은 traceId로 다시 push하면 마지막 값이 우선한다', () => {
    pushHttpContext('trace-1', { method: 'GET', route: '/v1/posts' });
    pushHttpContext('trace-1', { method: 'POST', route: '/v1/posts' });

    expect(getHttpContext('trace-1')).toEqual({
      method: 'POST',
      route: '/v1/posts',
    });
  });

  it('userId를 생략한 컨텍스트도 정상 저장·조회된다 (비인증 endpoint 케이스)', () => {
    const ctx: HttpContext = { method: 'POST', route: '/v1/auth/login' };

    pushHttpContext('trace-anon', ctx);

    const result = getHttpContext('trace-anon');
    expect(result).toEqual(ctx);
    expect(result?.userId).toBeUndefined();
  });

  it('MAX_ENTRIES(1000)에 도달하면 Map을 비우고 새 entry를 받는다 (메모리 leak 안전망)', () => {
    for (let i = 0; i < 1000; i++) {
      pushHttpContext(`trace-${i}`, { method: 'GET', route: '/v1/x' });
    }
    expect(getHttpContext('trace-0')).toBeDefined();
    expect(getHttpContext('trace-999')).toBeDefined();

    pushHttpContext('trace-overflow', { method: 'POST', route: '/v1/y' });

    expect(getHttpContext('trace-0')).toBeUndefined();
    expect(getHttpContext('trace-999')).toBeUndefined();
    expect(getHttpContext('trace-overflow')).toEqual({
      method: 'POST',
      route: '/v1/y',
    });
  });

  it('resetHttpContextForTest는 모든 entry를 비운다', () => {
    pushHttpContext('a', { method: 'GET' });
    pushHttpContext('b', { method: 'POST' });

    resetHttpContextForTest();

    expect(getHttpContext('a')).toBeUndefined();
    expect(getHttpContext('b')).toBeUndefined();
  });
});
