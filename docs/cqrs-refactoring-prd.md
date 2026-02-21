# CQRS 리팩토링 PRD: Facade → CQRS/Mediator 패턴

## 1. 배경

### 1.1 현재 상태

GitHub 이슈 #1에서 RolandSall이 현재 아키텍처의 구조적 한계를 지적했다.

**현재 요청 흐름:**

```
HTTP Request
    ↓
PostsController (라우팅)
    ↓
PostsFacade (오케스트레이션 + DTO 변환)
    ↓
PostsValidationService (존재 검증) + PostsService (비즈니스 로직)
    ↓
IPostReadRepository / IPostWriteRepository
    ↓
PostRepository → BaseRepository → TypeORM → PostgreSQL
```

### 1.2 문제점

| 문제 | 설명 |
|------|------|
| **Facade의 역할 불일치** | 진정한 Facade는 여러 서브시스템을 조율하는 패턴이다. 현재 `PostsFacade`는 서비스 1개 호출 + null 체크 + DTO 변환만 수행하는 3줄짜리 래퍼에 불과 |
| **Service가 pass-through** | `PostsService`의 모든 메서드가 `return this.repository.method()` 한 줄 위임. 비즈니스 로직이 없는 불필요한 레이어 |
| **레이어 비대화** | 유스케이스가 추가될 때마다 Facade에 메서드 추가 → Service에 메서드 추가 → 두 레이어가 동시에 비대해짐 |
| **SRP 위반** | `PostsFacade` 하나가 5개 유스케이스(CRUD + 페이지네이션)를 모두 알아야 함 |

### 1.3 개선 동기

이슈에서 제안된 CQRS/Mediator 패턴은 이 문제들을 구조적으로 해결한다:

- 각 유스케이스가 **독립된 Handler 클래스**에 대응 → SRP 달성
- Facade, Service 레이어 제거 → 불필요한 간접 참조 해소
- 향후 Event 기반 확장이 자연스러움 (이번 단계에서는 미포함)

---

## 2. CQRS란?

### 2.1 개념

**CQRS = Command Query Responsibility Segregation** (명령-조회 책임 분리)

전통적인 CRUD 아키텍처에서는 하나의 Service가 읽기와 쓰기를 모두 처리한다:

```
// 전통적 CRUD
PostsService {
  findById(id)        ← 읽기
  findAll()           ← 읽기
  create(dto)         ← 쓰기
  update(id, dto)     ← 쓰기
  delete(id)          ← 쓰기
}
```

CQRS는 이것을 **명시적으로 분리**한다:

```
// CQRS
Command (쓰기 의도)          Query (읽기 의도)
─────────────────           ─────────────────
CreatePostCommand    →      GetPostByIdQuery     →
UpdatePostCommand    →      FindAllPostsQuery    →
DeletePostCommand    →

CommandHandler (쓰기 처리)   QueryHandler (읽기 처리)
─────────────────────       ──────────────────────
CreatePostHandler           GetPostByIdHandler
UpdatePostHandler           FindAllPostsHandler
DeletePostHandler
```

### 2.2 핵심 구성 요소

| 구성 요소 | 역할 | 예시 |
|-----------|------|------|
| **Command** | 시스템 상태를 **변경**하려는 의도를 표현하는 순수 객체 | `CreatePostCommand(title, content)` |
| **Query** | 시스템 상태를 **조회**하려는 의도를 표현하는 순수 객체 | `GetPostByIdQuery(id)` |
| **CommandHandler** | Command를 받아 실제 쓰기 작업을 수행하는 전담 클래스 | `CreatePostHandler.execute(command)` |
| **QueryHandler** | Query를 받아 실제 읽기 작업을 수행하는 전담 클래스 | `GetPostByIdHandler.execute(query)` |
| **CommandBus** | Command를 적절한 Handler로 라우팅하는 버스 | `commandBus.execute(new CreatePostCommand(...))` |
| **QueryBus** | Query를 적절한 Handler로 라우팅하는 버스 | `queryBus.execute(new GetPostByIdQuery(...))` |

### 2.3 Facade 방식 vs CQRS 방식

**Facade 방식 — 하나의 게시글 생성 흐름:**

```typescript
// Controller
async createPost(@Body() dto) {
  return this.postsFacade.createPost(dto);
}

// Facade — dto를 Service에 전달하고 결과를 DTO로 변환
async createPost(dto) {
  const post = await this.postsService.create(dto);
  return PostResponseDto.of(post);
}

// Service — Repository에 위임
async create(dto) {
  return this.postWriteRepository.create(dto);
}
```

3개 레이어를 통과하지만, Facade와 Service는 의미 있는 로직이 없다.

**CQRS 방식 — 같은 흐름:**

```typescript
// Controller — HTTP 입력을 Command로 변환하여 버스에 전달
async createPost(@Body() dto) {
  return this.commandBus.execute(
    new CreatePostCommand(dto.title, dto.content, dto.isPublished),
  );
}

// Handler — 이 유스케이스의 전담 처리자
@CommandHandler(CreatePostCommand)
class CreatePostHandler implements ICommandHandler<CreatePostCommand> {
  constructor(private readonly postWriteRepository: IPostWriteRepository) {}

  async execute(command: CreatePostCommand): Promise<PostResponseDto> {
    const post = await this.postWriteRepository.create({
      title: command.title,
      content: command.content,
      isPublished: command.isPublished,
    });
    return PostResponseDto.of(post);
  }
}
```

Controller → Bus → Handler → Repository. 중간의 불필요한 레이어가 사라진다.

### 2.4 CQRS의 장점과 한계

| 관점 | 장점 | 한계 |
|------|------|------|
| **SRP** | Handler 1개 = 유스케이스 1개. 책임이 명확 | 단순 CRUD에서는 파일 수만 늘어날 수 있음 |
| **확장성** | 유스케이스 추가 = Handler 파일 추가. 기존 코드 수정 불필요 | 파일 수 증가 (Command + Handler per use case) |
| **테스트** | Handler 단위로 독립 테스트 가능 | 단순 위임 Handler는 테스트 가치가 낮음 |
| **삭제** | 유스케이스 삭제 = Handler 파일 삭제. 다른 코드에 영향 없음 | — |
| **Event 확장** | CommandHandler에서 Event 발행 → 느슨한 결합의 부수 효과 처리 | Event 시스템 추가 시 복잡도 증가 |
| **읽기/쓰기 분리** | Query Handler → ReadRepo, Command Handler → WriteRepo. 자연스러운 CQRS | 같은 DB를 사용하면 실질적 이점 제한적 |

### 2.5 NestJS에서의 CQRS

NestJS는 `@nestjs/cqrs` 공식 패키지를 제공한다:

```
┌─────────────────────────────────────────────────────┐
│                    CqrsModule                        │
│                                                      │
│  CommandBus ──→ @CommandHandler로 장식된 클래스 자동 발견  │
│  QueryBus   ──→ @QueryHandler로 장식된 클래스 자동 발견   │
│  EventBus   ──→ @EventsHandler로 장식된 클래스 자동 발견  │
│                                                      │
│  ExplorerService가 부트스트랩 시 모든 Handler를 탐색/등록  │
└─────────────────────────────────────────────────────┘
```

- `CqrsModule`을 import하면 `CommandBus`, `QueryBus`를 어디서든 주입 가능
- `@CommandHandler(CreatePostCommand)` 데코레이터로 Handler 자동 등록
- 별도의 수동 와이어링 불필요 — 데코레이터 기반 자동 발견

### 2.6 향후 확장: Event Handler (이번 범위 아님)

CQRS의 진가는 Event 기반 부수 효과 처리에서 발휘된다. 참고용으로 기록:

```typescript
// Command Handler가 작업 완료 후 Event 발행
@CommandHandler(CreatePostCommand)
class CreatePostHandler {
  async execute(command: CreatePostCommand) {
    const post = await this.repository.create(...);
    this.eventBus.publish(new PostCreatedEvent(post.id));  // 이벤트 발행
    return PostResponseDto.of(post);
  }
}

// Event Handler — 독립적인 부수 효과 처리
@EventsHandler(PostCreatedEvent)
class SendNotificationHandler {
  async handle(event: PostCreatedEvent) {
    await this.notificationService.send(...);  // 알림 발송
  }
}

@EventsHandler(PostCreatedEvent)
class UpdateSearchIndexHandler {
  async handle(event: PostCreatedEvent) {
    await this.searchService.index(...);  // 검색 인덱스 갱신
  }
}
```

하나의 Event에 여러 Handler가 독립적으로 반응 — Facade에서 모든 단계를 순차 나열하는 것보다 훨씬 느슨한 결합.

현재 CRUD 규모에서는 Event가 과잉이므로, Command/Query만 도입하고 Event는 도메인 복잡도가 증가할 때 추가한다.

---

## 3. 목표

### 3.1 범위

- Facade + Service + ValidationService 3개 레이어를 **5개의 독립된 Handler**로 대체
- `@nestjs/cqrs`의 `CommandBus`/`QueryBus` 도입
- Repository 패턴(ISP 적용된 읽기/쓰기 분리)은 **그대로 유지**
- DTO 구조(Request DTO, Response DTO with `of()` 팩토리)는 **그대로 유지**
- Event Handler는 **이번 범위에서 제외**

### 3.2 변경 후 요청 흐름

```
HTTP Request
    ↓
PostsController (라우팅 + Command/Query 생성)
    ↓
CommandBus / QueryBus (자동 라우팅)
    ↓
Handler (유스케이스 전담 — 검증 + 비즈니스 로직 + DTO 변환)
    ↓
IPostReadRepository / IPostWriteRepository
    ↓
PostRepository → BaseRepository → TypeORM → PostgreSQL
```

### 3.3 유스케이스 → Command/Query 매핑

| 현재 Facade 메서드 | CQRS 대응 | 유형 |
|---------------------|-----------|------|
| `getPostById(id)` | `GetPostByIdQuery` → `GetPostByIdHandler` | Query |
| `findAllPaginated(dto)` | `FindAllPostsPaginatedQuery` → `FindAllPostsPaginatedHandler` | Query |
| `createPost(dto)` | `CreatePostCommand` → `CreatePostHandler` | Command |
| `updatePost(id, dto)` | `UpdatePostCommand` → `UpdatePostHandler` | Command |
| `deletePost(id)` | `DeletePostCommand` → `DeletePostHandler` | Command |

---

## 4. 기술 설계

### 4.1 디렉토리 구조

```
src/posts/
├── command/
│   ├── create-post.command.ts          # Command 객체
│   ├── create-post.handler.ts          # Command Handler
│   ├── update-post.command.ts
│   ├── update-post.handler.ts
│   ├── update-post.handler.spec.ts     # 단위 테스트
│   ├── delete-post.command.ts
│   ├── delete-post.handler.ts
│   └── delete-post.handler.spec.ts     # 단위 테스트
├── query/
│   ├── get-post-by-id.query.ts         # Query 객체
│   ├── get-post-by-id.handler.ts       # Query Handler
│   ├── get-post-by-id.handler.spec.ts  # 단위 테스트
│   ├── find-all-posts-paginated.query.ts
│   ├── find-all-posts-paginated.handler.ts
│   └── find-all-posts-paginated.handler.spec.ts  # 단위 테스트
├── dto/                    # 변경 없음
├── entities/               # 변경 없음
├── interface/              # 변경 없음
├── post.repository.ts      # 변경 없음
├── post-repository.provider.ts  # 변경 없음
├── posts.controller.ts     # 수정: CommandBus/QueryBus 주입
└── posts.module.ts         # 수정: CqrsModule import, Handler 등록
```

### 4.2 Command/Query 클래스 설계

Command와 Query는 **의도를 표현하는 순수 값 객체**다. 로직이 없고, 생성자에서 readonly 필드를 받는다.

**Command 클래스 (3개):**

| 클래스 | 필드 |
|--------|------|
| `CreatePostCommand` | `title: string`, `content: string`, `isPublished?: boolean` |
| `UpdatePostCommand` | `id: number`, `title: string`, `content: string`, `isPublished: boolean` |
| `DeletePostCommand` | `id: number` |

**Query 클래스 (2개):**

| 클래스 | 필드 |
|--------|------|
| `GetPostByIdQuery` | `id: number` |
| `FindAllPostsPaginatedQuery` | `page: number`, `limit: number` |

### 4.3 Handler 설계

각 Handler는 기존 Facade + Service + ValidationService에 분산되어 있던 로직을 하나로 통합한다.

**Command Handlers:**

| Handler | 주입 | 로직 |
|---------|------|------|
| `CreatePostHandler` | `IPostWriteRepository` | `create(input)` → `post.id` 반환 |
| `UpdatePostHandler` | `IPostWriteRepository` | `update(id, input)` → affected가 0이면 NotFoundException |
| `DeletePostHandler` | `IPostWriteRepository` | `delete(id)` → affected가 0이면 NotFoundException |

**Query Handlers:**

| Handler | 주입 | 로직 |
|---------|------|------|
| `GetPostByIdHandler` | `IPostReadRepository` | `findById(id)` → null이면 NotFoundException → `PostResponseDto.of(post)` |
| `FindAllPostsPaginatedHandler` | `IPostReadRepository` | `findAllPaginated(page, limit)` → `map PostResponseDto.of` → `PaginatedResponseDto.of(...)` |

### 4.4 Controller 변경

현재 `PostsFacade`를 주입받는 구조에서 `CommandBus`/`QueryBus`를 주입받는 구조로 변경:

```typescript
// Before
constructor(private readonly postsFacade: PostsFacade) {}

@Post()
async createPost(@Body() dto: CreatePostRequestDto) {
  return this.postsFacade.createPost(dto);
}

// After
constructor(
  private readonly commandBus: CommandBus,
  private readonly queryBus: QueryBus,
) {}

@Post()
async createPost(@Body() dto: CreatePostRequestDto) {
  return this.commandBus.execute(
    new CreatePostCommand(dto.title, dto.content, dto.isPublished),
  );
}
```

### 4.5 Module 변경

```typescript
// Before
@Module({
  controllers: [PostsController],
  providers: [
    PostsFacade,
    PostsService,
    PostsValidationService,
    ...postRepositoryProviders,
  ],
})

// After
@Module({
  imports: [CqrsModule],
  controllers: [PostsController],
  providers: [
    ...commandHandlers,       // [CreatePostHandler, UpdatePostHandler, DeletePostHandler]
    ...queryHandlers,         // [GetPostByIdHandler, FindAllPostsPaginatedHandler]
    ...postRepositoryProviders,
  ],
})
```

---

## 5. 삭제 대상

| 파일 | 이유 |
|------|------|
| `src/posts/posts.facade.ts` | 오케스트레이션이 각 Handler로 분산됨 |
| `src/posts/posts.facade.spec.ts` | Handler 단위 테스트로 대체됨 |
| `src/posts/service/posts.service.ts` | pass-through 레이어. Handler가 Repository 직접 호출 |
| `src/posts/service/posts-validation.service.ts` | 검증 로직이 각 Handler 내부로 이동 |

---

## 6. 테스트 전략

### 6.1 Classical School 원칙 유지

> **로직은 단위 테스트, 연결(wiring)은 통합 테스트.**

### 6.2 Handler 단위 테스트 범위

**원칙**: DTO 변환 로직 또는 NotFoundException 분기가 있는 Handler만 단위 테스트. pass-through Handler는 통합 테스트로 커버.

| Handler | DTO 변환 | 검증 분기 | 단위 테스트 대상 |
|---------|----------|-----------|------------------|
| `CreatePostHandler` | O | X | X (pass-through) |
| `UpdatePostHandler` | O | O (NotFoundException) | **O** |
| `DeletePostHandler` | X | O (NotFoundException) | **O** |
| `GetPostByIdHandler` | O | O (NotFoundException) | **O** |
| `FindAllPostsPaginatedHandler` | O | X | **O** (PaginatedResponseDto 변환) |

### 6.3 기존 테스트 영향

| 테스트 파일 | 변경 필요 |
|-------------|-----------|
| `src/posts/dto/response/post.response.dto.spec.ts` | 변경 없음 — 순수 팩토리 함수 |
| `src/common/dto/response/paginated.response.dto.spec.ts` | 변경 없음 — 순수 계산 로직 |
| `test/posts.integration-spec.ts` | 변경 없음 — HTTP 레벨 검증이므로 내부 구조에 무관 |

---

## 7. 변경 전후 아키텍처 비교

### Before

```
┌──────────────┐
│  Controller  │ ── 라우팅만 담당
└──────┬───────┘
       ↓
┌──────────────┐
│   Facade     │ ── DTO 변환 + 오케스트레이션
└──┬───────┬───┘
   ↓       ↓
┌──────┐ ┌──────────────────┐
│Valid.│ │    Service        │ ── pass-through 위임
│Svc   │ └────────┬─────────┘
└──┬───┘          ↓
   ↓       ┌──────────────┐
   └──────→│  Repository   │ ── 데이터 접근
           └──────────────┘
```

### After

```
┌──────────────┐
│  Controller  │ ── 라우팅 + Command/Query 생성
└──────┬───────┘
       ↓
┌──────────────┐
│ CommandBus / │ ── 자동 라우팅 (@nestjs/cqrs)
│  QueryBus    │
└──────┬───────┘
       ↓
┌──────────────┐
│   Handler    │ ── 검증 + 로직 + DTO 변환 (유스케이스 1:1)
└──────┬───────┘
       ↓
┌──────────────┐
│  Repository  │ ── 데이터 접근 (변경 없음)
└──────────────┘
```

레이어 수: **4 → 3** (Facade, Service, ValidationService 제거 → Handler 1개로 통합)

---

## 8. 범위 외 (향후 고려)

| 항목 | 이유 |
|------|------|
| Event Handler (PostCreatedEvent 등) | 현재 CRUD 규모에서 과잉. 도메인 복잡도 증가 시 추가 |
| 읽기/쓰기 데이터 저장소 분리 | 같은 PostgreSQL 사용. 트래픽 패턴에 따라 추후 결정 |
| Saga (장기 실행 프로세스) | 멀티 도메인 트랜잭션이 없는 현재 상태에서 불필요 |
