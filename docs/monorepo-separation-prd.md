# 서비스/관리자 서버 분리 PRD: NestJS 모노레포 도입

## 0. 용어 해설

이 문서에서 사용하는 주요 용어를 정리한다. NestJS 모노레포를 처음 접하는 개발자를 위한 참고 자료이다.

### 0.1 모노레포 기본 개념

| 용어 | 설명 |
|------|------|
| **모노레포 (Monorepo)** | 하나의 Git 저장소에 여러 프로젝트(앱, 라이브러리)를 함께 관리하는 방식. 코드를 공유하면서도 각 프로젝트를 독립적으로 빌드/배포할 수 있다. 반대 개념은 "멀티레포"로, 프로젝트마다 별도의 Git 저장소를 사용한다. |
| **워크스페이스 (Workspace)** | 모노레포 내에서 관리되는 개별 프로젝트 단위. NestJS에서는 `apps/` 하위의 애플리케이션과 `libs/` 하위의 라이브러리가 각각 하나의 워크스페이스가 된다. |
| **Application** | 독립적으로 실행 가능한 NestJS 서버. `main.ts` 엔트리 포인트를 가지며, 고유한 포트에서 HTTP 요청을 수신한다. 이 프로젝트에서는 `service`(사용자 서버)와 `admin`(관리자 서버)이 각각 하나의 Application이다. |
| **Library** | 앱 간에 공유되는 코드 모음. 독립 실행 불가능하며, Application에서 import하여 사용한다. 엔티티, 유틸리티, 공통 모듈 등이 포함된다. NestJS에서는 `libs/` 디렉토리에 위치하고, `@app/library-name` 경로로 import한다. |

### 0.2 NestJS CLI 모노레포 관련 개념

| 용어 | 설명 |
|------|------|
| **Standard Mode** | NestJS CLI의 기본 모드. 하나의 `src/` 디렉토리에 하나의 앱이 존재하는 구조. 현재 프로젝트가 이 모드이다. |
| **Monorepo Mode** | `nest-cli.json`에 `"monorepo": true`를 설정하면 활성화되는 모드. 여러 `apps/`와 `libs/`를 관리할 수 있다. `nest generate app <name>` 명령으로 Standard Mode에서 자동 전환된다. |
| **nest-cli.json** | NestJS CLI의 설정 파일. Monorepo Mode에서는 `projects` 객체에 각 앱과 라이브러리의 메타데이터(루트 경로, 엔트리 파일, tsconfig 경로 등)를 정의한다. |
| **`@app/shared`** | 공유 라이브러리의 경로 별칭(Path Alias). `tsconfig.json`의 `paths`에 등록되어, `import { User } from '@app/shared'`처럼 사용할 수 있다. `nest g library shared` 실행 시 자동 등록된다. |
| **Barrel Export** | `libs/shared/src/index.ts` 파일에서 라이브러리의 모든 공개 API를 `export * from './entities/user.entity'` 형태로 모아서 내보내는 패턴. 사용자는 `@app/shared`만 import하면 된다. |

### 0.3 빌드/배포 관련 개념

| 용어 | 설명 |
|------|------|
| **`nest build <app>`** | 특정 앱만 빌드하는 CLI 명령. `nest build service`는 service 앱과 그 앱이 의존하는 라이브러리(shared)만 컴파일한다. admin 앱은 빌드하지 않는다. |
| **`dist/apps/<app>/`** | 빌드 결과물이 저장되는 디렉토리. `nest build service` → `dist/apps/service/`, `nest build back-office` → `dist/apps/back-office/`. |
| **엔트리 포인트 (Entry Point)** | 앱이 실행될 때 가장 먼저 호출되는 파일. `apps/service/src/main.ts`가 service 앱의 엔트리 포인트이다. |
| **독립 스케일링** | 서비스 서버와 관리자 서버를 별도의 인스턴스로 배포하여, 트래픽에 따라 각각 독립적으로 인스턴스 수를 조절하는 것. 사용자 트래픽이 많으면 service만 증설하고, admin은 최소 인스턴스로 유지할 수 있다. |

---

## 1. 배경 및 목적

### 1.1 현재 구조

현재 프로젝트는 **Standard Mode** 단일 NestJS 앱으로 운영되며, `src/` 디렉토리 아래에 사용자 인증(Auth), 게시물(Posts), 관리자(Admin) 모듈이 모두 존재한다. 하나의 `main.ts`에서 하나의 서버(포트 3000)로 모든 엔드포인트를 서빙한다.

```
src/
├── app.module.ts       # 모든 모듈을 import하는 단일 루트 모듈
├── main.ts             # 단일 엔트리 포인트
├── auth/               # 사용자 인증
├── posts/              # 게시물 CRUD
├── admin/              # 관리자 인증 + 관리
├── common/             # 공유 유틸리티
└── ...
```

### 1.2 분리가 필요한 이유

| 이유 | 설명 |
|------|------|
| **레포지토리 구조 차이** | 관리자가 사용자/게시물을 조회할 때는 서비스와 다른 레포지토리를 사용한다. 소유권 필터 없이 전체 조회, soft-deleted 포함, 작성자 relation 로딩 등 쿼리 패턴이 다르다. |
| **관리자 전용 테이블** | 관리자 전용 기능이 추가될수록 관리자만 사용하는 테이블이 늘어난다. 단일 서버에서는 이 테이블들이 서비스 코드에 불필요하게 로드된다. |
| **독립 배포/스케일링** | 사용자 트래픽과 관리자 트래픽은 규모와 패턴이 다르다. 분리하면 각각 독립적으로 배포하고 스케일링할 수 있다. |
| **보안 경계** | 관리자 서버를 내부 네트워크에만 노출하고, 서비스 서버만 외부에 공개하는 식의 네트워크 분리가 가능하다. |
| **장애 격리** | 관리자 서버에 문제가 생겨도 사용자 서비스에 영향이 없다. |

### 1.3 목표

- 서비스(사용자)와 관리자를 **별도 프로세스**로 분리 (각각 다른 포트)
- 엔티티, 마이그레이션, 공통 유틸리티는 **단일 소스**로 관리
- **기존 코드의 동작을 변경하지 않음** (리팩토링만, 기능 변경 없음)
- 점진적 마이그레이션으로 **각 단계마다 빌드/테스트 가능** 상태 유지

---

## 2. 기술 선택: NestJS Monorepo Mode

### 2.1 선택지 비교

| 옵션 | 장점 | 단점 | 적합도 |
|------|------|------|--------|
| **A. NestJS Monorepo Mode** | NestJS CLI 기반으로 최소 설정. 단일 `node_modules`. `nest build/start` 명령 사용. | 앱 간 독립 버전 관리 불가 | **채택** |
| B. pnpm Workspaces | 더 유연한 패키지 관리. 독립 `package.json` | NestJS CLI 통합이 약함. 설정 복잡 | 과잉 |
| C. Turborepo + pnpm | 빌드 캐싱, 병렬 실행 | 2개 앱 + 1개 라이브러리에는 과잉 | 과잉 |
| D. Nx | 가장 강력한 모노레포 도구 | 학습 비용 높음. 소규모 프로젝트에 과잉 | 과잉 |

### 2.2 NestJS Monorepo Mode 선택 근거

1. **최소 마이그레이션 비용**: 이미 `nest-cli.json`, `@nestjs/cli`, `@nestjs/schematics`가 설치되어 있다. `nest generate app admin` 한 줄로 모노레포 전환이 가능하다.
2. **단일 의존성 트리**: 하나의 `node_modules`를 공유하므로 NestJS 코어 모듈 버전 불일치가 발생하지 않는다.
3. **기존 워크플로우 유지**: `nest build`, `nest start` 명령 체계가 그대로 유지되어 학습 비용이 없다.
4. **확장 가능**: 추후 앱이 3개 이상으로 늘어나면 pnpm Workspaces나 Nx로 마이그레이션할 수 있다. 현재 구조가 그 전환을 방해하지 않는다.

### 2.3 공식 문서 참고

- [NestJS CLI Monorepo Mode](https://docs.nestjs.com/cli/monorepo)
- [NestJS CLI Libraries](https://docs.nestjs.com/cli/libraries)
- [NestJS CLI Workspaces](https://docs.nestjs.com/cli/workspaces)

`nest generate app <name>` 실행 시:
1. 기존 `src/`가 `apps/<기존-프로젝트>/src/`로 자동 이동
2. `nest-cli.json`이 모노레포 모드로 자동 업데이트 (`"monorepo": true`)
3. 새 앱이 `apps/<name>/`에 생성

`nest generate library <name>` 실행 시:
1. `libs/<name>/` 디렉토리 생성
2. `tsconfig.json`에 `@app/<name>` 경로 별칭 자동 등록
3. `nest-cli.json`에 라이브러리 프로젝트 메타데이터 추가

---

## 3. 대상 아키텍처

### 3.1 디렉토리 구조

```
project-root/
├── nest-cli.json                    # monorepo 설정 (projects 정의)
├── tsconfig.json                    # 루트 tsconfig (공통 베이스)
├── package.json                     # 단일 package.json, 단일 node_modules
├── pnpm-lock.yaml
├── docker-compose.yml
├── .env.local / .env.example        # 공유 환경변수 (DB, Redis, JWT 등)
│
├── apps/
│   ├── service/                     # 사용자 서버 (PORT=3000)
│   │   ├── src/
│   │   │   ├── main.ts             # 서비스 엔트리 포인트
│   │   │   ├── app.module.ts       # AuthModule + PostsModule + 공유 인프라
│   │   │   ├── auth/               # 사용자 인증 (JWT 전략, 핸들러, DTO)
│   │   │   └── posts/              # 게시물 CRUD (핸들러, DTO, 이벤트)
│   │   └── tsconfig.app.json       # 서비스 앱 전용 tsconfig
│   │
│   └── admin/                       # 관리자 서버 (ADMIN_PORT=3001)
│       ├── src/
│       │   ├── main.ts             # 관리자 엔트리 포인트
│       │   ├── app.module.ts       # 공유 인프라 + 도메인 모듈 import
│       │   ├── auth/               # 관리자 인증 (controller, command, query, dto)
│       │   ├── guard/              # AdminJwtAuthGuard
│       │   ├── strategy/           # AdminJwtStrategy
│       │   ├── decorator/          # CurrentAdmin, AuthAdmin 타입
│       │   ├── interface/          # IAdminReadRepository, IAdminWriteRepository
│       │   ├── admin.repository.ts
│       │   ├── admin-repository.provider.ts
│       │   └── admin.module.ts
│       └── tsconfig.app.json       # 관리자 앱 전용 tsconfig
│
├── libs/
│   └── shared/                      # 공유 라이브러리 (@app/shared)
│       ├── src/
│       │   ├── index.ts            # Barrel export (모든 공개 API)
│       │   ├── database/
│       │   │   └── typeorm.config.ts  # DB 연결 설정 + 엔티티 등록
│       │   ├── data-source.ts      # TypeORM CLI용 DataSource (마이그레이션)
│       │   ├── entities/           # 모든 엔티티 (단일 소스)
│       │   │   ├── base.entity.ts  # BaseTimeEntity
│       │   │   ├── user.entity.ts  # User
│       │   │   ├── post.entity.ts  # Post
│       │   │   └── admin.entity.ts # Admin
│       │   ├── enum/
│       │   │   └── admin-role.enum.ts
│       │   ├── migrations/         # 모든 마이그레이션 (단일 관리)
│       │   ├── common/             # BaseRepository, DTO, Query, Decorator
│       │   ├── cache/              # CacheModule, CacheService
│       │   ├── logging/            # LoggingModule, Interceptor, Filter
│       │   ├── idempotency/        # IdempotencyModule
│       │   ├── slack/              # SlackModule
│       │   ├── health/             # HealthModule
│       │   ├── instrumentation.ts  # OpenTelemetry
│       │   └── auth.types.ts       # AuthTokens 인터페이스
│       └── tsconfig.lib.json       # 라이브러리 전용 tsconfig
│
├── test/
│   ├── setup/                       # 공유 테스트 인프라
│   │   ├── global-setup.ts         # Testcontainers 기동
│   │   ├── global-teardown.ts      # 컨테이너 종료
│   │   └── integration-helper.ts   # createIntegrationApp (AppModule 주입)
│   ├── service/                     # 서비스 통합 테스트
│   │   ├── jest-e2e.json
│   │   ├── auth.integration-spec.ts
│   │   └── posts.integration-spec.ts
│   └── admin/                       # 관리자 통합 테스트
│       ├── jest-e2e.json
│       └── admin.integration-spec.ts
│
└── dist/                            # 빌드 결과물
    └── apps/
        ├── service/                 # nest build service 결과
        └── admin/                   # nest build back-office 결과
```

### 3.2 공유 요소 분류

#### libs/shared로 이동하는 파일

| 카테고리 | 현재 위치 | 이동 위치 | 이유 |
|---------|----------|----------|------|
| 엔티티 | `src/auth/entities/user.entity.ts` | `libs/shared/src/entities/` | 동일 DB, 양쪽 서버가 참조 |
| 엔티티 | `src/posts/entities/post.entity.ts` | `libs/shared/src/entities/` | 동일 DB, User와 관계 |
| 엔티티 | `src/admin/entities/admin.entity.ts` | `libs/shared/src/entities/` | 동일 DB |
| 기반 엔티티 | `src/common/entities/base.entity.ts` | `libs/shared/src/entities/` | 모든 엔티티가 상속 |
| Enum | `src/admin/enum/admin-role.enum.ts` | `libs/shared/src/enum/` | Admin 엔티티가 의존 |
| 기반 클래스 | `src/common/base.repository.ts` | `libs/shared/src/common/` | 모든 레포지토리가 상속 |
| DB 설정 | `src/database/typeorm.config.ts` | `libs/shared/src/database/` | 양쪽 서버가 동일 DB 사용 |
| 마이그레이션 | `src/migrations/*.ts` | `libs/shared/src/migrations/` | 단일 DB, 단일 마이그레이션 |
| DataSource | `src/data-source.ts` | `libs/shared/src/` | 마이그레이션 CLI용 |
| 공통 DTO | `src/common/dto/` | `libs/shared/src/common/dto/` | 양쪽 페이지네이션 |
| 공통 Query | `src/common/query/` | `libs/shared/src/common/query/` | 양쪽 CQRS |
| 데코레이터 | `src/common/decorator/` | `libs/shared/src/common/decorator/` | 서비스 인증용 |
| 캐시 | `src/common/cache/` | `libs/shared/src/cache/` | 양쪽 Redis 사용 |
| 로깅 | `src/common/logging/` | `libs/shared/src/logging/` | 글로벌 인프라 |
| 멱등성 | `src/common/idempotency/` | `libs/shared/src/idempotency/` | 글로벌 인프라 |
| Slack | `src/slack/` | `libs/shared/src/slack/` | 양쪽 사용 가능 |
| Health | `src/health/` | `libs/shared/src/health/` | 양쪽 서버에 필요 |
| OTel | `src/instrumentation.ts` | `libs/shared/src/` | 양쪽 서버에 필요 |
| 타입 | `src/auth/auth.types.ts` | `libs/shared/src/` | AuthTokens 양쪽 사용 |

#### 앱에 남는 파일 (도메인 로직)

| 앱 | 포함 내용 |
|----|----------|
| `apps/service/` | Auth 컨트롤러/핸들러/DTO, Posts 컨트롤러/핸들러/DTO, User/Post 레포지토리 인터페이스+구현, JWT 전략/가드, 이벤트 핸들러 |
| `apps/back-office/` | auth/ (인증 컨트롤러/핸들러/DTO), 레포지토리 인터페이스+구현, JWT 전략/가드, 데코레이터, 향후 관리자용 User/Post 조회 레포지토리 |

### 3.3 핵심 설정 변경

#### nest-cli.json

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "monorepo": true,
  "root": "apps/service",
  "compilerOptions": {
    "webpack": false,
    "tsConfigPath": "apps/service/tsconfig.app.json",
    "deleteOutDir": true
  },
  "projects": {
    "service": {
      "type": "application",
      "root": "apps/service",
      "entryFile": "main",
      "sourceRoot": "apps/service/src",
      "compilerOptions": {
        "tsConfigPath": "apps/service/tsconfig.app.json"
      }
    },
    "back-office": {
      "type": "application",
      "root": "apps/back-office",
      "entryFile": "main",
      "sourceRoot": "apps/back-office/src",
      "compilerOptions": {
        "tsConfigPath": "apps/back-office/tsconfig.app.json"
      }
    },
    "shared": {
      "type": "library",
      "root": "libs/shared",
      "entryFile": "index",
      "sourceRoot": "libs/shared/src",
      "compilerOptions": {
        "tsConfigPath": "libs/shared/tsconfig.lib.json"
      }
    }
  }
}
```

#### tsconfig.json — 경로 별칭

```json
{
  "compilerOptions": {
    "paths": {
      "@app/shared": ["libs/shared/src"],
      "@app/shared/*": ["libs/shared/src/*"]
    }
  }
}
```

> 기존 `@src/*` 별칭은 마이그레이션 완료 후 제거한다.

#### TypeORM 엔티티 탐색 — glob에서 명시적 배열로 전환

현재 glob 패턴(`__dirname + '/../**/*.entity{.ts,.js}'`)은 모노레포의 디렉토리 구조 변경 시 깨질 수 있다. 명시적 import로 전환하면 컴파일 타임에 엔티티 누락을 감지할 수 있다.

```typescript
// libs/shared/src/database/typeorm.config.ts
import { User } from '../entities/user.entity';
import { Post } from '../entities/post.entity';
import { Admin } from '../entities/admin.entity';

const entities = [User, Post, Admin];
```

### 3.4 빌드/실행 스크립트

```json
{
  "build:service": "nest build service",
  "build:back-office": "nest build back-office",
  "build:all": "nest build service && nest build back-office",
  "start:service:local": "cross-env NODE_ENV=local nest start service --watch",
  "start:back-office:local": "cross-env NODE_ENV=local nest start back-office --watch",
  "start:service:prod": "cross-env NODE_ENV=production node dist/apps/service/main",
  "start:back-office:prod": "cross-env NODE_ENV=production node dist/apps/back-office/main",
  "test": "jest",
  "test:e2e:service": "jest --config test/service/jest-e2e.json",
  "test:e2e:back-office": "jest --config test/back-office/jest-e2e.json",
  "test:e2e": "pnpm test:e2e:service && pnpm test:e2e:back-office",
  "migration:run:local": "cross-env NODE_ENV=local typeorm migration:run -d libs/shared/src/data-source.ts"
}
```

### 3.5 환경변수

양쪽 서버가 같은 `.env.*` 파일을 공유한다. 포트만 분리한다.

```env
PORT=3000
ADMIN_PORT=3001
```

- `apps/service/src/main.ts` → `app.listen(configService.get('PORT', 3000))`
- `apps/back-office/src/main.ts` → `app.listen(configService.get('ADMIN_PORT', 3001))`

---

## 4. 마이그레이션 전략

점진적으로 진행하며, **각 Phase 완료 시 빌드/테스트가 통과**해야 다음 Phase로 진행한다.

| Phase | 목표 | 주요 작업 |
|-------|------|----------|
| 1 | 모노레포 스캐폴딩 | 디렉토리 구조 생성, nest-cli.json 전환, tsconfig 분리 |
| 2 | 공유 라이브러리 추출 | 엔티티, 마이그레이션, common, 인프라 모듈 → libs/shared/ |
| 3 | 서비스 앱 생성 | auth, posts → apps/service/, import 경로 변경 |
| 4 | 관리자 앱 생성 | admin → apps/back-office/, import 경로 변경, 별도 포트 |
| 5 | 테스트 재구성 | 통합 테스트 분리, Jest 설정 업데이트 |
| 6 | 정리 | 기존 src/ 삭제, @src/* 별칭 제거, CI/CD 업데이트 |

> 각 Phase의 상세 체크리스트는 [monorepo-separation-todo.md](./monorepo-separation-todo.md)를 참조한다.

---

## 5. 테스트 전략

### 5.1 단위 테스트

- 소스 코드 옆에 `.spec.ts` 파일 위치 (기존 패턴 유지)
- `apps/service/src/`, `apps/back-office/src/`, `libs/shared/src/` 각각에 존재
- 루트 `package.json`의 Jest 설정에서 `projects` 배열로 멀티 프로젝트 실행

### 5.2 통합 테스트

- `test/setup/` — 공유 인프라 (Testcontainers, transaction rollback)
- `test/service/` — 서비스 앱 통합 테스트 (auth, posts)
- `test/back-office/` — 관리자 앱 통합 테스트 (admin)
- `integration-helper.ts`의 `createIntegrationApp()`이 AppModule을 파라미터로 받도록 변경

### 5.3 마이그레이션 각 Phase에서의 검증

```bash
nest build service && nest build back-office   # 양쪽 빌드 통과
pnpm test                                 # 단위 테스트 전체 통과
pnpm test:e2e:service                     # 서비스 통합 테스트 통과
pnpm test:e2e:back-office                       # 관리자 통합 테스트 통과
pnpm lint:check                           # 린트 통과
```

---

## 6. 배포 전략

### 6.1 Docker

두 가지 옵션이 있으며, 독립 스케일링이 필요하면 **옵션 1**을 권장한다.

**옵션 1 — 별도 Dockerfile (독립 스케일링)**:
```
docker/
  Dockerfile.service    # dist/apps/service/main.js 실행
  Dockerfile.admin      # dist/apps/back-office/main.js 실행
```

**옵션 2 — 단일 이미지 + 환경변수 선택**:
하나의 Dockerfile로 빌드하고, `APP_NAME` 환경변수로 실행할 앱을 선택.

### 6.2 마이그레이션 실행

- 마이그레이션은 **앱 프로세스와 분리**하여 실행 (별도 Job 또는 Init Container)
- 양쪽 서버가 시작되기 전에 마이그레이션이 완료되어야 함
- `migrationsRun: false`를 양쪽 TypeORM 설정에 유지

### 6.3 네트워크 분리

- `apps/service` — 외부 네트워크에 노출 (사용자 접근)
- `apps/back-office` — 내부 네트워크에만 노출 (VPN/내부망)
- 같은 DB, 같은 Redis에 연결 (같은 VPC 내)

---

## 7. 주의사항

| 항목 | 설명 |
|------|------|
| **엔티티 순환 참조** | User ↔ Post 관계(OneToMany/ManyToOne)가 있으므로 두 엔티티는 반드시 같은 라이브러리에 위치해야 한다. |
| **TypeORM glob 패턴** | 모노레포에서 `__dirname` 기반 glob은 깨질 수 있다. 명시적 엔티티 배열로 전환한다. |
| **`tsc-alias` 제거** | 현재 빌드에서 `tsc-alias -p tsconfig.build.json`을 사용하지만, NestJS 모노레포 모드에서는 CLI가 경로 해석을 처리한다. `tsc-alias` 의존성은 전환 완료 후 제거한다. |
| **ConfigModule envFilePath** | `ConfigModule.forRoot({ envFilePath: '.env.{nodeEnv}' })`는 `process.cwd()` 기준으로 파일을 찾는다. `nest start`는 프로젝트 루트에서 실행되므로 문제없지만, 프로덕션에서 작업 디렉토리가 다르면 절대 경로 사용을 고려한다. |
| **IdempotencyModule @Global()** | 글로벌 모듈은 각 앱의 루트 모듈에서 한 번만 import하면 된다. |
| **향후 확장** | 앱이 3개 이상으로 늘어나거나 독립 버전 관리가 필요하면 pnpm Workspaces로 마이그레이션을 검토한다. |
