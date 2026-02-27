# GitHub Actions 워크플로우 구현 가이드

> 이 문서는 프로젝트에 GitHub Actions CI/CD 파이프라인을 구축하기 위한 구체적인 구현 방법을 안내한다. 총 6개의 워크플로우와 2개의 설정 파일을 다루며, 각 워크플로우의 설계 의도와 전체 코드를 포함한다. AWS 배포는 다루지 않는다.

---

## 목차

### Part I: 기반 설정
- [1. 사전 요구사항](#1-사전-요구사항)
- [2. 공통 패턴](#2-공통-패턴)
- [3. 파일 구조](#3-파일-구조)

### Part II: 워크플로우 구현
- [4. CI — Lint, Build, Test](#4-ci--lint-build-test)
- [5. Coverage Report](#5-coverage-report)
- [6. Dependency Audit + Dependabot](#6-dependency-audit--dependabot)
- [7. Migration Safety Check](#7-migration-safety-check)
- [8. PR Auto-label](#8-pr-auto-label)
- [9. TypeScript Strict Check](#9-typescript-strict-check)

### Part III: 운영
- [10. 검증 및 트러블슈팅](#10-검증-및-트러블슈팅)
- [11. 향후 확장 포인트](#11-향후-확장-포인트)

---

## Part I: 기반 설정

---

## 1. 사전 요구사항

| 항목 | 값 | 근거 |
|------|-----|------|
| Node.js | 22 LTS | `@types/node ^22`, tsconfig target ES2023 |
| pnpm | 9 | `pnpm-lock.yaml` lockfileVersion 9.0 |
| Runner | `ubuntu-latest` | Docker 내장 (Testcontainers 필요) |

GitHub Actions Ubuntu runner에는 Docker가 기본 설치되어 있으므로, Testcontainers 기반 통합 테스트가 별도 설정 없이 동작한다.

---

## 2. 공통 패턴

### 2.1 pnpm + Node.js Setup

모든 워크플로우에서 동일하게 사용하는 3-step 패턴:

```yaml
- name: Install pnpm
  uses: pnpm/action-setup@v4
  with:
    version: 9

- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: 'pnpm'

- name: Install dependencies
  run: pnpm install --frozen-lockfile
```

**설계 의도:**
- `pnpm/action-setup`을 `actions/setup-node`보다 **먼저** 실행해야 setup-node가 pnpm store를 자동 캐싱한다.
- `--frozen-lockfile`은 CI에서 lockfile 변경을 방지한다. lockfile과 `package.json`이 불일치하면 즉시 실패.
- `cache: 'pnpm'`은 `~/.local/share/pnpm/store`를 캐싱하여 재설치 시간을 단축한다.

### 2.2 Concurrency Group

PR에서 코드를 push할 때마다 이전 실행을 자동 취소한다:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true
```

- `github.head_ref`는 PR 브랜치명, `github.ref`는 push 브랜치 ref.
- 같은 PR에서 연속 push 시 이전 실행이 취소되어 비용과 시간을 절약.

### 2.3 package.json 변경 — CI 전용 스크립트 추가

**`lint:check`** — `--fix` 없는 lint 검사:

기존 `lint` 스크립트에는 `--fix` 플래그가 포함되어 있다. CI에서 `--fix`를 사용하면 코드가 자동 수정된 후 검사를 통과해버리므로, `--fix` 없는 별도 스크립트를 추가한다:

```json
"lint:check": "eslint \"{src,apps,libs,test}/**/*.ts\""
```

**`test:migration`** — Migration chain 검증 전용:

globalSetup(migration 실행)만 수행하고 테스트는 건너뛰는 스크립트. pnpm `--` 인자 전달 문제와 Jest 30의 `--testPathPattern` → `--testPathPatterns` 변경에 대응하기 위해 전용 스크립트로 분리했다:

```json
"test:migration": "node -r tsconfig-paths/register node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --passWithNoTests --testPathPatterns=^$"
```

> **변경 파일**: `package.json` — scripts 섹션에 `lint:check`, `test:migration` 추가

---

## 3. 파일 구조

구현 후 생성되는 파일 트리:

```
.github/
├── dependabot.yml              # Dependabot 의존성 자동 업데이트 설정
├── labeler.yml                 # PR 자동 라벨링 규칙
└── workflows/
    ├── ci.yml                  # CI 파이프라인 (lint, build, test)
    ├── coverage.yml            # 커버리지 리포트
    ├── dependency-audit.yml    # 의존성 보안 감사
    ├── migration-safety.yml    # Migration chain 무결성 검증
    ├── pr-auto-label.yml       # PR 자동 라벨링
    └── typescript-strict.yml   # TypeScript 타입 검사
```

---

## Part II: 워크플로우 구현

---

## 4. CI — Lint, Build, Test

> **파일**: `.github/workflows/ci.yml`

### 4.1 설계 의도

가장 핵심적인 워크플로우. `main`과 `dev` 브랜치에 대한 push와 PR에서 코드 품질을 자동 검증한다.

**3개 병렬 job 구조**를 채택한 이유:

```
┌─────────────────┐
│  lint-and-build  │  checkout → pnpm lint:check → pnpm build:local
├─────────────────┤
│   unit-test      │  checkout → pnpm test
├─────────────────┤
│ integration-test │  checkout → pnpm test:e2e (Docker + Testcontainers)
└─────────────────┘
        ↑ 3개 job이 동시에 시작
```

- **병렬 실행**: 각 job은 의존 관계가 없으므로 동시에 시작한다. 전체 소요 시간은 가장 느린 job(통합 테스트, ~30초+)에 수렴.
- **`needs:` 미사용**: lint 실패가 테스트 실행을 차단하지 않는다. 개발자가 모든 실패를 한 번에 확인할 수 있다.
- **job 분리의 이점**: 실패 원인을 즉시 파악 가능. "lint-and-build만 실패" vs "integration-test만 실패"가 명확히 구분.

### 4.2 전체 코드

```yaml
name: CI

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true

jobs:
  lint-and-build:
    name: Lint & Build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint:check

      - name: Build
        run: pnpm build:local

  unit-test:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run unit tests
        run: pnpm test

  integration-test:
    name: Integration Tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run integration tests
        run: pnpm test:e2e
```

### 4.3 통합 테스트와 Docker

통합 테스트의 동작 흐름:

```
pnpm test:e2e
  → Jest 실행 (jest-e2e.json 설정)
    → globalSetup (test/setup/global-setup.ts)
      → PostgreSqlContainer('postgres:17-alpine').start()
      → DataSource.runMigrations()
      → .test-env.json 작성
    → 테스트 파일 실행 (maxWorkers: 1)
      → createIntegrationApp() → .test-env.json 읽기 → NestJS 앱 생성
      → useTransactionRollback() → per-test 트랜잭션 격리
    → globalTeardown (test/setup/global-teardown.ts)
      → 컨테이너 정지 + .test-env.json 삭제
```

GitHub Actions Ubuntu runner에 Docker가 내장되어 있으므로, Testcontainers가 별도 설정 없이 Docker 소켓에 접근하여 PostgreSQL 컨테이너를 기동한다.

### 4.4 `.env` 파일 불필요

- **빌드**: `cross-env NODE_ENV=local nest build`는 환경변수를 설정하지만, TypeScript 컴파일 자체는 `.env.local`을 읽지 않는다.
- **단위 테스트**: DB 연결 불필요.
- **통합 테스트**: `globalSetup`이 Testcontainers에서 생성된 접속 정보를 `.test-env.json`에 기록하므로 `.env` 파일이 필요 없다.

---

## 5. Coverage Report

> **파일**: `.github/workflows/coverage.yml`

### 5.1 설계 의도

PR마다 커버리지 변화를 가시화한다. PR 코멘트에 커버리지 요약 테이블이 자동으로 표시되어, 리뷰어가 코드 커버리지를 한눈에 파악할 수 있다.

```
PR 코멘트 예시:
┌──────────────┬───────┬──────────┬────────┬────────────┐
│ Category     │ Lines │ Branches │ Funcs  │ Statements │
├──────────────┼───────┼──────────┼────────┼────────────┤
│ Overall      │ 85%   │ 72%      │ 90%    │ 85%        │
└──────────────┴───────┴──────────┴────────┴────────────┘
```

### 5.2 전체 코드

```yaml
name: Coverage Report

on:
  pull_request:
    branches: [main, dev]

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true

permissions:
  pull-requests: write

jobs:
  coverage:
    name: Coverage
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests with coverage
        run: pnpm test -- --coverage --coverageReporters=json-summary --coverageReporters=json --coverageReporters=text

      - name: Coverage Summary
        uses: davelosert/vitest-coverage-report-action@v2
        with:
          json-summary-path: ./coverage/coverage-summary.json
          json-final-path: ./coverage/coverage-final.json
          file-coverage-mode: changes
          name: Unit Test Coverage
```

### 5.3 주요 설정 해설

**`--coverageReporters` 오버라이드**

기본 Jest 설정은 `json`, `lcov`, `clover`, `text` 리포터를 생성한다. 여기서는 `json-summary`(전체 요약), `json`(파일별 상세 커버리지), `text`(CI 로그 가독성) 3개를 지정한다.

**`json-final-path` + `file-coverage-mode: changes`**

`json` 리포터가 생성하는 `coverage-final.json`을 `json-final-path`로 지정하면, PR에서 변경된 파일별 커버리지 상세(Lines, Branches, Functions, Statements, Uncovered Lines)를 표시한다. `file-coverage-mode: changes`는 변경된 파일만 표시하여 리포트를 간결하게 유지한다.

**글로벌 threshold 미설정**

이 프로젝트는 Classical School 테스팅 전략을 따르므로, pass-through 레이어(Controller, Repository, Module 등)는 단위 테스트 대상이 아니다. 글로벌 threshold를 설정하면 이런 파일 때문에 오탐이 발생하므로, threshold 없이 변경 파일별 가시성만 제공한다. Handler/DTO 변경 시 Lines 80%+, Branches 70%+를 리뷰 기준으로 권장한다.

**`davelosert/vitest-coverage-report-action@v2`**

이름에 "vitest"가 포함되어 있지만, Jest의 `coverage-summary.json` 형식도 지원한다. 동일 PR에서 재실행 시 기존 코멘트를 업데이트하여 중복 코멘트를 방지한다.

**`permissions: pull-requests: write`**

PR에 코멘트를 작성하기 위해 필요한 최소 권한. 기본 `GITHUB_TOKEN` 권한만으로는 불충분하므로 명시적으로 선언한다.

### 5.4 대안: `MishaKav/jest-coverage-comment`

Jest 30과의 호환성 문제가 발생할 경우 대체 가능:

```yaml
- name: Coverage Summary
  uses: MishaKav/jest-coverage-comment@main
  with:
    coverage-summary-path: ./coverage/coverage-summary.json
```

---

## 6. Dependency Audit + Dependabot

### 6.1 Audit 워크플로우

> **파일**: `.github/workflows/dependency-audit.yml`

#### 설계 의도

알려진 보안 취약점이 있는 의존성을 자동 감지한다. `main`/`dev` 브랜치에 대한 PR/push마다 실행하고, 주간 스케줄로도 실행하여 새로 공개된 취약점을 조기에 발견한다.

#### 전체 코드

```yaml
name: Dependency Audit

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]
  schedule:
    - cron: '0 0 * * 1'  # 매주 월요일 00:00 UTC (KST 09:00)

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true

jobs:
  audit:
    name: Security Audit
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run security audit
        continue-on-error: true
        run: pnpm audit --prod
```

#### 주요 설정 해설

- **`--prod`**: 프로덕션 의존성만 검사. `jest`, `eslint` 등 devDependencies의 취약점은 런타임에 영향을 주지 않으므로 노이즈를 줄인다.
- **`continue-on-error: true`**: 간접 의존성(예: `express` → `qs`, `typeorm` → `minimatch`)의 취약점은 직접 패치가 불가능하다. 이러한 false positive로 워크플로우가 실패하는 것을 방지하고, 취약점 정보는 Actions UI에서 경고로 확인한다. 상위 패키지가 업데이트하면 Dependabot이 자동으로 PR을 생성한다.
- **스케줄 (`cron`)**: 주말 동안 새로 공개된 CVE를 월요일 오전에 발견.

### 6.2 Dependabot 설정

> **파일**: `.github/dependabot.yml`

#### 설계 의도

의존성 업데이트를 자동으로 PR로 제안한다. 관련 패키지를 그룹핑하여 PR 수를 줄이고, 함께 업데이트해야 하는 패키지가 한 PR에 묶이도록 한다.

#### 전체 코드

```yaml
version: 2
updates:
  # npm 의존성 (pnpm 호환)
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      timezone: "Asia/Seoul"
    open-pull-requests-limit: 10
    labels:
      - "dependencies"
    groups:
      nestjs:
        patterns:
          - "@nestjs/*"
      typeorm:
        patterns:
          - "typeorm"
          - "@nestjs/typeorm"
      testing:
        patterns:
          - "jest"
          - "ts-jest"
          - "@types/jest"
          - "supertest"
          - "@types/supertest"
          - "testcontainers"
          - "@testcontainers/*"
      eslint:
        patterns:
          - "eslint"
          - "eslint-*"
          - "@eslint/*"
          - "typescript-eslint"
          - "prettier"
          - "globals"

  # GitHub Actions 버전 업데이트
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      timezone: "Asia/Seoul"
    labels:
      - "dependencies"
      - "github-actions"
```

#### 그룹핑 전략

| 그룹 | 포함 패키지 | 그룹핑 이유 |
|------|------------|------------|
| `nestjs` | `@nestjs/*` | NestJS 패키지는 버전 호환성이 중요하므로 함께 업데이트 |
| `typeorm` | `typeorm`, `@nestjs/typeorm` | ORM과 NestJS 어댑터는 함께 업데이트해야 호환 |
| `testing` | `jest`, `ts-jest`, `supertest`, `testcontainers` 등 | 테스트 도구는 함께 업데이트하여 호환성 유지 |
| `eslint` | `eslint`, `eslint-*`, `typescript-eslint`, `prettier` | 린트 도구 체인은 버전 의존성이 강함 |

- **`github-actions` ecosystem**: 워크플로우에서 사용하는 Actions의 버전도 자동 업데이트.
- **`open-pull-requests-limit: 10`**: Dependabot PR이 과도하게 쌓이는 것을 방지.

---

## 7. Migration Safety Check

> **파일**: `.github/workflows/migration-safety.yml`

### 7.1 설계 의도

migration 파일이나 entity 파일이 변경된 PR에서만 실행되어, 전체 migration chain이 깨지지 않았는지 검증한다.

**검증 시나리오:**
- 새 migration 파일의 SQL 문법 오류
- migration 순서 누락 (파일 삭제/이동 실수)
- entity 변경에 대응하는 migration 누락 (경고 수준)
- migration이 clean DB에서 처음부터 끝까지 성공하는지

### 7.2 핵심 전략: globalSetup 재활용

프로젝트의 `test/setup/global-setup.ts`가 이미 다음을 수행한다:

```typescript
// test/setup/global-setup.ts
const container = await new PostgreSqlContainer('postgres:17-alpine').start();
// ... 접속 정보 기록
await dataSource.runMigrations();  // 모든 migration을 순차 실행
```

이를 재활용하여 migration 검증을 수행하는 전용 스크립트 `test:migration`을 사용한다:

```bash
pnpm test:migration
```

내부적으로 다음과 동일하다:

```bash
node -r tsconfig-paths/register node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --passWithNoTests --testPathPatterns=^$
```

| 플래그 | 역할 |
|--------|------|
| `--testPathPatterns=^$` | 빈 문자열의 시작과 끝만 매칭 → 실제 테스트 파일 0개 매칭 |
| `--passWithNoTests` | 테스트가 0개여도 성공으로 처리 (Jest 기본값은 0개일 때 실패) |

> **주의**: Jest 30에서 `--testPathPattern`이 `--testPathPatterns`로 변경되었다. 또한 `pnpm test:e2e -- --passWithNoTests`처럼 pnpm `--`로 인자를 전달하면 Jest가 올바르게 파싱하지 못하는 문제가 있어 전용 스크립트로 분리했다.

**실행 흐름:**

```
Jest 시작
  → globalSetup 실행
    → PostgreSQL 컨테이너 기동
    → runMigrations() — 여기서 실패하면 전체 워크플로우 실패
  → 테스트 파일 매칭: 0개 → passWithNoTests로 통과
  → globalTeardown 실행
    → 컨테이너 정지
```

### 7.3 전체 코드

```yaml
name: Migration Safety Check

on:
  pull_request:
    branches: [main, dev]
    paths:
      - 'src/migrations/**'
      - 'src/**/entities/**'
      - 'src/database/**'

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true

jobs:
  migration-check:
    name: Migration Chain Integrity
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Verify migration chain on fresh database
        run: pnpm test:migration
```

### 7.4 `paths` 필터 해설

| 경로 패턴 | 감지 대상 |
|-----------|----------|
| `src/migrations/**` | 새 migration 파일 추가, 기존 migration 수정 |
| `src/**/entities/**` | entity 필드 변경 (migration 필요성 알림) |
| `src/database/**` | DB 설정 변경 (`typeorm.config.ts`) |

migration이나 entity 변경이 없는 PR에서는 이 워크플로우가 아예 실행되지 않아 불필요한 Docker 기동을 방지한다.

---

## 8. PR Auto-label

### 8.1 라벨링 워크플로우

> **파일**: `.github/workflows/pr-auto-label.yml`

#### 설계 의도

변경된 파일 경로를 기반으로 PR에 라벨을 자동 부여한다. 리뷰어가 PR의 영향 범위를 제목을 읽기 전에 라벨만으로 파악할 수 있다.

#### 전체 코드

```yaml
name: PR Auto-label

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  label:
    name: Auto-label
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Label PR
        uses: actions/labeler@v5
        with:
          sync-labels: true
```

**`sync-labels: true`**: PR에서 파일 변경을 되돌리면 해당 라벨도 자동 제거된다. 라벨이 항상 현재 변경사항을 정확히 반영.

### 8.2 라벨링 규칙

> **파일**: `.github/labeler.yml`

```yaml
database:
  - changed-files:
      - any-glob-to-any-file:
          - 'src/migrations/**'
          - 'src/database/**'

cqrs-command:
  - changed-files:
      - any-glob-to-any-file:
          - 'src/*/command/**'

cqrs-query:
  - changed-files:
      - any-glob-to-any-file:
          - 'src/*/query/**'

dto:
  - changed-files:
      - any-glob-to-any-file:
          - 'src/*/dto/**'

entity:
  - changed-files:
      - any-glob-to-any-file:
          - 'src/*/entities/**'

test:
  - changed-files:
      - any-glob-to-any-file:
          - 'test/**'
          - 'src/**/*.spec.ts'

documentation:
  - changed-files:
      - any-glob-to-any-file:
          - '*.md'
          - 'docs/**'

ci:
  - changed-files:
      - any-glob-to-any-file:
          - '.github/**'
```

### 8.3 라벨 매핑 시각화

프로젝트의 CQRS 구조와 라벨의 대응 관계:

```
src/
├── posts/
│   ├── command/        → cqrs-command
│   ├── query/          → cqrs-query
│   ├── dto/            → dto
│   ├── entities/       → entity
│   └── ...
├── migrations/         → database
├── database/           → database
└── **/*.spec.ts        → test
test/                   → test
docs/                   → documentation
.github/                → ci
```

> **참고**: `actions/labeler@v5`는 존재하지 않는 라벨을 자동으로 생성한다. 기본 회색 색상이 적용되므로, 라벨 색상을 커스터마이징하려면 GitHub 저장소 Settings > Labels에서 사전에 생성하는 것을 권장한다.

---

## 9. TypeScript Strict Check

> **파일**: `.github/workflows/typescript-strict.yml`

### 9.1 설계 의도

2단계 타입 검사를 통해 현재 설정의 엄격한 준수와 strict 모드 전환 가능성을 동시에 파악한다.

**현재 tsconfig.json의 strict 관련 설정:**

```json
{
  "compilerOptions": {
    "strictNullChecks": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitAny": false,          // strict에서는 true
    "strictBindCallApply": false,     // strict에서는 true
    "noFallthroughCasesInSwitch": false
  }
}
```

| 단계 | 명령 | 실패 시 동작 | 목적 |
|------|------|-------------|------|
| 1단계 | `tsc --noEmit` | 워크플로우 실패 (gate) | 현재 설정 기준 타입 에러 차단 |
| 2단계 | `tsc --noEmit --strict` | 경고만 표시 (advisory) | strict 전환 시 에러 수 파악 |

### 9.2 전체 코드

```yaml
name: TypeScript Strict Check

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]

concurrency:
  group: ${{ github.workflow }}-${{ github.head_ref || github.ref }}
  cancel-in-progress: true

jobs:
  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type check (current config)
        run: npx tsc --noEmit

      - name: Strict type check (advisory)
        continue-on-error: true
        run: npx tsc --noEmit --strict
```

### 9.3 `tsc --noEmit` vs `nest build`

| 비교 | `tsc --noEmit` | `nest build` (= `pnpm build:local`) |
|------|----------------|--------------------------------------|
| 대상 파일 | `tsconfig.json` 기준 (src + test 포함) | `tsconfig.build.json` 기준 (test 제외) |
| 출력 | 없음 (타입 검사만) | `dist/` 디렉토리에 JS 파일 생성 |
| 속도 | 더 빠름 | 더 느림 (컴파일 + tsc-alias) |
| CI 용도 | 전체 코드 타입 안전성 검증 | 배포 가능한 빌드 산출물 생성 |

CI 워크플로우(4번)에서 `pnpm build:local`이 이미 빌드 검증을 하므로, 이 워크플로우는 **test 파일을 포함한 전체 타입 검사**와 **strict 모드 advisory**에 집중한다.

### 9.4 `--strict` 플래그가 활성화하는 옵션

`--strict`는 다음 옵션을 모두 `true`로 설정한다:

| 옵션 | 현재 값 | strict 시 |
|------|---------|-----------|
| `strictNullChecks` | `true` | `true` |
| `strictBindCallApply` | `false` | `true` |
| `strictFunctionTypes` | (기본값) | `true` |
| `strictPropertyInitialization` | (기본값) | `true` |
| `noImplicitAny` | `false` | `true` |
| `noImplicitThis` | (기본값) | `true` |
| `alwaysStrict` | (기본값) | `true` |
| `useUnknownInCatchVariables` | (기본값) | `true` |

`continue-on-error: true`이므로 strict 에러가 있어도 워크플로우는 통과한다. Actions UI에서 해당 step이 주황색 경고로 표시되어 strict 전환 진행 상황을 추적할 수 있다.

---

## Part III: 운영

---

## 10. 검증 및 트러블슈팅

### 10.1 구현 후 검증 절차

```bash
# 1. 로컬 빌드/테스트로 기존 코드 정상 확인
pnpm build:local
pnpm test
pnpm test:e2e

# 2. feature branch에서 main으로 PR 생성
git checkout -b feature/github-actions
git add .github/ package.json
git commit -m "ci: GitHub Actions 워크플로우 6종 추가"
git push -u origin feature/github-actions
gh pr create --base main
```

PR 생성 후 GitHub Actions 탭에서 확인:

| 워크플로우 | 트리거 여부 | 확인 포인트 |
|-----------|-----------|------------|
| CI | O | 3개 job 병렬 실행, 모두 통과 |
| Coverage Report | O | PR 코멘트에 커버리지 테이블 |
| Dependency Audit | O | `pnpm audit` 통과 |
| Migration Safety | `.github/**`만 변경 시 X | paths 필터로 스킵됨 |
| PR Auto-label | O | `ci` 라벨 자동 부여 |
| TypeScript Strict | O | 1단계 통과, 2단계 결과 확인 |

### 10.2 자주 발생하는 문제

**pnpm install 실패: `ERR_PNPM_FROZEN_LOCKFILE`**

```
ERR_PNPM_FROZEN_LOCKFILE  Cannot install with "frozen-lockfile"
because pnpm-lock.yaml is not up-to-date with package.json
```

원인: 로컬에서 `pnpm install`을 실행하지 않고 `package.json`만 수정.
해결: 로컬에서 `pnpm install` 실행 후 `pnpm-lock.yaml`을 커밋.

**통합 테스트 타임아웃**

```
Timeout - Async callback was not invoked within the 30000 ms timeout
```

원인: Testcontainers가 Docker 이미지를 처음 pull할 때 시간이 오래 걸림.
해결: `jest-e2e.json`의 `testTimeout`을 60000으로 상향. 또는 Docker 이미지 캐싱 step 추가:

```yaml
- name: Pull PostgreSQL image
  run: docker pull postgres:17-alpine
```

**Coverage 액션이 PR 코멘트를 작성하지 못함**

원인: `permissions: pull-requests: write` 누락, 또는 fork된 PR에서는 기본적으로 쓰기 권한이 없음.
해결: `permissions` 블록 확인. fork PR은 `pull_request_target` 트리거 사용 검토 (보안 주의 필요).

**Strict check에서 대량 에러 발생**

이것은 정상이다. `continue-on-error: true`로 설정되어 있어 워크플로우는 통과한다. strict 전환은 점진적으로 진행하면 된다.

---

## 11. 향후 확장 포인트

### 11.1 커버리지 임계값 (Threshold)

`package.json`의 Jest 설정에 추가:

```json
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    }
  }
}
```

임계값 미달 시 `pnpm test:cov`가 non-zero exit → Coverage 워크플로우 실패.

### 11.2 Branch Protection Rules

GitHub 저장소 Settings > Branches > Branch protection rules에서 `main`과 `dev` 브랜치에 각각 설정:

- **Require status checks to pass**: `CI / Lint & Build`, `CI / Unit Tests`, `CI / Integration Tests` 선택
- **Require branches to be up to date**: merge 전 최신 base 브랜치와 동기화 강제
- **Require pull request reviews**: 리뷰어 승인 필수

### 11.3 `lint:check` 대신 lint CI 전용 스크립트

`--max-warnings 0` 플래그를 추가하여 경고도 CI에서 차단:

```json
"lint:check": "eslint \"{src,apps,libs,test}/**/*.ts\" --max-warnings 0"
```

### 11.4 Docker 이미지 캐싱

통합 테스트 속도를 개선하려면 Docker 레이어 캐싱을 추가:

```yaml
- name: Cache Docker images
  uses: ScribeMD/docker-cache@0.5.0
  with:
    key: docker-${{ runner.os }}-postgres-17-alpine
```

### 11.5 AWS 배포 워크플로우 (미래)

현재는 대상이 아니지만, 추후 추가할 경우 CI 통과를 전제 조건으로 설정:

```yaml
deploy-prod:
  needs: [lint-and-build, unit-test, integration-test]
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'

deploy-dev:
  needs: [lint-and-build, unit-test, integration-test]
  if: github.ref == 'refs/heads/dev' && github.event_name == 'push'
```
