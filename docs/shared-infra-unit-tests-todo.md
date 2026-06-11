# 공유 인프라 단위 테스트 체크리스트

> `libs/shared` 인프라 4종 + `PostCreatedHandler`에 단위 테스트를 추가하기 위한 단계별 체크리스트.
> 각 Phase는 의존성이 없어 순서 조정이 가능하지만, 난이도 오름차순(순수 함수 → RxJS 인터셉터)으로 정렬했다.
>
> 케이스별 상세 설계, mock 도구 선택 근거, 발견 사항은 [shared-infra-unit-tests-prd.md](./shared-infra-unit-tests-prd.md)를 참고한다.

---

## 진행 현황 (요약)

| Phase | 상태 | 비고 |
|---|---|---|
| 1. postgres-error.util | ✅ 완료 | 순수 함수, plain jest |
| 2. PostCreatedHandler | ✅ 완료 | Suites `TestBed.solitary` |
| 3. CacheService | ✅ 완료 | 수동 인스턴스화 + ioredis mock |
| 4. SlackService | ✅ 완료 | `jest.mock('@slack/web-api')` + ConfigService stub |
| 5. IdempotencyInterceptor | ✅ 완료 | 수동 인스턴스화, RxJS `firstValueFrom` |
| 6. 최종 검증 | ✅ 완료 | format → lint:check → build:all → test → test:e2e |

---

## Phase 1: `postgres-error.util.spec.ts`

> **위치**: `libs/shared/src/database/postgres-error.util.spec.ts`

- [x] `QueryFailedError` + `driverError.code='23505'` → `true`
- [x] `QueryFailedError` + 다른 SQLSTATE(`23503`) → `false`
- [x] `QueryFailedError` + `code` 없는 `driverError` → `false`
- [x] 일반 `Error` → `false`
- [x] `null` / `undefined` / 문자열 → `false`
- [x] `npx jest libs/shared/src/database/postgres-error.util.spec.ts` 통과

## Phase 2: `post-created.handler.spec.ts`

> **위치**: `apps/service/src/posts/event/post-created.handler.spec.ts`
> 기존 핸들러 spec(예: `create-post.handler.spec.ts`)의 Suites 패턴을 그대로 따른다.

- [x] `TestBed.solitary(PostCreatedHandler)` 셋업, `unitRef.get(SlackService)` mock 회수
- [x] `handle(event)` 시 `sendPostCreatedNotification(postId, title, userId)` 인자 검증
- [x] `npx jest apps/service/src/posts/event/post-created.handler.spec.ts` 통과

## Phase 3: `cache.service.spec.ts`

> **위치**: `libs/shared/src/cache/cache.service.spec.ts`
> ioredis mock 객체(`get`/`set`/`del`/`scan`)를 생성자에 직접 주입.

- [x] `get` 히트 → JSON 파싱 값 반환
- [x] `get` 미스(null) → `undefined`
- [x] `get` Redis 예외 → `undefined` (Fail-Open, rethrow 없음)
- [x] `get` 손상 JSON → `undefined` + 해당 키 `del` 호출 (self-healing)
- [x] `get` 손상 JSON + `del` 실패 → 그래도 `undefined` (이중 swallow)
- [x] `set` 정상 → `JSON.stringify` + `'EX', ttl` 인자 검증
- [x] `set`/`del` Redis 예외 → rethrow 없음
- [x] `delByPattern` 커서 2회 순회 → 전체 키 `del(...keys)`
- [x] `delByPattern` 매칭 없음 → `del` 미호출
- [x] `delByPattern` Redis 예외 → rethrow 없음
- [x] `npx jest libs/shared/src/cache/cache.service.spec.ts` 통과

## Phase 4: `slack.service.spec.ts`

> **위치**: `libs/shared/src/slack/slack.service.spec.ts`
> `jest.mock('@slack/web-api')` + 케이스별 `ConfigService` stub 재인스턴스화.

- [x] 토큰 미설정 → `WebClient` 미생성, `postMessage` 미호출, 예외 없음
- [x] `sendPostCreatedNotification` → `&`/`<`/`>` escape + `POST_CREATED` 채널 검증
- [x] `sendSlowQueryAlert` 1000자 초과 → truncation + `... (truncated)` 접미
- [x] `sendSlowQueryAlert` 트리플 백틱 → zero-width space 무력화
- [x] `sendSlowQueryAlert` HTTP 컨텍스트/userId 존재 → 해당 라인 포함
- [x] `sendSlowQueryAlert` 비-HTTP 컨텍스트 → 해당 라인 생략
- [x] `postMessage` 예외 → 호출자로 전파 안 됨 (Fail-Open)
- [x] `npx jest libs/shared/src/slack/slack.service.spec.ts` 통과

## Phase 5: `idempotency.interceptor.spec.ts`

> **위치**: `libs/shared/src/idempotency/idempotency.interceptor.spec.ts`
> 수동 인스턴스화(mock redis + mock PinoLogger). `ExecutionContext`/`CallHandler` 최소 stub.
> Observable 검증은 `firstValueFrom` 사용.

- [x] 헤더 없음 → `BadRequestException`
- [x] UUID v4 아님 → `BadRequestException`
- [x] `request.user` 없음 → `UnauthorizedException`
- [x] 헤더 string[] → 첫 요소 사용
- [x] SET NX 성공 + handler 성공 → `idempotency:{userId}:{key}` 키, 응답 `PX` 24h 캐시
- [x] SET NX 성공 + handler 에러 → `redis.del` + 원본 에러 rethrow
- [x] SET NX 실패 + GET=`__PROCESSING__` → 409
- [x] SET NX 실패 + GET=유효 JSON → handler 미실행, `response.status(cached.statusCode)` + body 반환
- [x] SET NX 실패 + GET=손상 JSON → `del` 후 409 (PRD §7-1: 현재 동작 고정)
- [x] SET NX 실패 + GET=null (만료 race) → 409
- [x] `npx jest libs/shared/src/idempotency/idempotency.interceptor.spec.ts` 통과

## Phase 6: 최종 검증

- [x] `pnpm format`
- [x] `pnpm lint:check`
- [x] `pnpm build:all`
- [x] `pnpm test` (신규 spec 5개 포함 전체 통과)
- [x] `pnpm test:e2e` (회귀 없음 확인, Docker 필요)
- [x] 프로덕션 코드 diff 0 확인 (`git diff --stat` 에 spec·docs 파일만 존재)
- [x] PRD §7 발견 사항 최신화
