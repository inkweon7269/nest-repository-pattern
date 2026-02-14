# NestJS Repository Pattern + Facade Pattern

NestJS + TypeORM + PostgreSQL 기반 Posts CRUD API.
**Repository Pattern**으로 데이터 액세스를 추상화하고, **Facade Pattern**으로 레이어 간 책임을 분리한다.

## 목차

- [아키텍처](#아키텍처)
  - [요청 흐름](#요청-흐름)
  - [프로젝트 구조](#프로젝트-구조)
- [디자인 패턴](#디자인-패턴)
  - [Repository Pattern (ISP 적용)](#repository-pattern-isp-적용)
  - [Facade Pattern](#facade-pattern)
- [시작하기](#시작하기)
  - [환경 설정](#환경-설정)
  - [실행](#실행)
  - [Migration](#migration)
- [API](#api)
- [테스트](#테스트)

---

## 아키텍처

### 요청 흐름

```
HTTP Request
  │
  ▼
Controller              ← 라우팅, 파라미터 파싱만 담당
  │
  ▼
Facade                  ← DTO 변환(ResponseDto.of), 오케스트레이션
  │
  ├──→ PostsValidationService   ← 엔티티 존재 검증 (findById → null 체크 → NotFoundException)
  │
  ├──→ PostsService             ← 순수 비즈니스 로직, Entity 반환
  │
  ▼
IPostReadRepository / IPostWriteRepository   ← abstract class (DI 토큰 겸 인터페이스, ISP)
  │
  ▼
PostRepository          ← 두 인터페이스를 모두 구현, BaseRepository 상속
  │
  ▼
BaseRepository          ← DataSource 주입, getRepository<T>() 제공
  │
  ▼
TypeORM → PostgreSQL
```

### 프로젝트 구조

```
src/
├── main.ts                                   # 앱 부트스트랩 (ValidationPipe, Swagger)
├── app.module.ts                             # 루트 모듈 (ConfigModule, TypeOrmModule)
├── data-source.ts                            # TypeORM CLI용 DataSource
├── common/
│   └── base.repository.ts                    # BaseRepository (DataSource 추상화)
├── database/
│   └── typeorm.config.ts                     # DataSource 설정 팩토리
├── migrations/
│   └── 1770456974651-CreatePostTable.ts      # TypeORM Table API 기반 migration
└── posts/
    ├── entities/
    │   └── post.entity.ts                    # Post 엔티티
    ├── interface/
    │   ├── post-read-repository.interface.ts  # IPostReadRepository (읽기 전용)
    │   └── post-write-repository.interface.ts # IPostWriteRepository (쓰기 전용)
    ├── service/
    │   ├── posts.service.ts                  # 비즈니스 로직
    │   └── posts-validation.service.ts       # 존재 검증 (NotFoundException)
    ├── dto/
    │   ├── request/
    │   │   ├── create-post.request.dto.ts
    │   │   └── update-post.request.dto.ts
    │   └── response/
    │       └── post.response.dto.ts          # static of() 팩토리 메서드
    ├── post.repository.ts                    # PostRepository 구현체
    ├── post-repository.provider.ts           # useExisting 기반 커스텀 프로바이더
    ├── posts.facade.ts                       # 오케스트레이션 계층
    ├── posts.controller.ts                   # HTTP 라우팅
    └── posts.module.ts                       # Posts 모듈

test/
├── posts.e2e-spec.ts                         # E2E 테스트 (mock repository, Docker 불필요)
├── posts.integration-spec.ts                 # 통합 테스트 (Testcontainers, Docker 필수)
├── jest-e2e.json                             # E2E + 통합 테스트 Jest 설정
└── setup/
    ├── global-setup.ts                       # PostgreSQL 컨테이너 기동 + migration
    ├── global-teardown.ts                    # 컨테이너 종료 + 임시 파일 삭제
    └── integration-helper.ts                 # 앱 생성 + per-test 트랜잭션 격리
```

---

## 디자인 패턴

### Repository Pattern (ISP 적용)

**목적:** 데이터 액세스 로직을 비즈니스 로직으로부터 분리하여 교체 가능하게 만든다.
**인터페이스 분리 원칙(ISP)** 을 적용하여 읽기/쓰기 인터페이스를 분리한다.

#### 왜 사용하는가?

Service가 TypeORM의 `Repository<Post>`를 직접 사용하면 다음 문제가 생긴다:

- Service가 TypeORM API에 강결합 → ORM 교체 시 Service 전체 수정
- 테스트 시 TypeORM 전체를 모킹해야 함
- 데이터 액세스 로직과 비즈니스 로직의 경계가 모호

Repository Pattern + ISP를 적용하면:

- **Service는 필요한 인터페이스에만 의존** → `PostsValidationService`는 `IPostReadRepository`만, `PostsService`는 읽기/쓰기 모두 주입
- **구현체 교체가 자유로움** → TypeORM이든, Prisma이든, 인메모리이든 Service 코드 변경 없음
- **테스트가 단순** → 인터페이스만 모킹하면 됨
- **책임 분리** → "어떻게 저장하는가"(Repository)와 "무엇을 하는가"(Service)가 분리

#### 구현 구조

```
┌──────────────────────────────────────────────────────────────────┐
│ IPostReadRepository (abstract class)                              │
│ ─ findById(), findAll()                                          │
│                                                                  │
│ IPostWriteRepository (abstract class)                             │
│ ─ create(), update(), delete()                                   │
│                                                                  │
│ → TypeScript interface는 런타임에 사라지므로 abstract class 사용    │
│ → DI 토큰 역할 + 메서드 시그니처 정의                                │
├──────────────────────────────────────────────────────────────────┤
│ PostRepository (구현체)                                           │
│ ─ 두 인터페이스를 모두 구현                                          │
│ ─ BaseRepository를 상속하여 DataSource 접근                       │
│ ─ TypeORM Repository API를 사용한 실제 CRUD 구현                   │
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

### Facade Pattern

**목적:** 복잡한 하위 시스템(Service, ValidationService, DTO 변환)에 대한 단순한 인터페이스를 제공한다.

#### 왜 사용하는가?

Facade 없이 Controller에서 직접 처리하면:

```ts
// Controller가 너무 많은 책임을 가짐
@Get(':id')
async getPostById(@Param('id') id: number) {
  const post = await this.postsService.findById(id);   // Service 호출
  if (!post) throw new NotFoundException(...);          // 예외 처리
  return PostResponseDto.of(post);                      // DTO 변환
}
```

문제점:
- Controller에 비즈니스 판단(null 체크)과 DTO 변환 로직이 섞임
- 같은 로직이 여러 Controller에서 중복 가능
- Controller 테스트에 비즈니스 로직 검증까지 포함

Facade를 도입하면:

```ts
// Controller — 라우팅만 담당
@Get(':id')
async getPostById(@Param('id') id: number) {
  return this.postsFacade.getPostById(id);
}

// Facade — 오케스트레이션 담당
async getPostById(id: number): Promise<PostResponseDto> {
  const post = await this.postsValidationService.validatePostExists(id);
  return PostResponseDto.of(post);
}
```

#### 각 레이어의 책임

| 레이어 | 책임 | 반환 타입 |
|--------|------|-----------|
| **Controller** | HTTP 라우팅, 파라미터 파싱 (`@Param`, `@Body`) | `Promise<DTO>` |
| **Facade** | DTO 변환 (`ResponseDto.of`), 오케스트레이션 | `Promise<DTO>` |
| **PostsValidationService** | 엔티티 존재 검증 (`findById → NotFoundException`) | `Promise<Entity>` |
| **Service** | 순수 비즈니스 로직 | `Promise<Entity>` |
| **Repository** | 데이터 액세스 (CRUD) | `Promise<Entity>` |

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

| Method | Endpoint | 설명 | 상태 코드 |
|--------|----------|------|-----------|
| GET | `/posts` | 전체 게시글 조회 | 200 |
| GET | `/posts/:id` | ID로 게시글 조회 | 200 / 404 |
| POST | `/posts` | 게시글 생성 | 201 |
| PATCH | `/posts/:id` | 게시글 수정 (부분 업데이트) | 200 / 404 |
| DELETE | `/posts/:id` | 게시글 삭제 | 204 / 404 |

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
| title | string | X | 게시글 제목 |
| content | string | X | 게시글 내용 |
| isPublished | boolean | X | 게시 여부 |

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
Pass-through 레이어(Controller, Service, Repository)의 단위 테스트는 작성하지 않는다.

```bash
pnpm test            # 단위 테스트 (src/**/*.spec.ts)
pnpm test:e2e        # e2e + 통합 테스트 (test/**/*.(e2e|integration)-spec.ts)
pnpm test:cov        # 커버리지 리포트
```

### 테스트 구성

| 테스트 유형 | 위치 | 대상 | Docker |
|-------------|------|------|--------|
| **단위 테스트** | `src/**/*.spec.ts` | Facade (DTO 변환, 오케스트레이션), DTO (`of()` 팩토리) | 불필요 |
| **E2E 테스트** | `test/*.e2e-spec.ts` | HTTP 레이어 (ValidationPipe, 라우팅, 상태 코드) | 불필요 |
| **통합 테스트** | `test/*.integration-spec.ts` | 전체 플로우 (Controller → … → PostgreSQL) | 필수 |

### 단위 테스트

실제 조건 분기/변환 로직이 있는 레이어만 테스트:

- **Facade** — `PostsService`와 `PostsValidationService`를 모킹하여 DTO 변환 검증
- **DTO** — `PostResponseDto.of()` 순수 팩토리 함수 검증

### E2E 테스트

`PostsModule`을 import 후 `overrideProvider`로 DB 의존 제거.
`useExisting` 패턴 때문에 `PostRepository` 자체도 override 해야 `DataSource` 해결 오류가 발생하지 않는다.

### 통합 테스트

Testcontainers + `globalSetup` 패턴:

1. `globalSetup`에서 PostgreSQL 컨테이너를 1회 기동하고 migration 실행
2. 접속 정보를 `.test-env.json`에 기록
3. 각 테스트 파일은 `createIntegrationApp()`으로 앱 생성
4. `useTransactionRollback()`으로 per-test 트랜잭션 격리 적용
5. `globalTeardown`에서 컨테이너 종료 및 임시 파일 삭제
