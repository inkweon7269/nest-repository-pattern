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
- `@JoinColumn`에 `name` 인자를 박지 않는다 — 하드코딩하면 strategy를 우회하여 camelCase 컬럼이 생성됨. 인자 없이 `@JoinColumn()`만 사용
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

### Cache Layer

- `CacheService` (`libs/shared/src/cache/`) — 기존 `REDIS_CLIENT`(ioredis)를 재사용한 캐시 유틸리티. 추가 패키지 없음
- **CQRS 정합**: Query Handler에서 캐시 읽기/저장, Command Handler에서 캐시 무효화
- **Fail-Open 패턴**: 모든 Redis 연산을 try/catch로 감싸 Redis 장애 시 DB fallback. 캐시 장애가 서비스 가용성에 영향을 미치지 않음
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

### Event-Driven (EventEmitter + Slack)

- `@nestjs/event-emitter` 기반 도메인 이벤트 발행 — Command Handler에서 상태 변경 후 이벤트 발행
- `PostCreatedEvent` → `PostCreatedHandler`가 Slack 알림 전송 (`apps/service/src/posts/event/`)
- `SlackModule` / `SlackService` (`libs/shared/src/slack/`) — Slack Bot Token으로 채널 알림 전송
- 이벤트 핸들러는 비동기 처리되므로 메인 요청 흐름에 영향 없음

### OpenTelemetry

- `libs/shared/src/instrumentation.ts` — OTEL SDK 자동 계측 초기화 (양쪽 앱의 `main.ts`에서 import)
- `OTEL_ENABLED` 환경변수로 활성화/비활성화 제어
- `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`으로 trace 수집 대상 설정

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

### Testing

- 코드 변경 후 항상 `pnpm build:all`과 `pnpm test`를 실행한다.
- auth 관련 파일 변경 시 `pnpm test:e2e`도 실행한다.
- Jest `globalSetup`/`globalTeardown` 파일은 반드시 상대 경로 import를 사용한다 (path alias 금지).

### 테스트 구조 (Classical School)

원칙: **로직은 단위 테스트, 연결(wiring)은 통합 테스트.** pass-through 레이어(Controller, Repository)의 단위 테스트는 작성하지 않는다.

- **단위 테스트** (`apps/**/*.spec.ts`, `libs/**/*.spec.ts`) — 실제 조건 분기/변환 로직이 있는 레이어만 테스트
  - Handler 단위 테스트는 [Suites](https://docs.nestjs.com/recipes/suites)(`TestBed.solitary(...).compile()`)로 작성하고 `unitRef.get(Token)`으로 자동 mock을 회수한다. `Test.createTestingModule(...)`는 통합 테스트 헬퍼(`createIntegrationApp`)에서만 사용한다. `Mocked<T>` 타입은 루트 `suites.d.ts`의 reference로 활성화되므로 spec에서 `import { TestBed, type Mocked } from '@suites/unit'`만 import하면 된다.
  - **Repository 인터페이스 토큰(abstract class)은 캐스팅 필수**: `IPostReadRepository`처럼 abstract class를 DI 토큰으로 쓰면 `unitRef.get`의 `Type<T>`(non-abstract constructor) 시그니처에 할당되지 못해 `TS2769` 발생. `import type { Type } from '@suites/types.common'`을 추가하고 `unitRef.get<IPostReadRepository>(IPostReadRepository as Type<IPostReadRepository>)` 패턴을 사용한다. `JwtService`/`ConfigService` 등 concrete class 토큰은 캐스팅 불필요. SWC 빌드(`pnpm build:all`)는 spec을 제외하므로 통과하지만 `tsc` strict 체크에서 잡힘.
  - Handler: DTO 변환 또는 NotFoundException 분기가 있는 Handler만 테스트 (`UpdatePostHandler`, `DeletePostHandler`, `GetPostByIdHandler`, `FindAllPostsPaginatedHandler`). pass-through 성격의 `CreatePostHandler`는 통합 테스트로 커버
  - DTO: `PostResponseDto.of()`, `PaginatedResponseDto.of()` — 순수 팩토리 함수
- **통합 테스트** (`test/service/*.integration-spec.ts`, `test/back-office/*.integration-spec.ts`) — Testcontainers + `globalSetup` 패턴. `globalSetup`에서 PostgreSQL 컨테이너를 1회 기동하고 migration을 실행한 뒤, 접속 정보를 `.test-env.json`에 기록. 각 테스트 파일은 `createIntegrationApp(AppModule)`으로 앱을 생성하고 `useTransactionRollback()`으로 **per-test 트랜잭션 격리**를 적용하여 mock 없이 전체 플로우(Controller → CommandBus/QueryBus → Handler → Repository → TypeORM → PostgreSQL) 검증. HTTP 레이어(ValidationPipe, 라우팅, 상태 코드)도 통합 테스트에서 함께 검증. `globalTeardown`에서 컨테이너 종료 및 임시 파일 삭제. Docker 필수.
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

### Planning

- 작업 계획 시 사용자가 명시적으로 요청한 범위만으로 제한한다. 요청하지 않은 추가 작업이나 단계를 포함하지 않는다.
- 범위가 불확실하면 확장하기 전에 먼저 질문한다.

### Skills

커스텀 검증 및 유지보수 스킬은 `.claude/skills/`에 정의되어 있습니다.

| Skill                   | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `verify-implementation` | 프로젝트의 모든 verify 스킬을 순차 실행하여 통합 검증 보고서를 생성합니다       |
| `manage-skills`         | 세션 변경사항을 분석하고, 검증 스킬을 생성/업데이트하며, CLAUDE.md를 관리합니다 |
| `verify-restful-api`    | RESTful API 설계 원칙 준수 여부를 검증합니다                                    |
| `respond-coderabbit`    | CodeRabbit PR 리뷰 코멘트를 자동 분석하고 응답합니다                            |
| `commit`                | 검증(`format` → `lint:check` → `build` → `test` → `test:e2e`) 후 한국어 conventional commit 생성 및 푸시 |
| `create-pr`             | 브랜치 정책에 따라 대상 브랜치(`feature/*`→`dev`, `dev`→`main`)를 판별해 PR 생성 |
