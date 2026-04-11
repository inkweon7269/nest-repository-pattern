# 서비스/관리자 서버 분리 체크리스트

> NestJS 모노레포 도입을 통한 서비스/관리자 서버 분리 작업의 단계별 체크리스트.
> 각 Phase는 의존성 순서로 정렬되어 있으며, 순서대로 진행해야 한다.
> Phase 완료 시마다 빌드/테스트 검증을 통과해야 다음 Phase로 진행한다.
>
> 배경과 용어가 낯설다면 [monorepo-separation-prd.md](./monorepo-separation-prd.md)를 먼저 읽어보자.

---

## 용어 빠른 참조

| 용어 | 한줄 요약 |
|------|-----------|
| **Monorepo Mode** | nest-cli.json에 `"monorepo": true` 설정. 여러 apps/와 libs/ 관리 |
| **Application** | 독립 실행 가능한 NestJS 서버. main.ts 엔트리 포인트 보유 |
| **Library** | 앱 간 공유 코드 모음. @app/shared로 import |
| **Barrel Export** | index.ts에서 모든 공개 API를 re-export하는 패턴 |
| **`nest build <app>`** | 특정 앱 + 의존 라이브러리만 빌드 |
| **`@app/shared`** | 공유 라이브러리 경로 별칭. tsconfig.json paths에 등록 |

---

## Phase 1: 모노레포 스캐폴딩

> **이 Phase에서 하는 일:** NestJS CLI를 사용하여 모노레포 구조를 생성한다. 코드 이동 없이 빈 디렉토리와 설정 파일만 준비한다.

- [ ] `nest generate app admin` 실행하여 모노레포 모드 자동 전환
  - 기존 `src/`가 `apps/nest-repository-pattern/src/`로 자동 이동됨
  - `nest-cli.json`이 모노레포 모드로 자동 업데이트됨
  - `apps/admin/src/`에 새 앱 스캐폴드 생성됨
- [ ] 기존 앱 디렉토리를 `apps/service/`로 리네임
  - `apps/nest-repository-pattern/` → `apps/service/`
  - `nest-cli.json`의 프로젝트명도 `service`로 변경
- [ ] `nest generate library shared` 실행하여 공유 라이브러리 생성
  - `libs/shared/` 디렉토리 생성됨
  - `tsconfig.json`에 `@app/shared` 경로 별칭 자동 등록됨
  - `nest-cli.json`에 shared 프로젝트 메타데이터 추가됨
- [ ] 각 앱/라이브러리의 tsconfig 파일 확인 및 조정
  - `apps/service/tsconfig.app.json`
  - `apps/admin/tsconfig.app.json`
  - `libs/shared/tsconfig.lib.json`
- [ ] **검증:** `nest build service` 성공 확인

---

## Phase 2: 공유 라이브러리 추출

> **이 Phase에서 하는 일:** 양쪽 서버가 공유하는 코드(엔티티, 마이그레이션, 공통 유틸리티)를 `libs/shared/`로 이동한다.

### 2.1 엔티티 이동

- [ ] `libs/shared/src/entities/` 디렉토리 생성
- [ ] 엔티티 파일 이동:
  - `apps/service/src/common/entities/base.entity.ts` → `libs/shared/src/entities/base.entity.ts`
  - `apps/service/src/auth/entities/user.entity.ts` → `libs/shared/src/entities/user.entity.ts`
  - `apps/service/src/posts/entities/post.entity.ts` → `libs/shared/src/entities/post.entity.ts`
  - `apps/service/src/admin/entities/admin.entity.ts` → `libs/shared/src/entities/admin.entity.ts`
- [ ] `libs/shared/src/enum/` 디렉토리 생성
  - `apps/service/src/admin/enum/admin-role.enum.ts` → `libs/shared/src/enum/admin-role.enum.ts`
- [ ] 이동한 엔티티 파일 내부의 import 경로 수정 (상대 경로로)

### 2.2 DB 설정 및 마이그레이션 이동

- [ ] `libs/shared/src/database/` 디렉토리 생성
  - `apps/service/src/database/typeorm.config.ts` → `libs/shared/src/database/typeorm.config.ts`
- [ ] TypeORM 엔티티 탐색을 glob에서 명시적 배열로 전환
  ```typescript
  import { User } from '../entities/user.entity';
  import { Post } from '../entities/post.entity';
  import { Admin } from '../entities/admin.entity';
  const entities = [User, Post, Admin];
  ```
- [ ] `apps/service/src/data-source.ts` → `libs/shared/src/data-source.ts`
- [ ] `apps/service/src/migrations/` → `libs/shared/src/migrations/`
- [ ] migration 스크립트 경로 업데이트 (package.json)

### 2.3 공통 유틸리티 이동

- [ ] `apps/service/src/common/base.repository.ts` → `libs/shared/src/common/base.repository.ts`
- [ ] `apps/service/src/common/dto/` → `libs/shared/src/common/dto/`
  - `request/pagination.request.dto.ts`
  - `response/paginated.response.dto.ts` + `.spec.ts`
- [ ] `apps/service/src/common/query/paginated.query.ts` → `libs/shared/src/common/query/`
- [ ] `apps/service/src/common/decorator/` → `libs/shared/src/common/decorator/`
  - `auth-user.type.ts`
  - `current-user.decorator.ts`

### 2.4 인프라 모듈 이동

- [ ] `apps/service/src/common/cache/` → `libs/shared/src/cache/`
- [ ] `apps/service/src/common/logging/` → `libs/shared/src/logging/`
- [ ] `apps/service/src/common/idempotency/` → `libs/shared/src/idempotency/`
- [ ] `apps/service/src/slack/` → `libs/shared/src/slack/`
- [ ] `apps/service/src/health/` → `libs/shared/src/health/`
- [ ] `apps/service/src/instrumentation.ts` → `libs/shared/src/instrumentation.ts`
- [ ] `apps/service/src/auth/auth.types.ts` → `libs/shared/src/auth.types.ts`

### 2.5 Barrel Export 생성

- [ ] `libs/shared/src/index.ts` 생성
  - 모든 엔티티, enum, 타입, 공통 클래스/DTO/데코레이터, 모듈을 re-export
  - DB 설정 함수(`createDataSourceOptions`) export

### 2.6 import 경로 일괄 변경

- [ ] `apps/service/src/` 내 모든 파일에서 이동된 모듈의 import를 `@app/shared`로 변경
  - 예: `@src/common/base.repository` → `@app/shared`
  - 예: `@src/auth/entities/user.entity` → `@app/shared`
  - 예: `@src/common/cache/cache.service` → `@app/shared`
- [ ] `libs/shared/src/` 내부 파일들은 상대 경로 import 사용

### 2.7 검증

- [ ] `nest build service` 빌드 성공
- [ ] `pnpm test` 단위 테스트 통과
- [ ] `pnpm lint:check` 린트 통과

---

## Phase 3: 서비스 앱 정리

> **이 Phase에서 하는 일:** `apps/service/`에서 admin 관련 코드를 제거하고, 서비스 전용 AppModule과 main.ts를 정리한다.

- [ ] `apps/service/src/app.module.ts` 수정
  - `AdminModule` import 제거
  - 공유 모듈을 `@app/shared`에서 import
  - `TypeOrmModule.forRootAsync()`의 설정 함수를 `@app/shared`에서 import
- [ ] `apps/service/src/main.ts` 수정
  - `PORT` 환경변수 사용 (기본값 3000)
  - instrumentation을 `@app/shared`에서 import
- [ ] `apps/service/src/` 에서 admin 관련 파일 삭제 (Phase 4에서 admin 앱으로 이동할 것이므로)
- [ ] `apps/service/src/auth/` 내부 import 경로 정리
  - 엔티티: `@app/shared`
  - auth.types: `@app/shared`
  - 공통 유틸리티: `@app/shared`
- [ ] `apps/service/src/posts/` 내부 import 경로 정리
- [ ] **검증:**
  - [ ] `nest build service` 빌드 성공
  - [ ] `nest start service` 서버 기동 확인 (localhost:3000/health)
  - [ ] `pnpm test` 단위 테스트 통과

---

## Phase 4: 관리자 앱 생성

> **이 Phase에서 하는 일:** `apps/admin/`에 관리자 코드를 배치하고, 별도 포트(3001)에서 독립 실행되도록 구성한다.

- [ ] `apps/admin/src/` 하위에 기존 admin 코드를 기능별로 배치 (admin/ 중첩 없이 플랫 구조)
  - `src/admin/auth/` → `apps/admin/src/auth/` (인증 컨트롤러, command, query, dto)
  - `src/admin/guard/` → `apps/admin/src/guard/`
  - `src/admin/strategy/` → `apps/admin/src/strategy/`
  - `src/admin/decorator/` → `apps/admin/src/decorator/`
  - `src/admin/interface/` → `apps/admin/src/interface/`
  - `src/admin/admin.repository.ts` → `apps/admin/src/admin.repository.ts`
  - `src/admin/admin-repository.provider.ts` → `apps/admin/src/admin-repository.provider.ts`
  - `src/admin/admin.module.ts` → `apps/admin/src/admin.module.ts`
  - 엔티티/enum은 이미 `libs/shared/`에 있으므로 이동 불필요
- [ ] `apps/admin/src/app.module.ts` 생성
  - `AdminModule` + 공유 인프라 모듈(`@app/shared`) import
  - `ConfigModule.forRoot()`, `TypeOrmModule.forRootAsync()`, `ThrottlerModule`, `EventEmitterModule`
  - `LoggingModule`, `IdempotencyModule`, `HealthModule`
- [ ] `apps/admin/src/main.ts` 생성
  - `ADMIN_PORT` 환경변수 사용 (기본값 3001)
  - Swagger 설정 (Admin 전용 title, description)
  - URI Versioning 설정
  - ValidationPipe, 글로벌 필터/인터셉터
- [ ] 모든 import를 `@app/shared`로 변경
  - 엔티티, enum, 공통 유틸리티, auth.types 등
- [ ] `.env.local`, `.env.example`에 `ADMIN_PORT=3001` 추가
- [ ] **검증:**
  - [ ] `nest build admin` 빌드 성공
  - [ ] `nest start admin` 서버 기동 확인 (localhost:3001/health)
  - [ ] `pnpm test` 단위 테스트 통과
  - [ ] 두 서버 동시 기동 테스트
    ```bash
    nest start service &   # localhost:3000
    nest start admin &     # localhost:3001
    curl localhost:3000/health
    curl localhost:3001/health
    ```

---

## Phase 5: 테스트 재구성

> **이 Phase에서 하는 일:** 통합 테스트를 앱별로 분리하고, 테스트 인프라를 공유 구조로 정리한다.

### 5.1 통합 테스트 분리

- [ ] `test/service/` 디렉토리 생성
  - `test/auth.integration-spec.ts` → `test/service/auth.integration-spec.ts`
  - `test/posts.integration-spec.ts` → `test/service/posts.integration-spec.ts`
  - `test/service/jest-e2e.json` 생성 (moduleNameMapper에 `@app/shared` 추가)
- [ ] `test/admin/` 디렉토리 생성
  - `test/admin.integration-spec.ts` → `test/admin/admin.integration-spec.ts`
  - `test/admin/jest-e2e.json` 생성

### 5.2 테스트 헬퍼 수정

- [ ] `test/setup/integration-helper.ts` 수정
  - `createIntegrationApp()` → AppModule을 파라미터로 받도록 변경
    ```typescript
    export async function createIntegrationApp(
      appModule: Type<any>,
    ): Promise<INestApplication<App>> { ... }
    ```
  - 서비스 테스트: `createIntegrationApp(ServiceAppModule)`
  - 관리자 테스트: `createIntegrationApp(AdminAppModule)`
- [ ] `test/setup/global-setup.ts` — 경로 및 환경변수 확인

### 5.3 단위 테스트 설정

- [ ] 루트 `package.json` Jest 설정 업데이트
  - `projects` 배열로 멀티 프로젝트 실행
  - 각 프로젝트의 `moduleNameMapper`에 `@app/shared` 매핑 추가

### 5.4 package.json 스크립트 업데이트

- [ ] 스크립트 추가/수정
  ```json
  "test:e2e:service": "jest --config test/service/jest-e2e.json",
  "test:e2e:admin": "jest --config test/admin/jest-e2e.json",
  "test:e2e": "pnpm test:e2e:service && pnpm test:e2e:admin"
  ```

### 5.5 검증

- [ ] `pnpm test` 단위 테스트 전체 통과
- [ ] `pnpm test:e2e:service` 서비스 통합 테스트 통과
- [ ] `pnpm test:e2e:admin` 관리자 통합 테스트 통과

---

## Phase 6: 정리

> **이 Phase에서 하는 일:** 더 이상 사용하지 않는 파일/설정을 제거하고, 문서를 업데이트한다.

### 6.1 파일 정리

- [ ] 기존 `src/` 디렉토리 삭제 확인 (Phase 1에서 자동 이동 완료)
- [ ] `apps/service/src/` 에서 admin 관련 잔여 파일 삭제 확인
- [ ] `tsconfig.build.json` 제거 (각 앱의 tsconfig.app.json으로 대체)

### 6.2 의존성 정리

- [ ] `@src/*` 경로 별칭 제거 (tsconfig.json paths에서)
  - 모든 코드가 `@app/shared` 또는 상대 경로를 사용하는지 grep으로 확인
- [ ] `tsc-alias` 의존성 제거 (NestJS CLI가 모노레포 경로 해석 처리)
  - `pnpm remove tsc-alias`
  - package.json 빌드 스크립트에서 `tsc-alias` 호출 제거

### 6.3 빌드/실행 스크립트 최종 정리

- [ ] package.json scripts 정리
  - 기존 단일 앱 스크립트 제거 (`build:local`, `start:local` 등)
  - 모노레포 스크립트로 교체 (`build:service`, `build:admin`, `start:service:local`, `start:admin:local` 등)
  - migration 스크립트 경로 업데이트 (`libs/shared/src/data-source.ts`)

### 6.4 문서 업데이트

- [ ] `CLAUDE.md` 업데이트
  - 빌드/실행/테스트 명령어 변경
  - 디렉토리 구조 설명 업데이트
  - import 경로 규칙 변경 (`@app/shared`)
- [ ] `README.md` 업데이트 (있는 경우)

### 6.5 CI/CD 업데이트

- [ ] GitHub Actions 워크플로우 업데이트
  - 빌드: `pnpm build:all` (또는 `nest build service && nest build admin`)
  - 테스트: `pnpm test` + `pnpm test:e2e:service` + `pnpm test:e2e:admin`
  - migration 경로 변경 (`libs/shared/src/migrations/`)

### 6.6 최종 검증

- [ ] `pnpm format` — 포맷 자동 수정
- [ ] `pnpm lint:check` — 린트 통과
- [ ] `nest build service && nest build admin` — 양쪽 빌드 통과
- [ ] `pnpm test` — 단위 테스트 전체 통과
- [ ] `pnpm test:e2e:service` — 서비스 통합 테스트 통과
- [ ] `pnpm test:e2e:admin` — 관리자 통합 테스트 통과
- [ ] 두 서버 동시 기동 + API 수동 확인
  ```bash
  # 서비스 서버
  curl localhost:3000/health
  curl -X POST localhost:3000/v1/auth/register ...

  # 관리자 서버
  curl localhost:3001/health
  curl -X POST localhost:3001/v1/admin/auth/register ...
  ```
- [ ] 서비스 토큰으로 관리자 엔드포인트 접근 → 401 확인
- [ ] 관리자 토큰으로 서비스 엔드포인트 접근 → 401 확인
