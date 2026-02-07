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
pnpm test:e2e           # e2e tests (test/**/*.e2e-spec.ts)

# Run a single test file
npx jest src/posts/posts.service.spec.ts
npx jest --config ./test/jest-e2e.json test/posts.e2e-spec.ts

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
Controller → Facade → Service → IPostRepository (abstract class) → PostRepository → BaseRepository → TypeORM → PostgreSQL
```

- **Controller** — 라우팅(HTTP 데코레이터)만 담당
- **Facade** — DTO 변환(`ResponseDto.of`), 예외 처리(`NotFoundException`) 등 오케스트레이션
- **Service** — 순수 비즈니스 로직, 엔티티 반환

### Repository Pattern DI 구조

1. **`IPostRepository`** (abstract class) — DI 토큰 겸 인터페이스 역할
2. **`PostRepository`** — 구현체, `BaseRepository` 상속
3. **`postRepositoryProvider`** — `{ provide: IPostRepository, useClass: PostRepository }` 커스텀 프로바이더
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

### 테스트 구조

- **단위 테스트** (`src/**/*.spec.ts`) — 각 레이어는 직접 의존하는 하위 레이어만 모킹
  - Repository: `DataSource.manager.getRepository()` 체인을 모킹
  - Service: `{ provide: IPostRepository, useValue: mockRepository }`
  - Facade: `{ provide: PostsService, useValue: mockService }`
  - Controller: `{ provide: PostsFacade, useValue: mockFacade }`
- **e2e 테스트** (`test/**/*.e2e-spec.ts`) — `PostsModule`을 import 후 `overrideProvider(IPostRepository).useValue(mock)`로 DB 의존 제거. `ValidationPipe`(`whitelist`, `forbidNonWhitelisted`, `transform`)을 `main.ts`와 동일하게 설정.
