# 공유 인프라 단위 테스트 PRD

`libs/shared`의 로직 보유 인프라 코드 4종과 `apps/service`의 유일한 spec 부재 핸들러 1종에 단위 테스트를 추가한다. 프로덕션 코드 동작 변경은 없는 **테스트 전용 작업**이다.

## 1. 배경

프로젝트 전수 점검(2026-06) 결과, 핸들러 25개 중 24개가 단위 spec을 갖춘 것과 대조적으로 공유 인프라 레이어는 단위 테스트가 전무했다. 이 프로젝트의 테스트 철학(Classical School — "로직은 단위 테스트, 연결은 통합 테스트")에 비춰, 아래 파일들은 실제 조건 분기를 보유하므로 단위 테스트 대상이다.

| 대상 | 분기 로직 | 미검증 리스크 |
| --- | --- | --- |
| `libs/shared/src/idempotency/idempotency.interceptor.ts` | 헤더 검증, SET NX 선점, PROCESSING 마커 409, 캐시 히트 재생, 손상 JSON 복구, 에러 시 키 해제 — **분기 최다** | 멱등성 보장이 깨져도 잡을 테스트 없음 |
| `libs/shared/src/database/postgres-error.util.ts` | 23505 타입가드 (3개 이상 핸들러의 동시성 안전망) | 오판 시 unique 위반이 500으로 노출 |
| `libs/shared/src/cache/cache.service.ts` | Fail-Open swallow, 손상 캐시 self-healing(del), SCAN 커서 루프 | swallow가 깨지면 Redis 장애가 서비스 장애로 전파 |
| `libs/shared/src/slack/slack.service.ts` | 토큰 미설정 silent skip, 텍스트 escape, 1000자 truncation, 트리플 백틱 무력화, 옵셔널 라인 조립 | 알림 포맷/Fail-Open 회귀를 감지 못함 |
| `apps/service/src/posts/event/post-created.handler.ts` | (pass-through에 가까움 — §6 참고) | 이벤트→Slack 파라미터 매핑은 통합 테스트의 사각지대 |

## 2. 목표

- 위 5개 파일에 대해 **현재 동작을 그대로 고정(codify)** 하는 단위 테스트를 추가한다.
- 프로덕션 코드는 수정하지 않는다. 테스트 작성 중 결함을 발견하면 수정하지 않고 본 문서 §7에 기록 후 별도 작업으로 넘긴다.
- 기존 단위 테스트 인프라(`@swc/jest`, 루트 jest 설정, colocated `*.spec.ts`)를 그대로 사용한다 — 새 패키지·설정 변경 없음.

## 3. 테스트 설계

### 3.1 IdempotencyInterceptor (`idempotency.interceptor.spec.ts`)

DI가 string token(`REDIS_CLIENT`) + `PinoLogger`(nestjs-pino)라 **수동 인스턴스화 + 수동 mock 주입**으로 작성한다 (Suites `TestBed.solitary`는 Handler 패턴 전용 컨벤션 — §5 참고). `ExecutionContext`/`CallHandler`는 최소 stub으로 구성한다.

| # | 시나리오 | 기대 동작 |
| --- | --- | --- |
| 1 | `Idempotency-Key` 헤더 없음 | `BadRequestException` |
| 2 | 헤더가 UUID v4 형식 아님 | `BadRequestException` |
| 3 | `request.user` 없음 (비인증) | `UnauthorizedException` |
| 4 | SET NX 성공 → handler 정상 완료 | 키 `idempotency:{userId}:{key}`로 SET NX(EX 60) 후, 응답을 `PX` 24h로 캐시 저장 |
| 5 | SET NX 성공 → handler 에러 | `redis.del` 호출(키 해제) + 원본 에러 rethrow |
| 6 | SET NX 실패 + GET = `__PROCESSING__` | `ConflictException`(409) |
| 7 | SET NX 실패 + GET = 유효 JSON | handler 미실행, 캐시된 `statusCode`로 `response.status` 설정 + `body` 반환 |
| 8 | SET NX 실패 + GET = 손상 JSON | `redis.del` 후 `ConflictException` — **현재 구현 기준** (§7-1의 로그-동작 불일치 참조) |
| 9 | SET NX 실패 + GET = null (두 명령 사이 만료) | `ConflictException`(409) |
| 10 | 헤더가 string[]로 전달 | 첫 요소 사용 |

### 3.2 isUniqueViolation (`postgres-error.util.spec.ts`)

순수 함수 — mock 없이 plain jest로 작성한다. `QueryFailedError`는 `new QueryFailedError(query, parameters, driverError)`로 직접 생성한다.

| # | 입력 | 기대 |
| --- | --- | --- |
| 1 | `QueryFailedError` + `driverError.code === '23505'` | `true` |
| 2 | `QueryFailedError` + 다른 코드(`23503` 등) | `false` |
| 3 | `QueryFailedError` + `driverError`에 `code` 없음 | `false` |
| 4 | 일반 `Error` | `false` |
| 5 | `null` / `undefined` / 문자열 | `false` |

### 3.3 CacheService (`cache.service.spec.ts`)

수동 인스턴스화 + ioredis mock(`get`/`set`/`del`/`scan`만 가진 객체) 주입.

| # | 시나리오 | 기대 동작 |
| --- | --- | --- |
| 1 | `get` — 키 존재 | JSON 파싱된 값 반환 |
| 2 | `get` — 키 없음(null) | `undefined` |
| 3 | `get` — `redis.get` 예외 | `undefined` 반환 (Fail-Open, rethrow 없음) |
| 4 | `get` — 손상 JSON | `undefined` 반환 + 해당 키 `del` 시도 (self-healing) |
| 5 | `get` — 손상 JSON + `del`도 실패 | 그래도 `undefined` 반환 (이중 swallow) |
| 6 | `set` — 정상 | `JSON.stringify` 값 + `EX {ttl}`로 호출 |
| 7 | `set` — 예외 | rethrow 없음 |
| 8 | `del` — 예외 | rethrow 없음 |
| 9 | `delByPattern` — 커서 2회 순회 | SCAN 루프가 cursor `'0'`까지 반복, 발견 키 전부 `del(...keys)` |
| 10 | `delByPattern` — 매칭 키 없음 | `del` 미호출 |
| 11 | `delByPattern` — 예외 | rethrow 없음 |

### 3.4 SlackService (`slack.service.spec.ts`)

`jest.mock('@slack/web-api')`로 `WebClient`를 모킹하고, `ConfigService`는 케이스별 stub(`{ get: () => token | undefined }`)을 생성자에 주입한다 — 생성자에서 토큰 분기가 일어나므로 케이스마다 새로 인스턴스화해야 한다.

| # | 시나리오 | 기대 동작 |
| --- | --- | --- |
| 1 | `SLACK_BOT_TOKEN` 미설정 | `WebClient` 미생성, `postMessage` 미호출, 예외 없음 (silent skip) |
| 2 | `sendPostCreatedNotification` | `&`/`<`/`>`가 `&amp;`/`&lt;`/`&gt;`로 escape된 제목 포함, `POST_CREATED` 채널로 전송 |
| 3 | `sendSlowQueryAlert` — 1000자 초과 SQL | 1000자에서 잘리고 `... (truncated)` 접미 |
| 4 | `sendSlowQueryAlert` — SQL에 ``` 포함 | zero-width space 삽입으로 코드 블록 무력화 |
| 5 | `sendSlowQueryAlert` — HTTP 컨텍스트/userId 존재 | `HTTP`/`UserId` 라인 포함 |
| 6 | `sendSlowQueryAlert` — 비-HTTP 컨텍스트 | `HTTP`/`UserId` 라인 생략 |
| 7 | `postMessage` 예외 | 호출자로 전파되지 않음 (Fail-Open) |

### 3.5 PostCreatedHandler (`post-created.handler.spec.ts`)

핸들러이므로 컨벤션대로 Suites `TestBed.solitary(PostCreatedHandler)` 사용, `unitRef.get(SlackService)`로 mock 회수.

| # | 시나리오 | 기대 동작 |
| --- | --- | --- |
| 1 | `handle(event)` | `sendPostCreatedNotification(postId, title, userId)` 인자 순서·값 일치 |

## 4. 수용 기준 (Acceptance Criteria)

- [x] 신규 spec 5개가 소스 파일 옆에 colocate되어 추가된다 (기존 컨벤션과 동일).
- [x] `describe`는 영문 클래스/함수명, `it` 문장은 한국어 행위·결과 진술 (전체 spec 일관 규칙 준수).
- [x] 프로덕션 코드(`apps/`, `libs/` 비-spec 파일) diff가 0이다.
- [x] `pnpm format` → `pnpm lint:check` → `pnpm build:all` → `pnpm test` → `pnpm test:e2e` 전부 통과한다.
- [x] 테스트 중 발견된 결함·불일치는 §7에 기록된다 (코드 수정 금지).

## 5. 비기능 요구사항 / 컨벤션 결정

- **mock 도구 선택 기준**: Handler(`PostCreatedHandler`)는 프로젝트 컨벤션대로 Suites `TestBed.solitary`. 인프라 클래스 3종은 수동 인스턴스화를 사용한다 — 근거: (1) `REDIS_CLIENT` string token·`WebClient` 내부 생성 등 Suites 자동 mock의 이점이 없는 구조, (2) `SlackService`는 생성자에서 분기하므로 케이스별 재인스턴스화가 필요, (3) 순수 클래스 직접 생성이 테스트 의도를 더 명확히 드러냄 (Classical School).
- **RxJS 처리**: 인터셉터 테스트는 `intercept()`가 반환한 Observable을 `firstValueFrom`으로 변환해 assert한다. `CallHandler.handle()`은 `of(body)` / `throwError(() => err)` stub.
- **로거 노이즈**: `CacheService`/`SlackService`는 내부 `new Logger()`를 사용하므로 테스트 출력 오염 시에만 `jest.spyOn(Logger.prototype, ...)`으로 침묵 처리 (필수 아님).
- **신규 패키지·jest 설정 변경 금지.**

## 6. 범위 외 (Out of scope)

- **프로덕션 코드 수정 일체** — §7 발견 사항 수정 포함 (별도 PR).
- 통합 테스트 추가 (idempotency 키 검증의 E2E 시나리오 등은 별도 작업).
- `logging/`(interceptor·filter), `otel/`, `health/` 등 나머지 인프라 — 1차 점검에서 우선순위 낮음으로 분류된 항목.
- 커버리지 설정(`collectCoverageFrom`) 변경 — 별도 작업(개선 권장 2번)으로 진행.

## 7. 작업 중 발견 사항 (코드 수정 없이 기록만)

1. **IdempotencyInterceptor 로그-동작 불일치** (`idempotency.interceptor.ts:88-96`): 손상된 캐시 엔트리를 만나면 `'Corrupted cache entry, reprocessing'`을 로깅하고 키를 삭제한 뒤 — 재처리(reprocess)가 아니라 **`ConflictException`(409)을 던진다**. 클라이언트가 재시도하면 그때 재처리되므로 동작 자체는 안전하지만, 로그 문구가 오해를 유발한다. 테스트는 현재 동작(409)을 고정한다. 후속 작업에서 로그 문구 수정 권장.
