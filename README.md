# NestJS Repository Pattern + CQRS Pattern (Monorepo)

NestJS **모노레포** 기반 Posts CRUD API + Admin Back-Office.
**Repository Pattern**으로 데이터 액세스를 추상화하고, **CQRS Pattern**으로 읽기/쓰기 관심사를 분리한다.

### 주요 기능

| 기능 | 설명 |
|------|------|
| **Posts CRUD** | 게시물 생성/조회/수정/삭제 (Soft Delete) |
| **Auth** | JWT 기반 회원가입, 로그인, 로그아웃, 토큰 갱신, 프로필 조회 |
| **Admin Back-Office** | 별도 서버로 운영되는 관리자 인증 (AdminRole: SUPER, MANAGER) |
| **Health Check** | `GET /health` — DB + Redis 연결 상태 확인 + Graceful Shutdown |
| **Rate Limiting** | `@nestjs/throttler` 기반 글로벌 Rate Limiting (login/register 엄격 제한) |
| **Cache Layer** | Redis 기반 Cache-Aside 패턴 (CQRS Handler 레벨, Fail-Open) |
| **Idempotency** | Redis 기반 POST 요청 멱등성 보장 |
| **Logging** | pino-http 기반 구조화 로깅 (correlation ID, redaction) |
| **Slack 알림** | 게시물 생성 시 이벤트 기반 Slack 알림 |

## 목차

- [아키텍처](#아키텍처)
  - [모노레포 구조](#모노레포-구조)
  - [요청 흐름](#요청-흐름)
  - [CQRS 설계 원칙](#cqrs-설계-원칙)
- [디자인 패턴](#디자인-패턴)
  - [CQRS Pattern](#cqrs-pattern)
  - [Repository Pattern (ISP 적용)](#repository-pattern-isp-적용)
- [인프라 기능](#인프라-기능)
- [시작하기](#시작하기)
- [API](#api)
- [테스트](#테스트)
- [CI/CD](#cicd)
- [문서](#문서)

---

## 아키텍처

### 모노레포 구조

NestJS Monorepo Mode로 서비스(사용자)와 관리자(Back-Office) 서버를 분리하고, 공유 코드를 라이브러리로 관리한다.

```
project-root/
├── apps/
│   ├── service/                     # 사용자 서버 (PORT=3000)
│   │   └── src/
│   │       ├── auth/                # 사용자 인증 (JWT, CQRS)
│   │       └── posts/               # 게시물 CRUD (CQRS)
│   │
│   └── back-office/                 # 관리자 서버 (ADMIN_PORT=3001)
│       └── src/
│           └── auth/                # 관리자 인증 (별도 JWT, AdminRole)
│
├── libs/
│   └── shared/                      # 공유 라이브러리 (@app/shared)
│       └── src/
│           ├── entities/            # User, Post, Admin, BaseTimeEntity
│           ├── migrations/          # TypeORM 마이그레이션
│           ├── database/            # TypeORM 설정
│           ├── common/              # BaseRepository, DTO, Query
│           ├── cache/               # CacheService (Redis, Fail-Open)
│           ├── logging/             # 구조화 로깅 (pino-http)
│           ├── idempotency/         # 멱등성 처리 (Redis)
│           ├── health/              # Health Check (@nestjs/terminus)
│           └── slack/               # Slack 알림
│
└── test/
    ├── setup/                       # 공유 테스트 인프라 (Testcontainers)
    ├── service/                     # 서비스 통합 테스트
    └── back-office/                 # 관리자 통합 테스트
```

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

---

## 디자인 패턴

### CQRS Pattern

**목적:** 읽기(Query)와 쓰기(Command)의 관심사를 분리하여 각 유스케이스를 독립적인 Handler로 처리한다.

| 레이어 | 책임 | 반환 타입 |
|--------|------|-----------|
| **Controller** | HTTP 라우팅, Command/Query 생성 | `Promise<DTO>` 또는 `void` |
| **Command Handler** | 존재 검증, 상태 변경 | `void` 또는 `number` |
| **Query Handler** | 조회 + `PostResponseDto.of()` 변환 | `Promise<DTO>` |
| **Repository** | 순수 데이터 액세스 (CRUD) | `Promise<Entity>` 또는 `Promise<number>` |

### Repository Pattern (ISP 적용)

**목적:** 데이터 액세스 로직을 비즈니스 로직으로부터 분리. **인터페이스 분리 원칙(ISP)** 을 적용하여 읽기/쓰기 인터페이스를 분리한다.

```ts
export const postRepositoryProviders: Provider[] = [
  PostRepository,
  { provide: IPostReadRepository, useExisting: PostRepository },
  { provide: IPostWriteRepository, useExisting: PostRepository },
];
```

---

## 인프라 기능

### Health Check & Graceful Shutdown

- `@nestjs/terminus` 기반 `GET /health` — DB + Redis 연결 상태 확인
- `app.enableShutdownHooks()` — SIGTERM/SIGINT 시 리소스 정리
- Rate Limiting에서 제외 (`@SkipThrottle`)

### Rate Limiting

- `@nestjs/throttler` 기반, `APP_GUARD`로 글로벌 등록
- Named Throttlers: `short` (1초 3회), `long` (분당 60회)
- login/register에 엄격한 제한

### Cache Layer

- `CacheService` — Redis 기반, Cache-Aside 패턴, Fail-Open
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

`.env.local`에 PostgreSQL, Redis, JWT 연결 정보 설정.

### 실행

```bash
# 서비스 서버 (사용자, PORT=3000)
pnpm start:service:local

# 관리자 서버 (Back-Office, ADMIN_PORT=3001)
pnpm start:back-office:local

# 빌드
pnpm build:all           # 양쪽 앱 빌드
pnpm build:service       # 서비스만 빌드
pnpm build:back-office   # 관리자만 빌드
```

### Migration

`synchronize`는 모든 환경에서 `false`. 스키마 변경은 migration으로 관리한다.
마이그레이션 파일은 `libs/shared/src/migrations/`에 위치.

```bash
pnpm migration:local     # pending migration 실행
pnpm migration:revert:local  # 마지막 migration 롤백
```

---

## API

### 서비스 서버 (PORT=3000)

Swagger UI: `http://localhost:3000/api`

| Method | Endpoint | 설명 | 인증 |
|--------|----------|------|------|
| GET | `/health` | Health Check (DB + Redis) | X |
| POST | `/v1/auth/register` | 회원가입 | X |
| POST | `/v1/auth/login` | 로그인 | X |
| POST | `/v1/auth/refresh` | 토큰 갱신 | X |
| POST | `/v1/auth/logout` | 로그아웃 | O |
| GET | `/v1/auth/profile` | 내 프로필 조회 | O |
| GET | `/v1/posts` | 게시글 페이지네이션 조회 | O |
| GET | `/v1/posts/:id` | ID로 게시글 조회 | O |
| POST | `/v1/posts` | 게시글 생성 | O |
| PATCH | `/v1/posts/:id` | 게시글 수정 | O |
| DELETE | `/v1/posts/:id` | 게시글 삭제 | O |

### 관리자 서버 (ADMIN_PORT=3001)

Swagger UI: `http://localhost:3001/api`

| Method | Endpoint | 설명 | 인증 |
|--------|----------|------|------|
| GET | `/health` | Health Check (DB + Redis) | X |
| POST | `/v1/admin/auth/register` | 관리자 등록 (MANAGER 고정) | X |
| POST | `/v1/admin/auth/login` | 관리자 로그인 | X |
| POST | `/v1/admin/auth/refresh` | 관리자 토큰 갱신 | X |
| POST | `/v1/admin/auth/logout` | 관리자 로그아웃 | O |
| GET | `/v1/admin/auth/profile` | 관리자 프로필 조회 | O |

> 서비스 토큰과 관리자 토큰은 별도 JWT 시크릿을 사용하여 교차 사용이 불가합니다.

---

## 테스트

### 테스트 전략 (Classical School)

**원칙:** 로직은 단위 테스트, 연결(wiring)은 통합 테스트.

```bash
pnpm test                    # 단위 테스트 (apps/**/*.spec.ts, libs/**/*.spec.ts)
pnpm test:e2e                # 전체 통합 테스트 (service + back-office)
pnpm test:e2e:service        # 서비스 통합 테스트
pnpm test:e2e:back-office    # 관리자 통합 테스트
pnpm test:cov                # 커버리지 리포트
```

### 테스트 구성

| 테스트 유형 | 위치 | 대상 | Docker |
|-------------|------|------|--------|
| **단위 테스트** | `apps/**/*.spec.ts`, `libs/**/*.spec.ts` | Handler, DTO `of()` 팩토리 | 불필요 |
| **서비스 통합 테스트** | `test/service/*.integration-spec.ts` | Auth + Posts 전체 플로우 | 필수 |
| **관리자 통합 테스트** | `test/back-office/*.integration-spec.ts` | Admin Auth 전체 플로우 + 토큰 격리 | 필수 |

통합 테스트는 Testcontainers + `globalSetup` 패턴으로 PostgreSQL/Redis 컨테이너를 자동 관리하며, per-test 트랜잭션 격리를 적용한다.

---

## CI/CD

GitHub Actions로 코드 품질을 자동 검증한다.

| 워크플로우 | 트리거 | 목적 |
|-----------|--------|------|
| **CI** | push, PR | lint, build (`pnpm build:all`), 단위 테스트, 통합 테스트 |
| **Coverage Report** | PR | 변경 파일별 커버리지 리포트 |
| **TypeScript Strict Check** | push, PR | `tsc --noEmit` 타입 검사 |
| **Migration Safety Check** | PR (paths 필터) | migration/entity 변경 시 무결성 검증 |
| **Dependency Audit** | push, PR, 매주 | 프로덕션 의존성 보안 감사 |
| **PR Auto-label** | PR | 변경 파일 경로 기반 자동 라벨링 (`service`, `back-office`, `shared-library` 등) |

---

## 문서

| 문서 | 설명 |
|------|------|
| [CLAUDE.md](./CLAUDE.md) | Claude Code 가이드 (아키텍처, 규칙, 명령어) |
| [모노레포 분리 PRD](./docs/monorepo-separation-prd.md) | 서비스/관리자 서버 분리 기획 |
| [모노레포 분리 체크리스트](./docs/monorepo-separation-todo.md) | 마이그레이션 단계별 체크리스트 |
| [Cache Layer 가이드](./docs/cache-layer-guide.md) | 캐시 적용 방법 및 전략 |
| [CQRS 가이드](./docs/cqrs-guide.md) | CQRS 패턴 적용 가이드 |
| [테스트 전략](./docs/testing-strategy.md) | Classical School 테스트 구조 |
| [멱등성 가이드](./docs/idempotency-guide.md) | Redis 기반 멱등성 처리 |
| [ISP 적용](./docs/interface-segregation-principle.md) | Repository 인터페이스 분리 원칙 |
| [GitHub Actions 가이드](./docs/github-actions-guide.md) | CI/CD 파이프라인 설정 |
