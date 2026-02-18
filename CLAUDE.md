# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
# Build (environment-specific, uses cross-env)
pnpm build:local        # NODE_ENV=local
pnpm build:dev          # NODE_ENV=development
pnpm build:prod         # NODE_ENV=production

# Start (environment-specific)
pnpm start:local        # local + watch mode
pnpm start:dev          # development + watch mode
pnpm start:prod         # production (runs dist/main)
pnpm start:debug        # development + debug + watch mode

# Test
pnpm test               # unit tests (src/**/*.spec.ts)
pnpm test:watch         # watch mode
pnpm test:cov           # coverage
pnpm test:e2e           # integration tests (test/**/*.integration-spec.ts)

# Run a single test file
npx jest src/posts/posts.facade.spec.ts
npx jest --config ./test/jest-e2e.json test/posts.integration-spec.ts

# Lint & Format
pnpm lint
pnpm format

# Migration (environment-specific)
pnpm migration:local                                           # 로컬 DB에 pending migration 실행
pnpm migration:dev                                             # dev DB에 pending migration 실행
pnpm migration:prod                                            # prod DB에 pending migration 실행
pnpm migration:generate:local -- src/migrations/CreatePostTable  # 엔티티 diff로 migration 자동 생성
pnpm migration:revert:local                                    # 마지막 migration 롤백
pnpm migration:create -- src/migrations/AddCategoryToPost      # 빈 migration 템플릿 생성
```

## Architecture

NestJS 프로젝트에 **Repository Pattern**을 적용한 CRUD API. TypeORM + PostgreSQL 사용.

### Request Flow (Facade Pattern)

```
Controller → Facade → PostsValidationService (존재 검증) + PostsService (비즈니스 로직) → IPostReadRepository / IPostWriteRepository (abstract class) → PostRepository → BaseRepository → TypeORM → PostgreSQL
```

- **Controller** — 라우팅(HTTP 데코레이터)만 담당
- **Facade** — DTO 변환(`ResponseDto.of`), 오케스트레이션
- **PostsValidationService** — 엔티티 존재 여부 검증(`findById → null 체크 → NotFoundException`). `IPostReadRepository` 직접 주입
- **Service** — 순수 비즈니스 로직, 엔티티 반환

### Repository Pattern DI 구조 (ISP 적용)

1. **`IPostReadRepository`** / **`IPostWriteRepository`** (abstract class) — 읽기/쓰기 분리된 DI 토큰 겸 인터페이스
2. **`PostRepository`** — 두 인터페이스를 모두 구현, `BaseRepository` 상속
3. **`postRepositoryProviders`** — `PostRepository`를 등록 후 `useExisting`으로 두 추상 클래스 토큰에 동일 인스턴스를 매핑
4. 모듈에서 `TypeOrmModule.forFeature()`를 사용하지 않음. `BaseRepository`가 `DataSource`를 직접 주입받아 `getRepository<T>()`로 접근

### DTO 구조

- `dto/request/` — 요청 DTO (`class-validator` 데코레이터로 유효성 검증)
- `dto/response/` — 응답 DTO (static `of(entity)` 팩토리 메서드로 엔티티 → DTO 변환)

### 환경 설정

- `cross-env`로 `NODE_ENV`를 설정하면 `ConfigModule`이 `.env.${NODE_ENV}` 파일을 로드
- `.env.local`, `.env.development`, `.env.production` — Git에서 제외됨
- `.env.example` — 템플릿, Git에 포함
- `synchronize`는 모든 환경에서 `false` — 스키마 변경은 migration으로 관리
- `logging`은 production이 아닌 환경에서만 활성화

### Swagger

`/api` 경로에서 Swagger UI 확인 가능. DTO에 `@ApiProperty`/`@ApiPropertyOptional` 적용.

### 테스트 구조 (Classical School)

원칙: **로직은 단위 테스트, 연결(wiring)은 통합 테스트.** pass-through 레이어(Controller, Service, Repository)의 단위 테스트는 작성하지 않는다.

- **단위 테스트** (`src/**/*.spec.ts`) — 실제 조건 분기/변환 로직이 있는 레이어만 테스트
  - Facade: `{ provide: PostsService, useValue: mockService }` + `{ provide: PostsValidationService, useValue: mockValidationService }` — DTO 변환 검증
  - DTO: `PostResponseDto.of()` — 순수 팩토리 함수
  - `PostsValidationService`는 pass-through 성격이므로 단위 테스트 대상이 아님 (통합 테스트에서 커버)
- **통합 테스트** (`test/**/*.integration-spec.ts`) — Testcontainers + `globalSetup` 패턴. `globalSetup`에서 PostgreSQL 컨테이너를 1회 기동하고 migration을 실행한 뒤, 접속 정보를 `.test-env.json`에 기록. 각 테스트 파일은 `createIntegrationApp()`으로 앱을 생성하고 `useTransactionRollback()`으로 **per-test 트랜잭션 격리**를 적용하여 mock 없이 전체 플로우(Controller → … → TypeORM → PostgreSQL) 검증. HTTP 레이어(ValidationPipe, 라우팅, 상태 코드)도 통합 테스트에서 함께 검증. `globalTeardown`에서 컨테이너 종료 및 임시 파일 삭제. Docker 필수.
- ~~**e2e 테스트**~~ — 제거됨. 통합 테스트가 HTTP 레이어를 포함한 전체 플로우를 검증하므로 별도 e2e 테스트를 유지하지 않음.

### 작업 완료 후 검증

모든 작업이 완료되면 아래 명령을 순서대로 실행하여 문제가 없는지 확인한다.

```bash
pnpm build:local        # 빌드 확인
pnpm start:local        # 서버 기동 확인 (정상 기동 후 종료)
pnpm test               # 단위 테스트 통과 확인
pnpm test:e2e           # 통합 테스트 통과 확인 (Docker 필수)
```

### Skills

커스텀 검증 및 유지보수 스킬은 `.claude/skills/`에 정의되어 있습니다.

| Skill                   | Purpose                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| `verify-implementation` | 프로젝트의 모든 verify 스킬을 순차 실행하여 통합 검증 보고서를 생성합니다       |
| `manage-skills`         | 세션 변경사항을 분석하고, 검증 스킬을 생성/업데이트하며, CLAUDE.md를 관리합니다 |
| `verify-restful-api`    | RESTful API 설계 원칙 준수 여부를 검증합니다                                    |
