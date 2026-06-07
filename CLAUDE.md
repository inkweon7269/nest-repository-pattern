# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
# Build (앱별 또는 전체)
pnpm build:service      # service 앱 빌드
pnpm build:back-office  # back-office 앱 빌드
pnpm build:all          # 양쪽 앱 빌드

# Start (동시 실행)
pnpm start:local                # service + back-office 동시 실행 (concurrently, local)
pnpm start:dev                  # service + back-office 동시 실행 (concurrently, development)

# Start (앱별, environment-specific)
pnpm start:service:local        # service local + watch mode (PORT=3000)
pnpm start:back-office:local    # back-office local + watch mode (ADMIN_PORT=3001)
pnpm start:service:dev          # service development + watch mode
pnpm start:back-office:dev      # back-office development + watch mode
pnpm start:service:prod         # service production (dist/apps/service/main)
pnpm start:back-office:prod     # back-office production (dist/apps/back-office/main)
pnpm start:service:debug        # service development + debug + watch mode

# Test
pnpm test                       # unit tests (apps/**/*.spec.ts, libs/**/*.spec.ts)
pnpm test:watch                 # watch mode
pnpm test:cov                   # coverage
pnpm test:e2e                   # 전체 통합 테스트 (service + back-office)
pnpm test:e2e:service           # service 통합 테스트
pnpm test:e2e:back-office       # back-office 통합 테스트

# Run a single test file
npx jest apps/service/src/posts/command/update-post.handler.spec.ts
npx jest --config ./test/service/jest-e2e.json test/service/posts.integration-spec.ts

# Lint & Format
pnpm lint
pnpm format

# Docs (Compodoc — 소스 구조 문서)
pnpm docs:serve         # localhost:8080에 구조 문서 라이브 서버 (watch 포함)
pnpm docs:build         # documentation/에 정적 사이트 생성 (gitignore됨, 커밋 금지)

# Migration (libs/shared/src/data-source.ts 기준)
pnpm migration:local                                                          # 로컬 DB에 pending migration 실행
pnpm migration:dev                                                            # dev DB에 pending migration 실행
pnpm migration:prod                                                           # prod DB에 pending migration 실행
pnpm migration:generate:local -- libs/shared/src/migrations/CreatePostTable   # 엔티티 diff로 migration 자동 생성
pnpm migration:generate:dev -- libs/shared/src/migrations/CreatePostTable     # dev 환경 migration 생성
pnpm migration:revert:local                                                   # 마지막 migration 롤백 (dev/prod 변형도 존재)
pnpm migration:create -- libs/shared/src/migrations/AddCategoryToPost         # 빈 migration 템플릿 생성
pnpm test:migration                                                           # CI용 migration safety check (컨테이너 기동 + migration 실행만 검증)
```

## Architecture & Patterns

NestJS **모노레포** 프로젝트에 **Repository Pattern** + **CQRS Pattern**을 적용한 CRUD API. TypeORM + PostgreSQL 사용.

- **`apps/service`** — 사용자 서버 (Auth + Posts, PORT=3000)
- **`apps/back-office`** — 관리자 서버 (Admin Auth, ADMIN_PORT=3001)
- **`libs/shared`** — 공유 라이브러리 (엔티티, 마이그레이션, 공통 유틸리티, `@app/shared`로 import)

- 새 코드 생성 시 기존 handler/repository 패턴을 따른다.
- TypeORM 설정에는 항상 `forRootAsync`를 사용한다 (`forRoot`의 eager evaluation 금지).

### CQRS 설계 원칙

- **Command는 상태만 변경**한다. 반환 타입은 `void` 또는 최소 식별자(`number` 등). DTO를 반환하지 않는다.
- **Query는 상태만 조회**한다. DTO 변환은 Query Handler에서 수행한다.
- **Command와 Query를 분리**한다. 하나의 플로우에서 Command와 Query를 혼합하지 않는다. (예: `createPost`는 Command로 ID를 받아 `{ id }`를 반환, `updatePost`는 Command만 실행하여 204 반환)
- **Repository는 순수 데이터 접근**만 담당한다. 예외 던지기, null 체크 등 비즈니스 로직을 포함하지 않는다.
- **검증(존재 확인)은 Handler**에서 수행한다. (affected count가 0이면 `NotFoundException`)
- **Repository 인터페이스는 도메인 타입**을 사용한다. 입력(`CreatePostInput`/`UpdatePostInput`)과 필터(`PostFilter`)를 각각 `IPostWriteRepository`/`IPostReadRepository`와 같은 파일에 정의. HTTP Request DTO에 의존하지 않는다.
- **Query 객체에 파생 값을 포함하지 않는다.** `skip` 계산은 Repository에서 수행한다.
- **페이지네이션 Query는 `PaginatedQuery`를 상속**한다. `libs/shared/src/common/query/paginated.query.ts`에 정의된 추상 클래스로, 도메인별 필터를 `filter` 필드로 추가한다.

### Handler Authoring Rules

Service 앱 Command Handler(`apps/service/src/**/command/*.handler.ts`)는 다음 규칙을 따른다. 자동 회귀 검증은 `verify-handler-structure` 스킬, 자세한 코드 예시는 `.claude/agents/nestjs-expert.md`의 "Handler Authoring Rules" 섹션 참고.

- **`execute()`는 호출만** — 검증/조회/조립은 private 메서드로 추출(≤50줄 목표). 검증 R1.
- **메서드 네이밍** — `validate{Subject}{Predicate}`(검증), `load{Subject}…OrThrow`(조회+null체크+예외), `find{Subject}…`(단순 조회), `create/persist/link…OrConflict`(단일 write + 23505 매핑), `emit{Name}Event`/`invalidate{Name}Cache`(side-effect, try 밖에 위치).
- **try-catch는 단일 write 1줄만 감싼다** — 이벤트 emit, 캐시 무효화, 추가 write를 try 안에 두지 않는다. 또한 `cacheService.{get,set,del,delByPattern}` 호출을 별도 try/catch로 다시 감싸지 않는다 — `CacheService` 자체가 Fail-Open이라 dead code가 된다(Cache Layer 항목 참고). 검증 R2.
- **`@Transactional()`은 다중 write 묶음 메서드에만** — `execute()` 전체에 달지 않으며 read는 항상 트랜잭션 밖. 단일 write 핸들러는 `@Transactional()` 불필요. 검증 R3.
- **데코레이터 메서드 파라미터 타입은 `import type`** — SWC + `isolatedModules` + `emitDecoratorMetadata` 조합에서 TS1272 회피 (엔티티 양방향 관계 `Relation<T>`와 동일 이유).

### Request Flow

```text
Controller → CommandBus / QueryBus → Handler (검증 + 로직) → IPostReadRepository / IPostWriteRepository → PostRepository → BaseRepository → TypeORM → PostgreSQL
```

- **Controller** — 라우팅 + Command/Query 객체 생성. Command와 Query를 분리하여 실행
- **Command** — 상태 변경 의도를 표현하는 순수 값 객체
- **Query** — 상태 조회 의도를 표현하는 순수 값 객체
- **Command Handler** — 존재 검증, 쓰기 로직 수행. `void` 또는 ID 반환
- **Query Handler** — 읽기 로직 + `PostResponseDto.of()` 변환 수행

### Repository Pattern DI 구조 (ISP 적용)

1. **`IPostReadRepository`** / **`IPostWriteRepository`** (abstract class) — 읽기/쓰기 분리된 DI 토큰 겸 인터페이스
2. 도메인 타입은 해당 인터페이스 파일에 co-locate: `IPostWriteRepository` → `CreatePostInput`/`UpdatePostInput`, `IPostReadRepository` → `PostFilter`
3. **`PostRepository`** — 두 인터페이스를 모두 구현, `BaseRepository` 상속
4. **`postRepositoryProviders`** — `PostRepository`를 등록 후 `useExisting`으로 두 추상 클래스 토큰에 동일 인스턴스를 매핑
5. 모듈에서 `TypeOrmModule.forFeature()`를 사용하지 않음. `BaseRepository`가 `DataSource`를 직접 주입받아 `getRepository<T>()`로 접근

### Auth 모듈

- JWT 기반 인증 (`register`, `login`, `logout`, `refresh-token`, `profile`)
- `JwtAuthGuard`가 PostsController 전체에 적용됨 — 모든 Post 엔드포인트는 Bearer 토큰 필요
- `@CurrentUser()` 커스텀 데코레이터로 인증된 사용자 정보 주입 (`apps/service/src/auth/decorator/`)
- User 엔티티와 Post 엔티티는 `userId` FK로 연결 (1:N)
- Posts와 동일한 Repository Pattern DI 구조 적용 (`IUserReadRepository` / `IUserWriteRepository`)
- **JWT 발급 헬퍼**: `AuthTokenIssuer` 도메인 서비스(`apps/service/src/auth/auth-token-issuer.service.ts`)가 `accessToken`/`refreshToken` 발급 + `hashedRefreshToken` 저장을 단일화. `LoginHandler`/`RefreshTokenHandler`/`GoogleLoginHandler` 모두 이 서비스를 통해 토큰 발급. JWT secret은 반드시 `configService.getOrThrow<string>('JWT_*_SECRET')`로 로드 (env 누락 시 부팅 실패).
- **OAuth (Google)**: `oauth_accounts` 테이블(1:N)로 멀티 프로바이더 확장 가능한 스키마. `(provider, providerId)` 및 `(userId, provider)` 부분 unique index. 동일 이메일 비번 사용자가 Google 로그인 시 자동 연결 금지 — `ConflictException(409)` 후 명시적 link 플로우(`POST /v1/auth/google/link`)로만 연결 허용. Link 시작은 redirect가 아닌 JSON `{ authorizationUrl }` 반환(브라우저 navigation에 Bearer 헤더 미지원 회피). Link callback은 백엔드 발행 signed JWT state(`type='google-link-state'`, 5분 만료)로 사용자 식별. 상세 가이드: `docs/google-oauth-prd.md`

### API Versioning

- URI 기반 버전 관리 (`VersioningType.URI`, `defaultVersion: '1'`) — 모든 API 라우트에 `/v1/` 프리픽스 자동 적용
- Health 엔드포인트는 `VERSION_NEUTRAL` — `/health`로 버전 프리픽스 없이 접근 (K8s probe 호환)
- 새 컨트롤러 추가 시 `defaultVersion`에 의해 자동으로 `/v1/` 적용. 별도 `@Version()` 데코레이터 불필요
- 통합 테스트 URL도 `/v1/` 프리픽스 사용 필수

### Soft Delete

- Post 엔티티에 `@DeleteDateColumn()` 적용 — 삭제 시 `deletedAt` 타임스탬프 기록, 실제 행은 유지
- TypeORM의 `softDelete()`/`restore()` 메서드 사용

### Database Naming Convention

- **코드는 camelCase, DB 컬럼은 snake_case**. `typeorm-naming-strategies`의 `SnakeNamingStrategy`를 `DataSourceOptions.namingStrategy`로 적용 (`libs/shared/src/database/typeorm.config.ts`). 엔티티 프로퍼티가 `createdAt`/`userId`/`hashedRefreshToken`이면 DB 컬럼은 자동으로 `created_at`/`user_id`/`hashed_refresh_token`으로 매핑됨
- 새 엔티티 추가 시 `@Column()`에 별도 옵션 없이 자동 변환됨. `@Column({ name: 'snake_case' })`로 수동 명명하지 않는다 (strategy와 중복)
- `@JoinColumn`에 `name` 인자를 지정하지 않는다 — 하드코딩하면 strategy를 우회하여 camelCase 컬럼이 생성됨. 인자 없이 `@JoinColumn()`만 사용
- **DB 제약은 엔티티에 선언**한다 — raw migration에만 박으면 다음 번 `migration:generate` 시 누락되어 회귀 발생. partial unique index는 `@Index('UQ_xxx', ['propA', 'propB'], { unique: true, where: '"snake_case_col" IS NULL' })`, FK ON DELETE 동작은 `@ManyToOne(() => X, { onDelete: 'CASCADE' })`로 엔티티가 단일 진실 원천이 되도록 한다 (`libs/shared/src/entities/post.entity.ts` 참고)

### Health Check & Graceful Shutdown

- `@nestjs/terminus` 기반 `GET /health` 엔드포인트 — DB(TypeORM) + Redis 연결 상태 확인
- `RedisHealthIndicator` — `HealthIndicatorService`를 사용한 커스텀 헬스 인디케이터 (`libs/shared/src/health/redis-health.indicator.ts`)
- `@SkipThrottle({ short: true, long: true })` — Health Check는 Rate Limiting 제외 (K8s probe 보호)
- `app.enableShutdownHooks()` — SIGTERM/SIGINT 시 `OnModuleDestroy` 훅 트리거 (Redis 연결 정리 등)

### Rate Limiting

- `@nestjs/throttler` 기반 글로벌 Rate Limiting (`APP_GUARD`로 `ThrottlerGuard` 등록)
- Named Throttlers: `short` (1초 3회), `long` (분당 60회)
- `@Throttle()` — login/register에 엄격한 제한 (1초 2회, 분당 5회)
- `@SkipThrottle({ short: true, long: true })` — named throttlers 사용 시 스킵 대상을 명시해야 함
- `skipIf: () => process.env.THROTTLE_SKIP === 'true'` — 통합 테스트 환경에서 비활성화
- 429 Too Many Requests 자동 반환. Swagger에 `@ApiTooManyRequestsResponse` 적용

### Security (helmet + CORS)

- `applySecurityMiddleware` 공유 헬퍼 (`libs/shared/src/bootstrap/security.ts`)가 main.ts 2곳 + `createIntegrationApp`에서 동일하게 호출됨. 보안 설정은 반드시 이 헬퍼를 수정하여 한 곳에서 관리한다.
- helmet CSP directive는 Swagger UI 호환을 위해 `styleSrc`/`scriptSrc`에 `'unsafe-inline'`, `imgSrc`에 `data:`/`validator.swagger.io`를 허용한다.
- CORS whitelist 환경변수는 앱별로 분리: `SERVICE_CORS_ORIGINS` (service), `BACK_OFFICE_CORS_ORIGINS` (back-office). 쉼표 구분 origin 목록.
- fallback 정책: `NODE_ENV=local`/`development`에서 env 미설정 시 `origin: true`(모든 origin 허용). `production`에서 env 누락 시 `enableCors`를 호출하지 않음(fail-safe).
- CORS origin 거부는 반드시 `cb(null, false)` 사용 — `cb(new Error(...))`는 500 응답 및 에러 로그 오염을 유발하므로 금지.
- `credentials: true` + `allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key']`. 새 커스텀 헤더 도입 시 이 목록을 업데이트해야 브라우저에서 사용 가능.
- `createIntegrationApp(appModule, { corsOriginEnvKey })`로 테스트별 CORS 키를 명시. 기본값은 `SERVICE_CORS_ORIGINS` — back-office 통합 테스트는 `BACK_OFFICE_CORS_ORIGINS`를 명시적으로 전달.
- 상세 가이드: `docs/helmet-cors-guide.md`

### Compression

- HTTP 응답 본문을 gzip으로 압축하여 전송량/지연을 줄인다. `applyCompressionMiddleware` 공유 헬퍼(`libs/shared/src/bootstrap/compression.ts`)가 service main.ts + back-office main.ts + `createIntegrationApp` 3곳에서 동일하게 호출됨. 압축 설정 변경은 반드시 이 헬퍼 한 곳에서만 한다 (security.ts 선례와 동일).
- threshold 1KB(`compression` 기본값 유지) — 본문이 1KB 미만이면 압축 오버헤드를 피하기 위해 압축하지 않는다.
- 라우트별 opt-out: 응답에 `x-no-compression` 헤더를 설정하면 해당 응답은 압축에서 제외된다 (SSE/스트리밍 등). 기본 filter를 확장하여 이 헤더를 감지하고, 그 외에는 `compression` 기본 filter에 위임한다.
- 미들웨어 순서: `applySecurityMiddleware` 호출 **직후**에 `applyCompressionMiddleware`를 호출하여 보안 → 압축 순서를 모든 진입점에서 일관되게 유지한다.
- **상용은 nginx 위임**: `applyCompressionMiddleware`는 `NODE_ENV === 'production'`이면 미들웨어를 등록하지 않고 early return한다. `compression`은 이벤트 루프에서 동기 gzip을 수행해 고트래픽 시 CPU 병목이 되므로, 상용에서는 nginx 등 리버스 프록시가 압축을 담당하고 앱·프록시 이중 압축을 회피한다. `local`·`development`·`test`에서는 그대로 활성화(통합 테스트는 jest 기본 `NODE_ENV=test`라 압축 검증이 그대로 통과). 환경 분기는 헬퍼 한 곳에서만 수행하므로 호출부는 변경 없음 — `applySecurityMiddleware`의 production fail-safe 분기와 동일 선례.
- `compression`은 Express 미들웨어 패키지로, 양쪽 앱의 Express 어댑터 위에서 `app.use()`로 등록된다. Brotli·env 런타임 튜닝은 범위 외.
- 상세 가이드: `docs/compression-guide.md`

### Cache Layer

- `CacheService` (`libs/shared/src/cache/`) — 기존 `REDIS_CLIENT`(ioredis)를 재사용한 캐시 유틸리티. 추가 패키지 없음
- **CQRS 정합**: Query Handler에서 캐시 읽기/저장, Command Handler에서 캐시 무효화
- **Fail-Open 패턴**: 모든 Redis 연산을 `CacheService` 내부에서 try/catch로 감싸 Redis 장애 시 DB fallback. 캐시 장애가 서비스 가용성에 영향을 미치지 않음
- **핸들러 레벨 wrap 금지**: `CacheService.{get,set,del,delByPattern}` 호출은 Handler에서 다시 `try/catch`로 감싸지 않는다. `CacheService` 자체가 Redis 에러를 swallow하고 rethrow하지 않으므로 wrap하면 dead catch + 중복 warn 로그가 된다. `await this.cacheService.del(...)` 한 줄로만 호출한다. 동일 영역의 `CreatePostHandler`/`UpdatePostHandler`/`DeletePostHandler`가 기준 패턴.
- **사용자 격리**: 모든 캐시 키에 `userId` 포함 (예: `post:{userId}:{postId}`)
- 캐시 히트/미스/SET/DEL을 `debug` 레벨로 로깅, 장애 시 `warn` 레벨 로깅
- 상세 가이드: `docs/cache-layer-guide.md`

### Logging

- `pino-http` 기반 구조화 로깅 (`libs/shared/src/logging/`)
- `LoggingInterceptor` — HTTP 요청/응답 로깅 (글로벌 적용)
- `HttpExceptionFilter` — 예외 처리 및 에러 로깅 (글로벌 적용)
- correlation ID, 민감 정보 redaction 지원

### Idempotency

- `@Idempotent()` 데코레이터 (`libs/shared/src/idempotency/`) — POST 엔드포인트에 적용하여 중복 요청 방지
- Redis 기반 멱등성 키 저장. `IdempotencyInterceptor`가 요청 헤더의 키로 중복 여부 판단
- `IdempotencyModule`을 import하여 사용

### Event-Driven (CQRS EventBus + Slack)

- `@nestjs/cqrs`의 `EventBus` 기반 도메인 이벤트 발행 — Command Handler에서 상태 변경 후 `eventBus.publish(new XxxEvent(...))`. 별도 이벤트 문자열 키 없이 이벤트 클래스 자체로 라우팅
- `PostCreatedEvent` → `PostCreatedHandler`(`@EventsHandler` + `IEventHandler<T>`)가 Slack 알림 전송 (`apps/service/src/posts/event/`)
- `SlackModule` / `SlackService` (`libs/shared/src/slack/`) — Slack Bot Token으로 채널 알림 전송. 내부 catch로 Fail-Open (전송 실패가 핸들러로 전파되지 않음)
- 이벤트 핸들러는 RxJS 스트림에서 비동기 처리되므로 메인 요청 흐름에 영향 없음. 핸들러 실패도 publisher(Command Handler)에 전파되지 않음
- **이벤트 핸들러 예외는 Exception filter 미적용** — request-response cycle 밖이므로 `HttpExceptionFilter`가 잡지 못한다. EventBus 내장 `catchError`가 예외를 `UnhandledExceptionBus`(CqrsModule이 export하는 앱 전체 싱글톤)로 발행하고, `CqrsLoggingModule`의 `UnhandledEventExceptionsLogger`(`libs/shared/src/cqrs/`)가 이를 구독하여 앱 전역의 이벤트 핸들러 예외를 중앙 로깅. EventBus로 이벤트를 발행하는 앱의 루트 모듈에서 `CqrsLoggingModule`을 import한다 (현재 `ServiceAppModule`만 — back-office는 이벤트 도입 시점에 추가). 이벤트 핸들러 안에 별도 try/catch를 추가하지 않는다 (SlackService Fail-Open + UnhandledExceptionBus 안전망으로 충분 — dead catch 방지)

### OpenTelemetry

- `libs/shared/src/instrumentation.ts` — OTEL SDK 자동 계측 초기화 (양쪽 앱의 `main.ts`에서 import)
- `OTEL_ENABLED` 환경변수로 활성화/비활성화 제어
- `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`으로 trace 수집 대상 설정
- `OTEL_SERVICE_NAME`은 `package.json` start 스크립트에서 앱별로 강제(service / back-office) — 환경변수 미설정 시 두 앱이 같은 식별자로 보고됨

### Slow Query Slack Alert (OTEL 기반)

외부 OTEL 백엔드 없이도 단일 PostgreSQL 쿼리가 임계값을 넘으면 Slack 채널로 알림을 보내는 인앱 후크. 코드는 `libs/shared/src/otel/` + `libs/shared/src/instrumentation.ts` + `libs/shared/src/slack/slack.service.ts`(sendSlowQueryAlert).

- 데이터 흐름: pg 자동 계측 → `SlowQuerySpanProcessor` → 모듈 레벨 callback registry → `SlowQueryAlertHandler` (NestJS DI) → `SlackService.sendSlowQueryAlert` → `#prod-slow-query` / `#dev-slow-query` 채널
- Boot-time SpanProcessor와 NestJS DI 사이 연결: 모듈 레벨 callback + buffer(BUFFER_CAP=100건) 패턴. SpanProcessor는 NestJS DI 컨테이너 부팅 전에 생성되므로 EventBus 등 DI 기반 이벤트 시스템을 사용할 수 없음.
- Dedup: SQL 본문 SHA-1 앞 16자를 키로 60초 TTL Redis 중복 제거 (분산 환경 모든 인스턴스 공유). `CacheService` Fail-Open이라 Redis 장애 시 dedup 효과만 사라지고 알림 자체는 계속 전송
- 환경변수: `SLOW_QUERY_THRESHOLD_MS`(기본 5000, NaN/음수면 폴백), `SLACK_BOT_TOKEN` 미설정 시 silent skip
- 양쪽 앱 활성화: 각 앱의 루트 모듈(`ServiceAppModule`/`BackOfficeAppModule`)이 `OtelAlertingModule` import 필수
- 민감 정보 보호: pg 자동 계측의 `enhancedDatabaseReporting` 기본값 `false` 유지로 SQL 파라미터 값(비밀번호 등) 캡처 안 됨

### Transaction Infrastructure (typeorm-transactional)

- 다중 테이블 쓰기의 원자성이 필요한 Command Handler는 `@Transactional()` 데코레이터(`typeorm-transactional`) 적용. 메서드 내부의 모든 Repository 호출이 동일 트랜잭션에 자동 참여 — Repository 시그니처 변경 불필요.
- **부트스트랩 필수**: 양쪽 앱의 `main.ts`에서 `NestFactory.create` 전 `initializeTransactionalContext()` 호출 + 생성 후 `addTransactionalDataSource(app.get(DataSource))` 등록. 미등록 시 `@Transactional()`이 런타임 에러("No data sources defined").
- **단위 테스트 mock 패턴**: 단위 테스트는 실 DataSource를 부팅하지 않으므로 `@Transactional`이 throw. 데코레이터를 spec 파일 단위로 no-op 처리: `jest.mock('typeorm-transactional', () => ({ Transactional: () => () => undefined }))`. 트랜잭션 의미는 통합 테스트에서 검증.
- **Pre-check + 23505 이중 안전망**: 이 프로젝트는 `findByEmail`/`findByProviderId` 등 read 선조회 후 DB unique 위반(Postgres 23505)을 `ConflictException`으로 변환하는 패턴을 일관되게 사용한다 (`RegisterHandler`, `GoogleLoginHandler`, `LinkGoogleAccountHandler`). 트랜잭션은 부분 실패 시 자동 rollback을, 23505 catch는 동시성 race를 담당. 둘 다 보존한다 — 한쪽만 있으면 결함 시나리오가 남는다.
- 자세한 구조는 `docs/google-oauth-prd.md` §2.7 참고.

### Build Tooling (SWC)

- 빌드는 **webpack + swc-loader**, 단위/통합 테스트는 **`@swc/jest`**. 모노레포 모드는 SWC builder를 직접 지원하지 않으므로 NestJS 공식 권장 경로인 webpack 경유.
- `webpack.config.js`(루트)는 함수 형태 — nest CLI 기본값(`webpack-defaults`: externals, `TsconfigPathsPlugin`, `IgnorePlugin`, `ForkTsCheckerWebpackPlugin`, `node: { __dirname: false }`)을 그대로 spread로 보존하고 `module.rules`만 swc-loader로 교체. 새로운 webpack 옵션이 필요하면 spread 패턴을 깨지 않도록 주의(예: `node`/`plugins`/`module`을 통째로 덮어쓰지 말 것).
- SWC 옵션은 `@nestjs/cli/lib/compiler/defaults/swc-defaults`의 `swcDefaultsFactory()`를 그대로 사용. 빌드는 `swcrc: false`로 격리, Jest는 루트 `.swcrc`를 사용.
- **엔티티 양방향 관계는 SWC 호환 필수 패턴 적용**: 순환 참조 + `decoratorMetadata`가 TDZ를 유발하므로 관계 타입을 `Relation<T>`로 감싸고, `Relation`은 반드시 `import type { Relation } from 'typeorm'`로 들여온다(`isolatedModules` + `emitDecoratorMetadata` 조합에서 TS1272 회피). 새 엔티티가 양방향 관계를 가질 때마다 동일 패턴 강제.
- `pnpm build:all`(non-watch)에선 ForkTsChecker가 비동기로 통과해도, `pnpm start:local`(watch)에서 차단되는 TS1272는 watch 모드에서 즉시 잡힘.
- 마이그레이션 CLI(`migration:*`)는 `ts-node/register + tsconfig-paths/register` 그대로 유지. 운영 안정성 분리를 위해 SWC 전환 범위에서 제외.
- 상세 가이드: `docs/swc-migration-guide.md`

### NestJS Conventions

- 모듈 파일(`*.module.ts`) 수정 후 모든 providers, exports, imports가 올바르게 등록되었는지 확인한다. 흔한 실수: Guard/Service를 export하면서 providers에 추가하지 않는 것.
- 모든 DTO에 `class-validator`와 `class-transformer` 데코레이터를 사용한다.

### DTO 구조

- `dto/request/` — 요청 DTO (`class-validator` 데코레이터로 유효성 검증). 페이지네이션+필터 DTO는 `PaginationRequestDto`를 상속하여 도메인별 필터 필드를 추가한다.
- `dto/response/` — 응답 DTO (static `of(entity)` 팩토리 메서드로 엔티티 → DTO 변환)

### 환경 설정

- `cross-env`로 `NODE_ENV`를 설정하면 `ConfigModule`이 `.env.${NODE_ENV}` 파일을 로드
- `.env.local`, `.env.development`, `.env.production` — Git에서 제외됨
- `.env.example` — 템플릿, Git에 포함
- `synchronize`는 모든 환경에서 `false` — 스키마 변경은 migration으로 관리
- `logging`은 production이 아닌 환경에서만 활성화

### Swagger

`/api` 경로에서 Swagger UI 확인 가능. DTO에 `@ApiProperty`/`@ApiPropertyOptional` 적용. Bearer Auth 설정이 포함되어 있으므로 인증이 필요한 엔드포인트에 `@ApiBearerAuth()` 적용.

### Compodoc (소스 구조 문서)

내부 개발자용 구조 문서(모듈 트리·클래스 카탈로그·DI 의존성 그래프·JSDoc 본문) 자동 생성. Swagger와 보완 관계 — Compodoc = 내부 구조 문서, Swagger = 외부 API 문서. Compodoc의 라우트 추출은 Angular `@RouterModule` 전용이라 NestJS `@Controller` 라우트를 읽지 못해 빈 Routes 페이지가 생기므로 `disableRoutesGraph: true`로 메뉴를 제거함 — 라우트 문서는 Swagger가 담당.

- `pnpm docs:serve`(로컬 서버 + watch) / `pnpm docs:build`(`documentation/`에 정적 생성, gitignore됨)
- **설정은 `.compodocrc.json` 단일 파일** — scripts에 CLI 플래그를 중복 정의하지 않는다 (실행 모드 `-s -w`만 예외)
- **스캔 범위는 `tsconfig.doc.json`으로 제어** — Compodoc에는 `--exclude` CLI 플래그가 없으며 tsconfig의 `include`/`exclude`를 따른다. 루트 `tsconfig.json`·빌드·마이그레이션 경로는 건드리지 않는다
- **앱 간 동일 클래스명 금지** — Compodoc은 클래스명으로 문서 페이지를 만들어 동명 클래스가 서로 덮어쓴다. 루트 모듈을 `ServiceAppModule`/`BackOfficeAppModule`로 분리한 선례를 따라, 새 앱/모듈 추가 시 앱 간 클래스명이 겹치지 않게 한다
- **Guides 메뉴** — `docs/summary.json`에 등록된 가이드 문서만 사이트에 포함된다. 큐레이션 원칙: 현재 유효한 아키텍처 가이드만 포함, PRD·todo(작업 이력)는 제외. 새 가이드 문서 작성 시 `summary.json`에 추가
- **알려진 제약: 가이드 본문의 `.md` 상대 링크는 사이트에서 404** — 원본 md는 GitHub 열람 기준이라 `./xxx-guide.md` 링크를 사용하는데, Compodoc은 이를 HTML 슬러그로 재작성하지 않는다. 사이트용으로 고치면 GitHub 렌더링이 깨지므로 그대로 둔다 (README 페이지의 레포 상대 링크도 동일)
- 도입 배경·결정 사항: `docs/compodoc-prd.md`

### Testing

- 코드 변경 후 항상 `pnpm build:all`과 `pnpm test`를 실행한다.
- auth 관련 파일 변경 시 `pnpm test:e2e`도 실행한다.
- 테스트 `describe`는 영문 클래스명, `it` 문장은 한국어로 행위와 결과를 진술한다 (전체 spec 일관 규칙).
- Jest `globalSetup`/`globalTeardown` 파일은 반드시 상대 경로 import를 사용한다 (path alias 금지).

### 테스트 구조 (Classical School)

원칙: **로직은 단위 테스트, 연결(wiring)은 통합 테스트.** pass-through 레이어(Controller, Repository)의 단위 테스트는 작성하지 않는다.

- **단위 테스트** (`apps/**/*.spec.ts`, `libs/**/*.spec.ts`) — 실제 조건 분기/변환 로직이 있는 레이어만 테스트
  - Handler 단위 테스트는 [Suites](https://docs.nestjs.com/recipes/suites)(`TestBed.solitary(...).compile()`)로 작성하고 `unitRef.get(Token)`으로 자동 mock을 회수한다. `Test.createTestingModule(...)`는 통합 테스트 헬퍼(`createIntegrationApp`)에서만 사용한다. `Mocked<T>` 타입은 루트 `suites.d.ts`의 reference로 활성화되므로 spec에서 `import { TestBed, type Mocked } from '@suites/unit'`만 import하면 된다.
  - **Repository 인터페이스 토큰(abstract class)은 캐스팅 필수**: `IPostReadRepository`처럼 abstract class를 DI 토큰으로 쓰면 `unitRef.get`의 `Type<T>`(non-abstract constructor) 시그니처에 할당되지 못해 `TS2769` 발생. `import type { Type } from '@suites/types.common'`을 추가하고 `unitRef.get<IPostReadRepository>(IPostReadRepository as Type<IPostReadRepository>)` 패턴을 사용한다. `JwtService`/`ConfigService` 등 concrete class 토큰은 캐스팅 불필요. SWC 빌드(`pnpm build:all`)는 spec을 제외하므로 통과하지만 `tsc` strict 체크에서 잡힘.
  - Handler: 분기 로직(검증, 23505→`ConflictException` 매핑, `NotFoundException` 분기, DTO 변환 등)이 있는 Handler는 단위 테스트로 커버. 진정한 pass-through(예: `LogoutHandler`처럼 단일 write로 즉시 반환하고 검증 없음)는 통합 테스트로만.
  - DTO: `PostResponseDto.of()`, `PaginatedResponseDto.of()` — 순수 팩토리 함수
- **통합 테스트** (`test/service/*.integration-spec.ts`, `test/back-office/*.integration-spec.ts`) — Testcontainers + `globalSetup` 패턴. `globalSetup`에서 PostgreSQL/Redis 컨테이너를 1회 기동하고 migration을 실행한 뒤, 접속 정보를 `.test-env.json`에 기록. 각 테스트 파일은 `createIntegrationApp(ServiceAppModule)`(back-office는 `AdminTestModule`)으로 앱을 생성하고 `useTransactionRollback()`으로 **per-test 격리**를 적용하여 mock 없이 전체 플로우(Controller → CommandBus/QueryBus → Handler → Repository → TypeORM → PostgreSQL) 검증. HTTP 레이어(ValidationPipe, 라우팅, 상태 코드)도 통합 테스트에서 함께 검증. `globalTeardown`에서 컨테이너 종료 및 임시 파일 삭제. Docker 필수.
  - **격리 메커니즘**: `useTransactionRollback().start()`(beforeEach)에서 **TRUNCATE RESTART IDENTITY CASCADE + Redis FLUSHDB**로 매 테스트 직전 정리. `rollback()`(afterEach)는 no-op. `dataSource.manager` override 방식은 `@Transactional()`(typeorm-transactional)이 별도 커넥션으로 새 트랜잭션을 열어 충돌하므로 사용하지 않는다. 첫 테스트 실행 전과 다른 spec 파일 사이에는 새 `createIntegrationApp` 호출이 정리를 보장.
  - **typeorm-transactional 등록**: `createIntegrationApp` 내부에서 `deleteDataSourceByName('default')` 후 `addTransactionalDataSource(app.get(DataSource))` 호출. spec 파일마다 새 DataSource를 만들므로 매번 재등록 필요.
  - **Jest setupFiles**: 루트 `jest` 설정과 `test/{service,back-office}/jest-e2e.json`에 `test/setup/jest-setup.ts`가 등록되어 `initializeTransactionalContext()`를 1회 실행.
- ~~**e2e 테스트**~~ — 제거됨. 통합 테스트가 HTTP 레이어를 포함한 전체 플로우를 검증하므로 별도 e2e 테스트를 유지하지 않음.

### 작업 완료 후 검증

모든 작업이 완료되면 아래 명령을 순서대로 실행하여 문제가 없는지 확인한다.

```bash
pnpm format             # 포맷 자동 수정
pnpm lint:check         # 린트 검사 (포맷 외 규칙 포함)
pnpm build:all          # 양쪽 앱 빌드 확인
pnpm test               # 단위 테스트 통과 확인
pnpm test:e2e           # 통합 테스트 통과 확인 (Docker 필수)
```

### Git Workflow

- 사용자가 커밋과 푸시를 요청하면, 변경 사항을 재분석하거나 재계획하지 않고 즉시 수행한다. 사용자가 이미 작업을 검토했다고 가정한다.

### Worktree Workflow

병렬 작업은 워크트리로 격리한다. 워크트리는 Claude 네이티브 기본 위치인 `.claude/worktrees/`에 두며(`.gitignore`에 등록되어 메인 체크아웃 `git status`를 더럽히지 않음), 생성·정리는 전용 스킬로 표준화한다.

- **생성**: `/start-worktree <브랜치명>`. 타입별 base(`feature/*`→`origin/dev`, 그 외→`origin/main`)에서 분기하고, gitignore된 `.env.*`·`settings.local.json`을 복사한 뒤 `pnpm install`까지 수행한다. 이 레포는 env 누락 시 부팅·마이그레이션·통합테스트가 모두 실패하고 node_modules도 공유되지 않으므로, 이 두 단계가 빠지면 워크트리가 동작하지 않는다.
- **정리**: `/finish-worktree <브랜치명>`. **반드시 메인 체크아웃에서 실행**(제거 대상 워크트리 안에서는 삭제 불가). `gh pr view`로 머지(MERGED)를 확인한 뒤에만 워크트리·로컬 브랜치를 제거한다.
- **squash 삭제 주의**: `feature/* → dev`는 squash-merge라 로컬 브랜치가 git상 "미머지"로 남는다. 머지 확정 후 `git branch -D`(강제)가 정상 경로이며, `-d`는 거부된다.

### Planning

- 작업 계획 시 사용자가 명시적으로 요청한 범위만으로 제한한다. 요청하지 않은 추가 작업이나 단계를 포함하지 않는다.
- 범위가 불확실하면 확장하기 전에 먼저 질문한다.

### Sub-Agents

`.claude/agents/`에 정의된 전문 에이전트. 작업 성격에 맞으면 적극 활용한다.

| Agent                    | When to use                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `nestjs-expert`          | NestJS 모듈/Handler/Repository 작성, DI 디버깅, Handler Authoring Rules 적용, CQRS/Repository 전반   |
| `tdd-test-writer`        | TDD 기반 테스트 작성 (Suites `TestBed.solitary` 단위 테스트, `createIntegrationApp` 통합 테스트)     |
| `postgres-db-normalizer` | 스키마 설계/정규화 분석, TypeORM 엔티티/마이그레이션 생성                                            |
| `code-reviewer`          | 작성한 diff/PR을 fresh perspective로 검토 (코드 품질·타입·예외·유지보수성·중복·네이밍). 보안은 `security-review`, 성능은 OTEL에 위임 |

### Skills

커스텀 검증 및 유지보수 스킬은 `.claude/skills/`에 정의되어 있습니다.

| Skill                   | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `verify-implementation` | 프로젝트의 모든 verify 스킬을 순차 실행하여 통합 검증 보고서를 생성합니다       |
| `manage-skills`         | 세션 변경사항을 분석하고, 검증 스킬을 생성/업데이트하며, CLAUDE.md를 관리합니다 |
| `verify-restful-api`    | RESTful API 설계 원칙 준수 여부를 검증합니다                                    |
| `verify-handler-structure` | Service 앱 Command Handler 구조 회귀를 검증합니다 (메서드 분리, try-catch 범위, `@Transactional` 범위, 23505 매핑 위치) |
| `verify-db-safety`      | TypeORM 마이그레이션의 destructive query, rollback 가능성, NOT NULL 컬럼 추가 시 default 누락 등 DB 안전성을 검증합니다 |
| `verify-api-compat`     | API 하위 호환성을 검증합니다 (Response DTO `of()` 누락, Request 필수 필드 신규 추가, 라우트 시그니처 변경 등 git diff 기반) |
| `respond-coderabbit`    | CodeRabbit PR 리뷰 코멘트를 자동 분석하고 응답합니다                            |
| `commit`                | 검증(`format` → `lint:check` → `build` → `test` → `test:e2e`) 후 한국어 conventional commit 생성 및 푸시 |
| `create-pr`             | 브랜치 정책에 따라 대상 브랜치(`feature/*`→`dev`, `dev`→`main`)를 판별해 PR 생성 |
| `start-worktree`        | 타입별 base(`feature/*`→`origin/dev`, 그 외→`origin/main`)에서 워크트리 생성 + gitignore된 env·설정 복사 + `pnpm install` 자동화 |
| `finish-worktree`       | PR 머지 확인(`gh pr view` state=MERGED) 후 워크트리·로컬 브랜치 정리 + base 브랜치 갱신 |
