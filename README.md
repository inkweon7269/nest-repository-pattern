# NestJS Repository Pattern + CQRS Pattern

NestJS + TypeORM + PostgreSQL 기반 Posts CRUD API.
**Repository Pattern**으로 데이터 액세스를 추상화하고, **CQRS Pattern**으로 읽기/쓰기 관심사를 분리한다.

### 주요 기능

| 기능 | 설명 |
|------|------|
| **Posts CRUD** | 게시물 생성/조회/수정/삭제 (Soft Delete) |
| **Auth** | JWT 기반 회원가입, 로그인, 로그아웃, 토큰 갱신, 프로필 조회 |
| **Health Check** | `GET /health` — DB + Redis 연결 상태 확인 + Graceful Shutdown |
| **Rate Limiting** | `@nestjs/throttler` 기반 글로벌 Rate Limiting (login/register 엄격 제한) |
| **Cache Layer** | Redis 기반 Cache-Aside 패턴 (CQRS Handler 레벨, Fail-Open) |
| **Idempotency** | Redis 기반 POST 요청 멱등성 보장 |
| **Logging** | pino-http 기반 구조화 로깅 (correlation ID, redaction) |
| **Slack 알림** | 게시물 생성 시 이벤트 기반 Slack 알림 |

## 목차

- [아키텍처](#아키텍처)
  - [요청 흐름](#요청-흐름)
  - [CQRS 설계 원칙](#cqrs-설계-원칙)
  - [프로젝트 구조](#프로젝트-구조)
- [디자인 패턴](#디자인-패턴)
  - [CQRS Pattern](#cqrs-pattern)
  - [Repository Pattern (ISP 적용)](#repository-pattern-isp-적용)
- [인프라 기능](#인프라-기능)
  - [Health Check & Graceful Shutdown](#health-check--graceful-shutdown)
  - [Rate Limiting](#rate-limiting)
  - [Cache Layer](#cache-layer)
- [시작하기](#시작하기)
  - [환경 설정](#환경-설정)
  - [실행](#실행)
  - [Migration](#migration)
- [API](#api)
- [테스트](#테스트)
  - [테스트 전략 (Classical School)](#테스트-전략-classical-school)
  - [테스트 구성](#테스트-구성)
  - [단위 테스트](#단위-테스트)
  - [통합 테스트](#통합-테스트)
  - [커버리지](#커버리지)
- [CI/CD](#cicd)
- [문서](#문서)

---

## 아키텍처

### 요청 흐름

```
HTTP Request
  │
  ▼
Controller              ← 라우팅, Command/Query 객체 생성
  │
  ├──→ CommandBus.execute()        ← 상태 변경 (Create, Update, Delete)
  │      │
  │      ▼
  │    Command Handler             ← 쓰기 로직. void 또는 ID 반환
  │      │
  │      ├──→ IPostWriteRepository ← 상태 변경 (create, update, delete)
  │      └──→ CacheService         ← 캐시 무효화 (del, delByPattern)
  │
  └──→ QueryBus.execute()          ← 상태 조회 (GetById, FindAllPaginated)
         │
         ▼
       Query Handler               ← 읽기 로직 + PostResponseDto.of() 변환
         │
         ├──→ CacheService.get()   ← 캐시 HIT → 즉시 반환
         └──→ IPostReadRepository  ← 캐시 MISS → DB 조회 → CacheService.set()
                   │
                   ▼
              PostRepository → BaseRepository → TypeORM → PostgreSQL
```

### CQRS 설계 원칙

| 원칙 | 설명 |
|------|------|
| Command는 상태만 변경 | 반환 타입은 `void` 또는 최소 식별자(`number`). DTO를 반환하지 않음 |
| Query는 상태만 조회 | DTO 변환은 Query Handler에서 수행 |
| Command와 Query를 분리 | 하나의 플로우에서 Command와 Query를 혼합하지 않음 |
| Repository는 순수 데이터 접근 | 예외, 검증 등 비즈니스 로직 없음 |
| 검증은 Handler에서 수행 | affected count가 0이면 `NotFoundException` |
| Repository는 도메인 타입 사용 | HTTP Request DTO가 아닌 `CreatePostInput`/`UpdatePostInput` |
| Query에 파생 값 없음 | `page`/`limit`만 보유, `skip` 계산은 Repository |

### 프로젝트 구조

```
src/
├── main.ts                        # 앱 부트스트랩 (ValidationPipe, Swagger, Shutdown Hooks)
├── app.module.ts                  # 루트 모듈 (Config, TypeORM, Throttler, EventEmitter)
├── data-source.ts                 # TypeORM CLI용 DataSource
├── posts/                         # 게시물 도메인 (CQRS + Repository Pattern)
│   ├── command/                   # Command + Handler (생성/수정/삭제 + 캐시 무효화)
│   ├── query/                     # Query + Handler (조회/목록 + 캐시 적용)
│   ├── interface/                 # Repository 인터페이스 (Read/Write 분리)
│   ├── entities/                  # Post 엔티티 (Soft Delete)
│   ├── dto/                       # Request/Response DTO
│   ├── event/                     # PostCreatedEvent + Slack 알림 Handler
│   ├── post.repository.ts        # PostRepository 구현체
│   └── post-repository.provider.ts
├── auth/                          # 인증 도메인 (동일 CQRS 구조)
│   ├── command/                   # register, login, logout, refresh-token
│   ├── query/                     # get-profile (캐시 적용)
│   ├── interface/                 # IUserReadRepository / IUserWriteRepository
│   ├── guard/                     # JwtAuthGuard
│   └── strategy/                  # JwtStrategy
├── health/                        # Health Check (@nestjs/terminus)
│   ├── health.controller.ts       # GET /health (DB + Redis)
│   └── redis-health.indicator.ts  # 커스텀 Redis 헬스 인디케이터
├── slack/                         # Slack 알림 모듈
├── common/
│   ├── cache/                     # CacheService (Redis 기반, Fail-Open)
│   ├── idempotency/               # 멱등성 처리 (Redis)
│   ├── logging/                   # 구조화 로깅 (pino-http)
│   ├── decorator/                 # @CurrentUser() 등 커스텀 데코레이터
│   ├── dto/                       # 공통 DTO (Pagination)
│   ├── query/                     # PaginatedQuery 추상 클래스
│   └── base.repository.ts        # BaseRepository (DataSource 추상화)
├── database/
│   └── typeorm.config.ts          # DataSource 설정 팩토리
└── migrations/                    # TypeORM 마이그레이션

test/
├── posts.integration-spec.ts      # Posts 통합 테스트
├── auth.integration-spec.ts       # Auth 통합 테스트
└── setup/
    ├── global-setup.ts            # PostgreSQL + Redis 컨테이너 기동
    ├── global-teardown.ts         # 컨테이너 종료
    └── integration-helper.ts      # 앱 생성 + per-test 트랜잭션 격리
```

---

## 디자인 패턴

### CQRS Pattern

**목적:** 읽기(Query)와 쓰기(Command)의 관심사를 분리하여 각 유스케이스를 독립적인 Handler로 처리한다.

#### 왜 사용하는가?

Facade/Service 패턴에서는 하나의 클래스가 CRUD 전체를 담당하여 다음 문제가 생긴다:

- 읽기/쓰기 로직이 하나의 클래스에 혼재 → 책임이 모호
- 유스케이스가 늘어날수록 Service가 비대해짐
- 트랜잭션 범위를 읽기/쓰기별로 다르게 적용하기 어려움

CQRS를 적용하면:

- **유스케이스당 하나의 Handler** → 단일 책임 원칙
- **Command와 Query가 독립적** → 트랜잭션 범위를 쓰기에만 한정 가능
- **Command와 Query가 완전히 분리** → 하나의 플로우에서 Command와 Query를 혼합하지 않음

#### Controller 패턴

```ts
// 생성: Command로 ID 반환 → { id } 응답 (201)
@Post()
async createPost(@Body() dto: CreatePostRequestDto): Promise<CreatePostResponseDto> {
  const id = await this.commandBus.execute<CreatePostCommand, number>(
    new CreatePostCommand(dto.title, dto.content, dto.isPublished),
  );
  return CreatePostResponseDto.of(id);
}

// 수정: Command만 (204 No Content)
@Patch(':id')
@HttpCode(HttpStatus.NO_CONTENT)
async updatePost(@Param('id') id: number, @Body() dto: UpdatePostRequestDto): Promise<void> {
  await this.commandBus.execute(
    new UpdatePostCommand(id, dto.title, dto.content, dto.isPublished),
  );
}

// 삭제: Command만 (204 No Content)
@Delete(':id')
@HttpCode(HttpStatus.NO_CONTENT)
async deletePost(@Param('id') id: number): Promise<void> {
  await this.commandBus.execute(new DeletePostCommand(id));
}
```

#### 각 레이어의 책임

| 레이어 | 책임 | 반환 타입 |
|--------|------|-----------|
| **Controller** | HTTP 라우팅, Command/Query 생성 | `Promise<DTO>` 또는 `void` |
| **Command Handler** | 존재 검증, 상태 변경 | `void` 또는 `number` |
| **Query Handler** | 조회 + `PostResponseDto.of()` 변환 | `Promise<DTO>` |
| **Repository** | 순수 데이터 액세스 (CRUD) | `Promise<Entity>` 또는 `Promise<number>` |

### Repository Pattern (ISP 적용)

**목적:** 데이터 액세스 로직을 비즈니스 로직으로부터 분리하여 교체 가능하게 만든다.
**인터페이스 분리 원칙(ISP)** 을 적용하여 읽기/쓰기 인터페이스를 분리한다.

#### 왜 사용하는가?

Handler가 TypeORM의 `Repository<Post>`를 직접 사용하면 다음 문제가 생긴다:

- Handler가 TypeORM API에 강결합 → ORM 교체 시 Handler 전체 수정
- 테스트 시 TypeORM 전체를 모킹해야 함
- 데이터 액세스 로직과 비즈니스 로직의 경계가 모호

Repository Pattern + ISP를 적용하면:

- **Handler는 필요한 인터페이스에만 의존** → Command Handler는 `IPostWriteRepository`만, Query Handler는 `IPostReadRepository`만
- **구현체 교체가 자유로움** → TypeORM이든, Prisma이든, 인메모리이든 Handler 코드 변경 없음
- **테스트가 단순** → 인터페이스만 모킹하면 됨

#### 구현 구조

```text
┌──────────────────────────────────────────────────────────────────┐
│ IPostReadRepository (abstract class)                              │
│ ─ findById(), findAllPaginated()                                 │
│                                                                  │
│ IPostWriteRepository (abstract class)                             │
│ ─ create(CreatePostInput), update(UpdatePostInput), delete()     │
│ ─ 도메인 입력 타입(CreatePostInput/UpdatePostInput)도 같은 파일에 정의 │
│                                                                  │
│ → TypeScript interface는 런타임에 사라지므로 abstract class 사용    │
│ → DI 토큰 역할 + 메서드 시그니처 정의                                │
├──────────────────────────────────────────────────────────────────┤
│ PostRepository (구현체)                                           │
│ ─ 두 인터페이스를 모두 구현                                          │
│ ─ BaseRepository를 상속하여 DataSource 접근                       │
│ ─ TypeORM Repository API를 사용한 실제 CRUD 구현                   │
│ ─ 비즈니스 로직(예외, 검증) 없음 — 순수 데이터 접근만                   │
├──────────────────────────────────────────────────────────────────┤
│ BaseRepository (공통 추상 클래스)                                   │
│ ─ DataSource를 주입받아 getRepository<T>() 제공                    │
│ ─ 선택적 EntityManager 파라미터 → 트랜잭션 지원                      │
├──────────────────────────────────────────────────────────────────┤
│ postRepositoryProviders (커스텀 프로바이더)                          │
│ ─ PostRepository를 등록 후 useExisting으로 두 추상 클래스에 매핑      │
│ ─ 모듈에서 TypeOrmModule.forFeature()를 사용하지 않음                │
└──────────────────────────────────────────────────────────────────┘
```

**DI 등록 방식:**

```ts
export const postRepositoryProviders: Provider[] = [
  PostRepository,
  { provide: IPostReadRepository, useExisting: PostRepository },
  { provide: IPostWriteRepository, useExisting: PostRepository },
];
```

`PostRepository` 인스턴스를 하나 생성하고, `useExisting`으로 두 추상 클래스 토큰에 동일 인스턴스를 매핑한다.

---

## 인프라 기능

### Health Check & Graceful Shutdown

- `@nestjs/terminus` 기반 `GET /health` — DB(TypeORM pingCheck) + Redis(커스텀 `RedisHealthIndicator`) 연결 상태 확인
- `app.enableShutdownHooks()` — SIGTERM/SIGINT 시 `OnModuleDestroy` 훅으로 Redis 연결 등 리소스 정리
- Rate Limiting에서 제외 (`@SkipThrottle({ short: true, long: true })`)

### Rate Limiting

- `@nestjs/throttler` 기반, `APP_GUARD`로 `ThrottlerGuard` 글로벌 등록
- Named Throttlers: `short` (1초 3회), `long` (분당 60회)
- login/register에 엄격한 제한: `@Throttle({ short: { ttl: 1000, limit: 2 }, long: { ttl: 60000, limit: 5 } })`
- 통합 테스트에서 `THROTTLE_SKIP=true`로 비활성화
- 429 Too Many Requests 자동 반환

### Cache Layer

- `CacheService` (`src/common/cache/`) — 기존 `REDIS_CLIENT`(ioredis)를 재사용. 추가 패키지 없음
- **Cache-Aside 패턴**: Query Handler에서 캐시 읽기/저장, Command Handler에서 캐시 무효화
- **Fail-Open**: 모든 Redis 연산을 try/catch로 감싸 Redis 장애 시 DB fallback
- 캐시 키에 `userId` 포함하여 사용자 격리 (예: `post:{userId}:{postId}`)
- TTL: 게시물 5분, 목록 3분, 프로필 10분
- 상세 가이드: [docs/cache-layer-guide.md](./docs/cache-layer-guide.md)

---

## 시작하기

### 환경 설정

```bash
# 의존성 설치
pnpm install

# 환경 변수 파일 생성
cp .env.example .env.local
```

`.env.local`에 PostgreSQL 연결 정보 설정:

```env
NODE_ENV=local
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_DATABASE=nest_repository
```

### 실행

```bash
pnpm start:local     # local 환경 (watch mode)
pnpm start:dev       # development 환경 (watch mode)
pnpm start:prod      # production 환경 (dist/main)
```

### Migration

`synchronize`는 모든 환경에서 `false`로 설정되어 있으며, 스키마 변경은 migration으로 관리한다.
Migration 파일은 TypeORM `Table` API로 작성하여 DB 이식성을 확보했다.

```bash
# pending migration 실행
pnpm migration:local
pnpm migration:dev
pnpm migration:prod

# 엔티티 diff로 migration 자동 생성
pnpm migration:generate:local -- src/migrations/CreatePostTable

# 마지막 migration 롤백
pnpm migration:revert:local

# 빈 migration 템플릿 생성
pnpm migration:create -- src/migrations/AddCategoryToPost
```

---

## API

Swagger UI: `http://localhost:3000/api`

| Method | Endpoint | 설명 | 상태 코드 | 인증 |
|--------|----------|------|-----------|------|
| GET | `/health` | Health Check (DB + Redis) | 200 / 503 | X |
| POST | `/auth/register` | 회원가입 | 201 / 409 | X |
| POST | `/auth/login` | 로그인 | 200 / 401 | X |
| POST | `/auth/refresh` | 토큰 갱신 | 200 / 401 | X |
| POST | `/auth/logout` | 로그아웃 | 204 / 401 | O |
| GET | `/auth/profile` | 내 프로필 조회 | 200 / 404 | O |
| GET | `/posts` | 게시글 페이지네이션 조회 | 200 | O |
| GET | `/posts/:id` | ID로 게시글 조회 | 200 / 404 | O |
| POST | `/posts` | 게시글 생성 | 201 / 409 | O |
| PATCH | `/posts/:id` | 게시글 수정 | 204 / 400 / 404 | O |
| DELETE | `/posts/:id` | 게시글 삭제 | 204 / 404 | O |

### 요청/응답 DTO

**CreatePostRequestDto:**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| title | string | O | 게시글 제목 |
| content | string | O | 게시글 내용 |
| isPublished | boolean | X | 게시 여부 (기본값: false) |

**UpdatePostRequestDto:**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| title | string | O | 게시글 제목 |
| content | string | O | 게시글 내용 |
| isPublished | boolean | O | 게시 여부 |

**PaginationRequestDto:**

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| page | number | X | 페이지 번호, 1-based (기본값: 1) |
| limit | number | X | 페이지당 항목 수 (기본값: 10, 최대: 100) |

**CreatePostResponseDto:**

| 필드 | 타입 | 설명 |
|------|------|------|
| id | number | 생성된 게시글 ID |

**PostResponseDto:**

| 필드 | 타입 | 설명 |
|------|------|------|
| id | number | 게시글 ID |
| title | string | 게시글 제목 |
| content | string | 게시글 내용 |
| isPublished | boolean | 게시 여부 |
| createdAt | Date | 생성일시 |
| updatedAt | Date | 수정일시 |

---

## 테스트

### 테스트 전략 (Classical School)

**원칙:** 로직은 단위 테스트, 연결(wiring)은 통합 테스트.
Pass-through 레이어(Controller, Repository)의 단위 테스트는 작성하지 않는다.

```bash
pnpm test            # 단위 테스트 (src/**/*.spec.ts)
pnpm test:e2e        # 통합 테스트 (test/**/*.integration-spec.ts)
pnpm test:cov        # 커버리지 리포트
```

### 테스트 구성

| 테스트 유형 | 위치 | 대상 | Docker |
|-------------|------|------|--------|
| **단위 테스트** | `src/**/*.spec.ts` | Handler (검증 분기, DTO 변환), DTO (`of()` 팩토리) | 불필요 |
| **통합 테스트** | `test/*.integration-spec.ts` | 전체 플로우 (Controller → CommandBus/QueryBus → Handler → Repository → PostgreSQL) | 필수 |

### 단위 테스트

실제 조건 분기/변환 로직이 있는 Handler와 DTO만 테스트:

- **Handler** — Repository를 모킹하여 NotFoundException 분기, void/ID 반환 검증 (`UpdatePostHandler`, `DeletePostHandler`, `GetPostByIdHandler`, `FindAllPostsPaginatedHandler`). pass-through 성격의 `CreatePostHandler`는 통합 테스트로 커버
- **DTO** — `PostResponseDto.of()`, `PaginatedResponseDto.of()` 순수 팩토리 함수 검증

### 통합 테스트

Testcontainers + `globalSetup` 패턴:

1. `globalSetup`에서 PostgreSQL 컨테이너를 1회 기동하고 migration 실행
2. 접속 정보를 `.test-env.json`에 기록
3. 각 테스트 파일은 `createIntegrationApp()`으로 앱 생성
4. `useTransactionRollback()`으로 per-test 트랜잭션 격리 적용
5. `globalTeardown`에서 컨테이너 종료 및 임시 파일 삭제

### 커버리지

```bash
pnpm test:cov        # 로컬 커버리지 리포트 생성 (coverage/ 디렉토리)
```

#### 측정 범위

커버리지는 **단위 테스트(`pnpm test`)만** 측정한다. 통합 테스트는 포함되지 않는다.

#### 커버리지가 낮은 이유

Classical School 전략에서 단위 테스트 대상은 **로직이 있는 Handler와 DTO 팩토리**뿐이다. 아래 pass-through 레이어는 단위 테스트 대상이 아니므로 커버리지 0%가 정상이다:

| 레이어 | 단위 테스트 | 커버되는 곳 |
|--------|:-----------:|------------|
| Handler (로직 분기 있음) | O | `src/**/*.spec.ts` |
| DTO 팩토리 (`of()`) | O | `src/**/*.spec.ts` |
| Controller | X | 통합 테스트 |
| Repository | X | 통합 테스트 |
| Module, Entity, Migration | X | 통합 테스트 |
| `main.ts` | X | 통합 테스트 |

실제 테스트 커버리지는 단위 + 통합을 합치면 훨씬 높지만, CI 리포트는 단위 테스트만의 수치를 보여준다.

#### PR 커버리지 리포트

PR을 생성하면 GitHub Actions가 **변경 파일별 커버리지 상세**를 코멘트로 표시한다.

| 지표 | 의미 |
|------|------|
| **Lines** | 실행된 코드 줄 비율 |
| **Statements** | 실행된 문(statement) 비율 (한 줄에 여러 문장 가능) |
| **Functions** | 호출된 함수/메서드 비율 |
| **Branches** | 통과된 조건 분기(if/else/삼항) 비율 |

리포트 해석 기준:
- **Handler/DTO 파일**: 80%+ Lines, 70%+ Branches 권장
- **Pass-through 파일** (Controller, Repository 등): 0%여도 정상 — 통합 테스트에서 커버
- 글로벌 threshold는 설정하지 않음 (pass-through 레이어 오탐 방지)

---

## CI/CD

GitHub Actions로 코드 품질을 자동 검증한다. 모든 워크플로우는 `main`, `dev` 브랜치 대상.

| 워크플로우 | 트리거 | 목적 |
|-----------|--------|------|
| **CI** | push, PR | lint, build, 단위 테스트, 통합 테스트 (3개 병렬 job) |
| **Coverage Report** | PR | 변경 파일별 커버리지 리포트를 PR 코멘트로 표시 |
| **TypeScript Strict Check** | push, PR | `tsc --noEmit` 타입 검사 + `--strict` 참고용 검사 |
| **Migration Safety Check** | PR (paths 필터) | migration/entity 변경 시 fresh DB에서 migration chain 무결성 검증 |
| **Dependency Audit** | push, PR, 매주 월요일 | `pnpm audit --prod` 프로덕션 의존성 보안 감사 |
| **PR Auto-label** | PR | 변경 파일 경로 기반 자동 라벨링 (`database`, `cqrs-command`, `test` 등) |

Dependabot이 의존성 업데이트 PR을 주간 자동 생성한다 (NestJS, TypeORM, Testing, ESLint 그룹).

---

## 문서

| 문서 | 설명 |
|------|------|
| [CLAUDE.md](./CLAUDE.md) | Claude Code 가이드 (아키텍처, 규칙, 명령어) |
| [Cache Layer 가이드](./docs/cache-layer-guide.md) | 캐시 적용 방법 및 전략 |
| [CQRS 가이드](./docs/cqrs-guide.md) | CQRS 패턴 적용 가이드 |
| [테스트 전략](./docs/testing-strategy.md) | Classical School 테스트 구조 |
| [멱등성 가이드](./docs/idempotency-guide.md) | Redis 기반 멱등성 처리 |
| [ISP 적용](./docs/interface-segregation-principle.md) | Repository 인터페이스 분리 원칙 |
| [GitHub Actions 가이드](./docs/github-actions-guide.md) | CI/CD 파이프라인 설정 |
