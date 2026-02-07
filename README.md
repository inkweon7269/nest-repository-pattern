# NestJS Repository Pattern + Facade Pattern

NestJS + TypeORM + PostgreSQL 기반 Posts CRUD API.
**Repository Pattern**으로 데이터 액세스를 추상화하고, **Facade Pattern**으로 레이어 간 책임을 분리한다.

## 목차

- [아키텍처](#아키텍처)
  - [요청 흐름](#요청-흐름)
  - [프로젝트 구조](#프로젝트-구조)
- [디자인 패턴](#디자인-패턴)
  - [Repository Pattern](#repository-pattern)
  - [Facade Pattern](#facade-pattern)
- [시작하기](#시작하기)
  - [환경 설정](#환경-설정)
  - [실행](#실행)
- [API](#api)
- [테스트](#테스트)

---

## 아키텍처

### 요청 흐름

```
HTTP Request
  │
  ▼
Controller          ← 라우팅, 파라미터 파싱만 담당
  │
  ▼
Facade              ← DTO 변환, 예외 처리 (오케스트레이션 계층)
  │
  ▼
Service             ← 순수 비즈니스 로직, Entity 반환
  │
  ▼
IPostRepository     ← abstract class (DI 토큰 겸 인터페이스)
  │
  ▼
PostRepository      ← 구현체, BaseRepository 상속
  │
  ▼
BaseRepository      ← DataSource 주입, getRepository<T>() 제공
  │
  ▼
TypeORM → PostgreSQL
```

### 프로젝트 구조

```
src/
├── main.ts                              # 앱 부트스트랩 (ValidationPipe, Swagger)
├── app.module.ts                        # 루트 모듈 (ConfigModule, TypeOrmModule)
├── common/
│   └── base.repository.ts               # BaseRepository (DataSource 추상화)
└── posts/
    ├── entities/
    │   └── post.entity.ts               # Post 엔티티
    ├── dto/
    │   ├── request/
    │   │   ├── create-post.request.dto.ts
    │   │   └── update-post.request.dto.ts
    │   └── response/
    │       └── post.response.dto.ts     # static of() 팩토리 메서드
    ├── post-repository.interface.ts     # IPostRepository (abstract class)
    ├── post.repository.ts               # PostRepository 구현체
    ├── post-repository.provider.ts      # 커스텀 프로바이더
    ├── posts.service.ts                 # 비즈니스 로직
    ├── posts.facade.ts                  # 오케스트레이션 계층
    ├── posts.controller.ts              # HTTP 라우팅
    └── posts.module.ts                  # Posts 모듈
```

---

## 디자인 패턴

### Repository Pattern

**목적:** 데이터 액세스 로직을 비즈니스 로직으로부터 분리하여 교체 가능하게 만든다.

#### 왜 사용하는가?

Service가 TypeORM의 `Repository<Post>`를 직접 사용하면 다음 문제가 생긴다:

- Service가 TypeORM API에 강결합 → ORM 교체 시 Service 전체 수정
- 테스트 시 TypeORM 전체를 모킹해야 함
- 데이터 액세스 로직과 비즈니스 로직의 경계가 모호

Repository Pattern을 적용하면:

- **Service는 인터페이스(`IPostRepository`)에만 의존** → 구현체가 TypeORM이든, Prisma이든, 인메모리이든 Service 코드 변경 없음
- **테스트가 단순** → 인터페이스만 모킹하면 됨
- **책임 분리** → "어떻게 저장하는가"(Repository)와 "무엇을 하는가"(Service)가 분리

#### 구현 구조

```
┌─────────────────────────────────────────────────────────────┐
│ IPostRepository (abstract class)                            │
│ ─ DI 토큰 역할 + 메서드 시그니처 정의                           │
│ ─ TypeScript interface는 런타임에 사라지므로 abstract class 사용 │
├─────────────────────────────────────────────────────────────┤
│ PostRepository (구현체)                                      │
│ ─ BaseRepository를 상속하여 DataSource 접근                   │
│ ─ TypeORM Repository API를 사용한 실제 CRUD 구현               │
├─────────────────────────────────────────────────────────────┤
│ BaseRepository (공통 추상 클래스)                              │
│ ─ DataSource를 주입받아 getRepository<T>() 제공               │
│ ─ 선택적 EntityManager 파라미터 → 트랜잭션 지원                  │
├─────────────────────────────────────────────────────────────┤
│ postRepositoryProvider (커스텀 프로바이더)                      │
│ ─ { provide: IPostRepository, useClass: PostRepository }    │
│ ─ 모듈에서 TypeOrmModule.forFeature()를 사용하지 않음           │
└─────────────────────────────────────────────────────────────┘
```

**핵심:** NestJS의 DI 컨테이너는 런타임에 동작하므로, TypeScript `interface` 대신 **abstract class**를 DI 토큰으로 사용한다. 이렇게 하면 하나의 심볼이 "타입 정의"와 "DI 토큰" 두 가지 역할을 동시에 수행한다.

### Facade Pattern

**목적:** 복잡한 하위 시스템(Service, DTO 변환, 예외 처리)에 대한 단순한 인터페이스를 제공한다.

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
  const post = await this.postsService.findById(id);
  if (!post) throw new NotFoundException(`Post with ID ${id} not found`);
  return PostResponseDto.of(post);
}
```

#### 각 레이어의 책임

| 레이어 | 책임 | 반환 타입 |
|--------|------|-----------|
| **Controller** | HTTP 라우팅, 파라미터 파싱 (`@Param`, `@Body`) | `Promise<DTO>` |
| **Facade** | DTO 변환 (`ResponseDto.of`), 예외 처리 (`NotFoundException`) | `Promise<DTO>` |
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

---

## API

Swagger UI: `http://localhost:3000/api`

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/posts` | 전체 게시글 조회 |
| GET | `/posts/:id` | ID로 게시글 조회 |
| POST | `/posts` | 게시글 생성 |

---

## 테스트

```bash
pnpm test            # 단위 테스트
pnpm test:e2e        # e2e 테스트
pnpm test:cov        # 커버리지 리포트
```

### 테스트 전략

각 레이어는 **직접 의존하는 하위 레이어만 모킹**하여 단위 테스트한다.

```
Controller  → PostsFacade 모킹
Facade      → PostsService 모킹
Service     → IPostRepository 모킹
Repository  → DataSource (TypeORM) 모킹
```

e2e 테스트는 `PostsModule`을 그대로 사용하되, `IPostRepository`만 모킹하여 DB 의존 없이 HTTP 전체 흐름(Controller → Facade → Service)을 검증한다.
