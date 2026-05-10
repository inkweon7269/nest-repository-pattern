/**
 * HTTP 요청 컨텍스트(method, route, userId)를 OTEL traceId 키로 임시 보관하는
 * 모듈 레벨 다리(bridge).
 *
 * --- 왜 필요한가? ---
 *
 * 슬로우 쿼리 알림은 두 영역의 협력으로 만들어진다.
 *
 *   - 보내는 쪽(NestJS LoggingInterceptor): HTTP 요청의 method/route/userId를 알고 있다.
 *   - 받는 쪽(boot-time SpanProcessor): pg slow query span을 잡지만 그 span이 어느
 *     HTTP 요청에서 발생했는지 직접 알 수 없다.
 *
 * 두 영역은 부팅 시점·DI 컨테이너 소속이 달라 서로를 직접 의존할 수 없다.
 * OTEL traceId는 같은 요청 안에서 모든 span에 공유되므로, 이 traceId를 키로
 * 모듈 레벨 Map에 임시 보관하면 양쪽이 안전하게 연결된다.
 *
 *   [요청 시작]                                  [PG slow query 발생]
 *   LoggingInterceptor.intercept()              SlowQuerySpanProcessor.onEnd()
 *      ↓ pushHttpContext(traceId, ctx)              ↓ getHttpContext(traceId)
 *      ───────────── 모듈 레벨 Map ──────────────
 *      ↑ clearHttpContext(traceId) (rxjs finalize)
 *   [요청 종료]
 */

export interface HttpContext {
  /** HTTP 메서드 (GET, POST, PATCH, DELETE 등) */
  method?: string;
  /** 파라미터화된 라우트 경로 (예: `/v1/posts/:id`) */
  route?: string;
  /** 인증된 사용자 ID. 비인증 endpoint면 undefined */
  userId?: number;
}

const contexts = new Map<string, HttpContext>();

/**
 * 메모리 leak 안전망. 정상 흐름이라면 finalize에서 clear되지만, 예외로 finalize가
 * 누락되는 시나리오가 누적되어 Map이 무한히 늘어나지 않도록 상한을 둔다.
 * 도달 시 전체를 비우는 단순 정책 — 이 상황 자체가 비정상이라 일부 컨텍스트
 * 손실은 허용 가능하다.
 */
const MAX_ENTRIES = 1000;

/**
 * NestJS LoggingInterceptor가 매 HTTP 요청 진입 시점에 호출한다.
 * 같은 traceId가 다시 push되면 마지막 호출이 이긴다(예상 동작 — 같은 요청 내 재진입은 사실상 없음).
 */
export function pushHttpContext(traceId: string, ctx: HttpContext): void {
  if (contexts.size >= MAX_ENTRIES) contexts.clear();
  contexts.set(traceId, ctx);
}

/**
 * SlowQuerySpanProcessor가 PG slow query span의 traceId로 호출한다.
 * 비-HTTP 컨텍스트(cron, 마이그레이션 등)에서 발생한 쿼리는 entry가 없어 undefined를 반환한다.
 */
export function getHttpContext(traceId: string): HttpContext | undefined {
  return contexts.get(traceId);
}

/**
 * NestJS LoggingInterceptor가 요청 종료 시점(rxjs finalize)에 호출한다.
 * 메모리 leak 방지를 위해 명시적으로 정리한다.
 */
export function clearHttpContext(traceId: string): void {
  contexts.delete(traceId);
}

/**
 * 단위 테스트 사이에 모듈 상태를 깨끗이 비우는 헬퍼.
 * 프로덕션 코드에서 호출하면 안 된다.
 */
export function resetHttpContextForTest(): void {
  contexts.clear();
}
