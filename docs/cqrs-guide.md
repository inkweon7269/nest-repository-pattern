# CQRS 패턴 입문 가이드

> 이 문서는 이 프로젝트의 실제 코드를 기반으로, CQRS 패턴을 처음 접하는 개발자가 구조를 이해하고 새 기능을 추가할 수 있도록 안내한다.

---

## 1. CQRS란?

CQRS(Command Query Responsibility Segregation)는 **데이터를 변경하는 작업(Command)**과 **데이터를 조회하는 작업(Query)**을 분리하는 패턴이다.

### 기존 방식의 문제

일반적인 NestJS 프로젝트에서는 하나의 Service 클래스가 생성, 수정, 삭제, 조회를 모두 담당한다.

```text
Controller → Service (create, update, delete, findById, findAll) → Repository
```

이 방식은 간단하지만, 기능이 늘어나면 Service가 비대해지고 읽기/쓰기 로직이 뒤섞인다.

### CQRS 방식

Command와 Query를 별도 객체로 분리하고, 각각 전용 Handler가 처리한다.

```text
[쓰기] Controller → CommandBus → Command Handler → WriteRepository
[읽기] Controller → QueryBus   → Query Handler   → ReadRepository
```

핵심 규칙:
- **Command**(쓰기)는 상태만 변경한다. DTO를 반환하지 않는다.
- **Query**(읽기)는 상태만 조회한다. 데이터를 변경하지 않는다.
- 하나의 요청에서 Command와 Query를 혼합하지 않는다.

---

## 2. 전체 흐름 한눈에 보기

### Request Flow

```text
HTTP 요청
  ↓
Controller (라우팅 + Command/Query 객체 생성)
  ↓
CommandBus / QueryBus (적절한 Handler를 찾아 실행)
  ↓
Handler (검증 + 비즈니스 로직)
  ↓
IPostReadRepository / IPostWriteRepository (인터페이스)
  ↓
PostRepository (구현체, BaseRepository 상속)
  ↓
TypeORM → PostgreSQL
```

### 각 레이어의 역할

| 레이어 | 역할 | 하는 것 | 하지 않는 것 |
|--------|------|---------|--------------|
| Controller | HTTP 라우팅 | Request DTO → Command/Query 변환 | 비즈니스 로직, DB 접근 |
| Command | 의도 표현 | "게시글을 생성하라"는 순수 데이터 | 로직 실행 |
| Query | 의도 표현 | "ID 1번 게시글을 조회하라"는 순수 데이터 | 로직 실행 |
| Command Handler | 쓰기 로직 | 존재 검증, Repository 호출, ID 반환 | DTO 변환 |
| Query Handler | 읽기 로직 | Repository 호출, DTO 변환 | 상태 변경 |
| Repository | 데이터 접근 | SQL 실행, 결과 반환 | 예외 던지기, null 체크 |

---

## 3. Command 패턴 (상태 변경)

### 3.1 Command 객체 — "무엇을 하고 싶은가"

Command는 **"~하라"라는 의도**를 표현하는 순수 값 객체다. 로직 없이 데이터만 담는다.

**가장 단순한 예 — 게시글 생성** (`src/posts/command/create-post.command.ts`):

```typescript
export class CreatePostCommand {
  constructor(
    public readonly title: string,      // 제목
    public readonly content: string,    // 내용
    public readonly isPublished?: boolean, // 공개 여부 (선택)
  ) {}
}
```

**식별자가 필요한 예 — 게시글 삭제** (`src/posts/command/delete-post.command.ts`):

```typescript
export class DeletePostCommand {
  constructor(public readonly id: number) {}  // 삭제할 게시글 ID
}
```

Command 객체의 규칙:
- `constructor`에 `public readonly` 필드만 선언한다.
- 메서드를 추가하지 않는다 (순수 값 객체).
- HTTP Request DTO와는 별개의 클래스다 (레이어 분리).

### 3.2 Command Handler — "어떻게 수행하는가"

Handler는 Command를 받아 **실제 작업을 수행**하는 클래스다.

#### 패턴 A: 단순 생성 (검증 없음)

`src/posts/command/create-post.handler.ts`:

```typescript
@CommandHandler(CreatePostCommand)  // ← 이 Handler가 처리할 Command를 지정
export class CreatePostHandler implements ICommandHandler<CreatePostCommand> {
  // WriteRepository만 주입 (읽기 작업 없음)
  constructor(private readonly postWriteRepository: IPostWriteRepository) {}

  async execute(command: CreatePostCommand): Promise<number> {
    // Repository에 데이터 전달 → 생성된 Post 반환
    const post = await this.postWriteRepository.create({
      title: command.title,
      content: command.content,
      isPublished: command.isPublished,
    });
    return post.id;  // ← ID만 반환. DTO를 반환하지 않는다!
  }
}
```

포인트:
- `@CommandHandler(CreatePostCommand)` 데코레이터로 Command와 Handler를 연결한다.
- 반환 타입은 `Promise<number>` (ID). `PostResponseDto`같은 DTO를 반환하지 않는다.
- Repository에 전달할 때 Command 필드를 그대로 매핑한다.

#### 패턴 B: 검증이 있는 수정/삭제

`src/posts/command/update-post.handler.ts`:

```typescript
@CommandHandler(UpdatePostCommand)
export class UpdatePostHandler implements ICommandHandler<UpdatePostCommand> {
  constructor(private readonly postWriteRepository: IPostWriteRepository) {}

  async execute(command: UpdatePostCommand): Promise<void> {  // ← void 반환
    // Repository.update()는 영향받은 행 수(affected count)를 반환
    const affected = await this.postWriteRepository.update(command.id, {
      title: command.title,
      content: command.content,
      isPublished: command.isPublished,
    });

    // 영향받은 행이 0이면 → 해당 ID의 게시글이 없다는 뜻
    if (affected === 0) {
      throw new NotFoundException(`Post with ID ${command.id} not found`);
    }
    // 성공하면 아무것도 반환하지 않음 (void)
  }
}
```

포인트:
- 반환 타입이 `Promise<void>` — 수정/삭제는 결과를 반환할 필요가 없다.
- **검증은 Handler에서** 수행한다. Repository는 예외를 던지지 않는다.
- `affected === 0` 패턴: TypeORM의 `update()`/`delete()` 결과에서 영향받은 행 수를 체크한다.

`DeletePostHandler`도 동일한 패턴이다:

```typescript
async execute(command: DeletePostCommand): Promise<void> {
  const affected = await this.postWriteRepository.delete(command.id);
  if (affected === 0) {
    throw new NotFoundException(`Post with ID ${command.id} not found`);
  }
}
```

### Command 반환 타입 정리

| Command | 반환 | 이유 |
|---------|------|------|
| Create | `number` (ID) | 클라이언트가 생성된 리소스를 식별해야 하므로 |
| Update | `void` | 클라이언트가 이미 ID를 알고 있으므로 |
| Delete | `void` | 삭제 후 반환할 데이터가 없으므로 |

---

## 4. Query 패턴 (상태 조회)

### 4.1 Query 객체 — "무엇을 조회하고 싶은가"

Query도 Command처럼 순수 값 객체지만, **조회 조건**을 담는다.

**단건 조회** (`src/posts/query/get-post-by-id.query.ts`):

```typescript
export class GetPostByIdQuery {
  constructor(public readonly id: number) {}  // 조회할 게시글 ID
}
```

**목록 조회 + 페이지네이션 + 필터** (`src/posts/query/find-all-posts-paginated.query.ts`):

```typescript
import { PaginatedQuery } from '@src/common/query/paginated.query';
import { PostFilter } from '@src/posts/interface/post-read-repository.interface';

export class FindAllPostsPaginatedQuery extends PaginatedQuery {
  constructor(
    page: number,
    limit: number,
    public readonly filter: PostFilter = {},  // 필터 (선택)
  ) {
    super(page, limit);  // 부모 클래스에 page, limit 전달
  }
}
```

여기서 `PaginatedQuery`는 `page`와 `limit`를 공통으로 갖는 베이스 클래스다 (`src/common/query/paginated.query.ts`):

```typescript
export abstract class PaginatedQuery {
  constructor(
    public readonly page: number,
    public readonly limit: number,
  ) {}
}
```

다른 도메인(예: Comments, Users)에서도 페이지네이션이 필요하면 이 클래스를 상속하면 된다.

### 4.2 Query Handler — "조회 결과를 어떻게 변환하는가"

Query Handler는 두 가지 책임을 갖는다:
1. Repository 호출 (데이터 조회)
2. **Entity → DTO 변환** (응답 형태로 가공)

#### 단건 조회

`src/posts/query/get-post-by-id.handler.ts`:

```typescript
@QueryHandler(GetPostByIdQuery)
export class GetPostByIdHandler implements IQueryHandler<GetPostByIdQuery> {
  // ReadRepository만 주입 (쓰기 작업 없음)
  constructor(private readonly postReadRepository: IPostReadRepository) {}

  async execute(query: GetPostByIdQuery): Promise<PostResponseDto> {
    // 1. Repository에서 Entity 조회
    const post = await this.postReadRepository.findById(query.id);

    // 2. 존재하지 않으면 404 에러
    if (!post) {
      throw new NotFoundException(`Post with ID ${query.id} not found`);
    }

    // 3. Entity → DTO 변환 (static of() 팩토리 메서드 사용)
    return PostResponseDto.of(post);
  }
}
```

#### 목록 조회 + 페이지네이션

`src/posts/query/find-all-posts-paginated.handler.ts`:

```typescript
@QueryHandler(FindAllPostsPaginatedQuery)
export class FindAllPostsPaginatedHandler
  implements IQueryHandler<FindAllPostsPaginatedQuery>
{
  constructor(private readonly postReadRepository: IPostReadRepository) {}

  async execute(
    query: FindAllPostsPaginatedQuery,
  ): Promise<PaginatedResponseDto<PostResponseDto>> {
    // 1. Repository에서 [게시글 배열, 전체 개수] 조회
    const [posts, totalElements] =
      await this.postReadRepository.findAllPaginated(
        query.page,
        query.limit,
        query.filter,
      );

    // 2. 각 Entity → DTO 변환
    const items = posts.map((post) => PostResponseDto.of(post));

    // 3. 페이지네이션 메타 정보와 함께 응답 생성
    return PaginatedResponseDto.of(
      items,
      totalElements,
      query.page,
      query.limit,
    );
  }
}
```

### DTO 변환: static of() 패턴

Entity를 DTO로 변환할 때 `static of()` 팩토리 메서드를 사용한다 (`src/posts/dto/response/post.response.dto.ts`):

```typescript
export class PostResponseDto {
  id: number;
  title: string;
  content: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Entity → DTO 변환을 한 곳에서 관리
  static of(post: Post): PostResponseDto {
    const dto = new PostResponseDto();
    dto.id = post.id;
    dto.title = post.title;
    dto.content = post.content;
    dto.isPublished = post.isPublished;
    dto.createdAt = post.createdAt;
    dto.updatedAt = post.updatedAt;
    return dto;
  }
}
```

이렇게 하면 변환 로직이 DTO 클래스 안에 캡슐화되어, 여러 Handler에서 동일한 방식으로 변환할 수 있다.

### Command Handler vs Query Handler 비교

| 항목 | Command Handler | Query Handler |
|------|-----------------|---------------|
| 주입 대상 | `IPostWriteRepository` | `IPostReadRepository` |
| 반환 타입 | `void` 또는 `number` | `PostResponseDto` 등 DTO |
| DTO 변환 | 하지 않음 | `static of()`로 수행 |
| 검증 | `affected === 0` 체크 | `null` 체크 |
| 상태 변경 | O | X |

---

## 5. Controller — Command와 Query의 연결점

Controller는 HTTP 요청을 받아 **적절한 Command/Query 객체를 생성**하고 Bus에 실행을 위임한다.

`src/posts/posts.controller.ts`:

```typescript
@Controller('posts')
export class PostsController {
  constructor(
    private readonly commandBus: CommandBus,  // 쓰기 전용
    private readonly queryBus: QueryBus,      // 읽기 전용
  ) {}
```

### 생성 (Command → ID → Response DTO)

```typescript
  @Post()
  async createPost(@Body() dto: CreatePostRequestDto): Promise<CreatePostResponseDto> {
    // 1. Request DTO → Command 객체 생성
    // 2. CommandBus로 실행 → Handler가 ID 반환
    const id = await this.commandBus.execute<CreatePostCommand, number>(
      new CreatePostCommand(dto.title, dto.content, dto.isPublished),
    );
    // 3. ID를 Response DTO로 감싸서 반환 (201 Created)
    return CreatePostResponseDto.of(id);
  }
```

### 수정/삭제 (Command → void → 204 No Content)

```typescript
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)  // ← 204 반환
  async updatePost(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new UpdatePostCommand(id, dto.title, dto.content, dto.isPublished),
    );
    // void 반환 → 응답 본문 없이 204
  }
```

### 조회 (Query → DTO)

```typescript
  @Get(':id')
  async getPostById(@Param('id', ParseIntPipe) id: number): Promise<PostResponseDto> {
    // QueryBus로 실행 → Handler가 DTO 반환 (200 OK)
    return this.queryBus.execute(new GetPostByIdQuery(id));
  }

  @Get()
  async findAllPaginated(
    @Query() dto: PostsPaginationRequestDto,
  ): Promise<PaginatedResponseDto<PostResponseDto>> {
    return this.queryBus.execute(
      new FindAllPostsPaginatedQuery(dto.page, dto.limit, {
        isPublished: dto.isPublished,
      }),
    );
  }
```

### HTTP 상태 코드 매핑

| 엔드포인트 | 메서드 | 상태 코드 | 응답 본문 |
|-----------|--------|----------|----------|
| `POST /posts` | Command | 201 Created | `{ id: 1 }` |
| `PATCH /posts/:id` | Command | 204 No Content | 없음 |
| `DELETE /posts/:id` | Command | 204 No Content | 없음 |
| `GET /posts/:id` | Query | 200 OK | `PostResponseDto` |
| `GET /posts` | Query | 200 OK | `PaginatedResponseDto` |
| 존재하지 않는 ID | Command/Query | 404 Not Found | 에러 메시지 |

---

## 6. Repository 패턴 (데이터 접근)

### ISP (Interface Segregation Principle)

Repository 인터페이스를 **읽기와 쓰기로 분리**한다. 이렇게 하면:
- Command Handler는 `IPostWriteRepository`만 알면 된다.
- Query Handler는 `IPostReadRepository`만 알면 된다.
- 불필요한 메서드에 의존하지 않는다.

```text
IPostReadRepository (읽기)          IPostWriteRepository (쓰기)
├── findById()                     ├── create()
└── findAllPaginated()             ├── update()
                                   └── delete()
         ↑                                   ↑
         └─────── PostRepository ────────────┘
                  (하나의 클래스가 둘 다 구현)
```

### 인터페이스 정의

TypeScript의 `interface`는 런타임에 사라지므로, NestJS DI 토큰으로 사용할 수 없다.
대신 **abstract class**를 DI 토큰 겸 인터페이스로 사용한다.

`src/posts/interface/post-read-repository.interface.ts`:

```typescript
export type PostFilter = {           // ← 도메인 필터 타입을 같은 파일에 정의
  isPublished?: boolean;
};

export abstract class IPostReadRepository {
  abstract findById(id: number): Promise<Post | null>;
  abstract findAllPaginated(
    page: number,
    limit: number,
    filter?: PostFilter,
  ): Promise<[Post[], number]>;      // ← [항목 배열, 전체 개수]
}
```

`src/posts/interface/post-write-repository.interface.ts`:

```typescript
export interface CreatePostInput {    // ← 도메인 입력 타입을 같은 파일에 정의
  title: string;
  content: string;
  isPublished?: boolean;
}

export interface UpdatePostInput {
  title?: string;
  content?: string;
  isPublished?: boolean;
}

export abstract class IPostWriteRepository {
  abstract create(input: CreatePostInput): Promise<Post>;
  abstract update(id: number, input: UpdatePostInput): Promise<number>;
  abstract delete(id: number): Promise<number>;  // ← affected count 반환
}
```

### Provider 등록 (DI 매핑)

`PostRepository` 하나가 두 인터페이스를 모두 구현한다.
`useExisting`으로 동일 인스턴스를 두 토큰에 매핑한다.

`src/posts/post-repository.provider.ts`:

```typescript
export const postRepositoryProviders: Provider[] = [
  PostRepository,                                          // 실제 클래스 등록
  { provide: IPostReadRepository, useExisting: PostRepository },  // 읽기 토큰 → 같은 인스턴스
  { provide: IPostWriteRepository, useExisting: PostRepository }, // 쓰기 토큰 → 같은 인스턴스
];
```

### Repository의 규칙

Repository는 **순수 데이터 접근**만 담당한다:
- 예외를 던지지 않는다 (null 반환, affected count 반환).
- DTO 변환을 하지 않는다.
- 비즈니스 로직을 포함하지 않는다.

---

## 7. 실전: 새 기능 추가 체크리스트

예시: **"게시글 좋아요(Like) 기능"** — `POST /posts/:id/like` 엔드포인트를 추가한다고 가정.

### 파일 생성 순서

```
1단계: Command 객체 생성
   └── src/posts/command/like-post.command.ts

2단계: Command Handler 생성
   └── src/posts/command/like-post.handler.ts

3단계: (필요시) Repository 인터페이스 수정
   └── src/posts/interface/post-write-repository.interface.ts

4단계: Repository 구현 수정
   └── src/posts/post.repository.ts

5단계: Controller에 엔드포인트 추가
   └── src/posts/posts.controller.ts

6단계: Module에 Handler 등록
   └── src/posts/posts.module.ts

7단계: 테스트 작성
   ├── src/posts/command/like-post.handler.spec.ts  (단위 테스트)
   └── test/posts.integration-spec.ts               (통합 테스트 추가)
```

### 각 단계 상세

**1단계 — Command 객체:**

```typescript
// src/posts/command/like-post.command.ts
export class LikePostCommand {
  constructor(public readonly id: number) {}
}
```

**2단계 — Command Handler:**

```typescript
// src/posts/command/like-post.handler.ts
@CommandHandler(LikePostCommand)
export class LikePostHandler implements ICommandHandler<LikePostCommand> {
  constructor(private readonly postWriteRepository: IPostWriteRepository) {}

  async execute(command: LikePostCommand): Promise<void> {
    const affected = await this.postWriteRepository.like(command.id);
    if (affected === 0) {
      throw new NotFoundException(`Post with ID ${command.id} not found`);
    }
  }
}
```

**3단계 — Repository 인터페이스:**

```typescript
// src/posts/interface/post-write-repository.interface.ts에 추가
export abstract class IPostWriteRepository {
  // ... 기존 메서드들
  abstract like(id: number): Promise<number>;
}
```

**5단계 — Controller:**

```typescript
// src/posts/posts.controller.ts에 추가
@Post(':id/like')
@HttpCode(HttpStatus.NO_CONTENT)
async likePost(@Param('id', ParseIntPipe) id: number): Promise<void> {
  await this.commandBus.execute(new LikePostCommand(id));
}
```

**6단계 — Module 등록 (놓치기 쉬움!):**

```typescript
// src/posts/posts.module.ts
const commandHandlers = [
  CreatePostHandler,
  UpdatePostHandler,
  DeletePostHandler,
  LikePostHandler,       // ← 여기에 추가!
];
```

### 체크포인트

- [ ] Command 객체는 순수 값 객체인가? (메서드 없음)
- [ ] Handler 반환 타입이 `void` 또는 `number`인가? (DTO 아님)
- [ ] 검증 로직이 Repository가 아닌 Handler에 있는가?
- [ ] Repository 인터페이스에 도메인 타입을 추가했는가?
- [ ] Module의 `commandHandlers` 배열에 Handler를 등록했는가?
- [ ] 빌드 확인: `pnpm build:local`
- [ ] 테스트 확인: `pnpm test`

---

## 8. 흔한 실수와 해결법

### 실수 1: Command에서 DTO를 반환한다

```typescript
// ❌ 잘못된 예
async execute(command: CreatePostCommand): Promise<PostResponseDto> {
  const post = await this.postWriteRepository.create({ ... });
  return PostResponseDto.of(post);   // Command가 DTO를 반환하면 안 됨
}

// ✅ 올바른 예
async execute(command: CreatePostCommand): Promise<number> {
  const post = await this.postWriteRepository.create({ ... });
  return post.id;                    // ID만 반환
}
```

이유: Command는 상태 변경만 책임진다. 클라이언트가 생성된 데이터를 보고 싶으면 별도의 Query를 실행해야 한다.

### 실수 2: Repository에서 예외를 던진다

```typescript
// ❌ 잘못된 예 (Repository)
async findById(id: number): Promise<Post> {
  const post = await this.postRepository.findOneBy({ id });
  if (!post) throw new NotFoundException('Not found');  // Repository가 예외를 던지면 안 됨
  return post;
}

// ✅ 올바른 예 (Repository)
async findById(id: number): Promise<Post | null> {
  return this.postRepository.findOneBy({ id });  // null 반환
}

// ✅ 올바른 예 (Handler에서 검증)
async execute(query: GetPostByIdQuery): Promise<PostResponseDto> {
  const post = await this.postReadRepository.findById(query.id);
  if (!post) throw new NotFoundException('Not found');  // Handler가 예외를 던진다
  return PostResponseDto.of(post);
}
```

이유: Repository는 순수 데이터 접근만 담당한다. 비즈니스 규칙(존재 여부 검증)은 Handler의 역할이다.

### 실수 3: 하나의 플로우에서 Command + Query를 혼합한다

```typescript
// ❌ 잘못된 예 (Controller)
@Post()
async createPost(@Body() dto: CreatePostRequestDto): Promise<PostResponseDto> {
  await this.commandBus.execute(new CreatePostCommand(...));
  return this.queryBus.execute(new GetPostByIdQuery(???));  // Command 후 Query 혼합
}

// ✅ 올바른 예 (Controller)
@Post()
async createPost(@Body() dto: CreatePostRequestDto): Promise<CreatePostResponseDto> {
  const id = await this.commandBus.execute<CreatePostCommand, number>(
    new CreatePostCommand(dto.title, dto.content, dto.isPublished),
  );
  return CreatePostResponseDto.of(id);  // Command 결과(ID)만 반환
}
```

이유: 생성 후 전체 데이터가 필요하면, 클라이언트가 `GET /posts/:id`를 별도로 호출한다.

### 실수 4: Query 객체에 파생 값을 포함한다

```typescript
// ❌ 잘못된 예
export class FindAllPostsPaginatedQuery {
  constructor(
    public readonly page: number,
    public readonly limit: number,
    public readonly skip: number,     // skip = (page - 1) * limit → 파생 값!
  ) {}
}

// ✅ 올바른 예
export class FindAllPostsPaginatedQuery extends PaginatedQuery {
  constructor(page: number, limit: number) {
    super(page, limit);   // page, limit만 전달
  }
}
// skip 계산은 Repository에서 수행:
// this.postRepository.findAndCount({ skip: (page - 1) * limit, ... })
```

이유: Query 객체는 사용자의 의도만 표현한다. `skip`은 DB 접근 방식에 따른 구현 세부사항이므로 Repository에서 계산한다.

### 실수 5: Module에 Handler를 등록하지 않는다

```typescript
// ❌ Handler를 생성했지만 Module에 등록하지 않음
// → 런타임 에러: "No handler found for LikePostCommand"

// ✅ Module의 providers에 반드시 등록
@Module({
  imports: [CqrsModule],
  controllers: [PostsController],
  providers: [...commandHandlers, ...queryHandlers, ...postRepositoryProviders],
  //            ↑ 여기에 새 Handler가 포함되어 있는지 확인!
})
```

이 에러는 빌드 시 감지되지 않고 **런타임에만 발생**하므로 특히 주의해야 한다.
