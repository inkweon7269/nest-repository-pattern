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
pnpm test               # unit tests
pnpm test:watch         # watch mode
pnpm test:cov           # coverage
pnpm test:e2e           # e2e tests

# Lint & Format
pnpm lint
pnpm format
```

## Architecture

NestJS 프로젝트에 **Repository Pattern**을 적용한 CRUD API. TypeORM + PostgreSQL 사용.

### Request Flow

```
Controller → Service → IPostRepository (abstract class) → PostRepository → BaseRepository → TypeORM → PostgreSQL
```

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
- `synchronize`와 `logging`은 production이 아닌 환경에서만 활성화

### Swagger

`/api` 경로에서 Swagger UI 확인 가능. DTO에 `@ApiProperty`/`@ApiPropertyOptional` 적용.
