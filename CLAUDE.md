# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **문서 구조**: 이 파일은 전역 공통 사항만 담는다. 영역별 상세 규칙은 해당 디렉터리의 CLAUDE.md에 분할되어 있으며, 그 디렉터리의 파일을 읽을 때 자동 로드된다. 영역 작업 전 해당 문서를 우선 참고한다.

| 문서 | 담당 영역 |
| --- | --- |
| `apps/service/CLAUDE.md` | CQRS 설계 원칙, Handler Authoring Rules, Repository DI 구조, Auth/OAuth, Event-Driven, Transaction, DTO, API Versioning, Rate Limiting, Swagger, 단위 테스트 패턴 |
| `apps/back-office/CLAUDE.md` | 관리자 앱 특이사항 (공통 패턴은 service 문서를 따름) |
| `libs/shared/CLAUDE.md` | 엔티티/DB 네이밍/Soft Delete, bootstrap 헬퍼(Security·Compression), Cache, Logging, Idempotency, Health, OTEL/Slow Query Alert |
| `test/CLAUDE.md` | 통합 테스트 구조 (Testcontainers, 격리 메커니즘, typeorm-transactional 등록) |

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

### Request Flow

```text
Controller → CommandBus / QueryBus → Handler (검증 + 로직) → IPostReadRepository / IPostWriteRepository → PostRepository → BaseRepository → TypeORM → PostgreSQL
```

### NestJS Conventions

- 모듈 파일(`*.module.ts`) 수정 후 모든 providers, exports, imports가 올바르게 등록되었는지 확인한다. 흔한 실수: Guard/Service를 export하면서 providers에 추가하지 않는 것.
- 모든 DTO에 `class-validator`와 `class-transformer` 데코레이터를 사용한다.

### 환경 설정

- `cross-env`로 `NODE_ENV`를 설정하면 `ConfigModule`이 `.env.${NODE_ENV}` 파일을 로드
- `.env.local`, `.env.development`, `.env.production` — Git에서 제외됨
- `.env.example` — 템플릿, Git에 포함
- `synchronize`는 모든 환경에서 `false` — 스키마 변경은 migration으로 관리
- `logging`은 production이 아닌 환경에서만 활성화

### Build Tooling (SWC)

- 빌드는 **webpack + swc-loader**, 단위/통합 테스트는 **`@swc/jest`**. 모노레포 모드는 SWC builder를 직접 지원하지 않으므로 NestJS 공식 권장 경로인 webpack 경유.
- `webpack.config.js`(루트)는 함수 형태 — nest CLI 기본값(`webpack-defaults`: externals, `TsconfigPathsPlugin`, `IgnorePlugin`, `ForkTsCheckerWebpackPlugin`, `node: { __dirname: false }`)을 그대로 spread로 보존하고 `module.rules`만 swc-loader로 교체. 새로운 webpack 옵션이 필요하면 spread 패턴을 깨지 않도록 주의(예: `node`/`plugins`/`module`을 통째로 덮어쓰지 말 것).
- SWC 옵션은 `@nestjs/cli/lib/compiler/defaults/swc-defaults`의 `swcDefaultsFactory()`를 그대로 사용. 빌드는 `swcrc: false`로 격리, Jest는 루트 `.swcrc`를 사용.
- 엔티티 양방향 관계의 SWC 호환 필수 패턴(`Relation<T>` + `import type`)은 `libs/shared/CLAUDE.md` 참고.
- `pnpm build:all`(non-watch)에선 ForkTsChecker가 비동기로 통과해도, `pnpm start:local`(watch)에서 차단되는 TS1272는 watch 모드에서 즉시 잡힘.
- 마이그레이션 CLI(`migration:*`)는 `ts-node/register + tsconfig-paths/register` 그대로 유지. 운영 안정성 분리를 위해 SWC 전환 범위에서 제외.
- 상세 가이드: `docs/swc-migration-guide.md`

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
- 테스트 전략 원칙(Classical School): **로직은 단위 테스트, 연결(wiring)은 통합 테스트.** 단위 테스트 작성 패턴은 `apps/service/CLAUDE.md`, 통합 테스트 구조는 `test/CLAUDE.md` 참고.

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
