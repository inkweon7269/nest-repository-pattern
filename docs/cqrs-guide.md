# CQRS 패턴 종합 가이드

> 이 문서는 이 프로젝트의 실제 코드를 기반으로, CQRS 패턴을 처음 접하는 개발자가 구조를 이해하고 새 기능을 추가할 수 있도록 안내한다. 모든 코드 예시는 프로젝트의 실제 파일에서 발췌했으며, 파일 경로를 명시한다.

---

## 목차

### Part I: 개념 이해
- [1. CQRS란?](#1-cqrs란)
- [2. 전체 흐름 한눈에 보기](#2-전체-흐름-한눈에-보기)

### Part II: 패턴 상세
- [3. Command 패턴 (상태 변경)](#3-command-패턴-상태-변경)
- [4. Query 패턴 (상태 조회)](#4-query-패턴-상태-조회)
- [5. Controller](#5-controller--command와-query의-연결점)
- [6. Repository 패턴 (데이터 접근)](#6-repository-패턴-데이터-접근)

### Part III: DTO와 유효성 검증
- [9. Request DTO 규칙](#9-request-dto-규칙)
- [10. Response DTO 규칙](#10-response-dto-규칙)
- [11. Query Parameter 처리](#11-query-parameter-처리-페이지네이션--필터)

### Part IV: 인프라스트럭처
- [12. DI 심화: 왜 abstract class인가](#12-di-심화-왜-abstract-class인가)
- [13. Entity와 Migration](#13-entity와-migration)
- [14. 환경 설정과 Swagger](#14-환경-설정과-swagger)

### Part V: 테스트
- [15. 테스트 전략 요약](#15-테스트-전략-요약)
- [16. 단위 테스트 작성법](#16-단위-테스트-작성법)
- [17. 통합 테스트 작성법](#17-통합-테스트-작성법)

### Part VI: 실전
- [7. 새 기능 추가 체크리스트](#7-실전-새-기능-추가-체크리스트)
- [18. 새 도메인 모듈 추가 체크리스트](#18-새-도메인-모듈-추가-체크리스트)
- [8. 흔한 실수와 해결법](#8-흔한-실수와-해결법)
- [19. 파일 구조 빠른 참조](#19-파일-구조-빠른-참조)

---

## Part I: 개념 이해

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

## Part II: 패턴 상세

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

#### 패턴 A: 생성 + 중복 검증

`src/posts/command/create-post.handler.ts`:

```typescript
@CommandHandler(CreatePostCommand)
export class CreatePostHandler implements ICommandHandler<CreatePostCommand> {
  constructor(
    private readonly postReadRepository: IPostReadRepository,
    private readonly postWriteRepository: IPostWriteRepository,
  ) {}

  async execute(command: CreatePostCommand): Promise<number> {
    // 1. 중복 title 검증 — ReadRepository로 기존 데이터 확인
    const existing = await this.postReadRepository.findByTitle(command.title);
    if (existing) {
      throw new ConflictException(
        `Post with title '${command.title}' already exists`,
      );
    }

    // 2. Repository에 데이터 전달 → 생성된 Post 반환
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
- **중복 검증이 필요하면 ReadRepository도 주입**한다. Command Handler가 반드시 WriteRepository만 사용하는 것은 아니다.
- `ConflictException` (409)으로 비즈니스 규칙 위반을 표현한다.

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

### Command Handler 패턴 정리

| 패턴 | 검증 방식 | Repository 주입 | 반환 타입 | 예시 |
|------|-----------|----------------|-----------|------|
| A: 생성 + 중복 검증 | ReadRepository로 기존 데이터 확인 | Read + Write | `number` (ID) | `CreatePostHandler` |
| B: 수정/삭제 | affected count === 0 체크 | Write | `void` | `UpdatePostHandler`, `DeletePostHandler` |

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
| 주입 대상 | `IPostWriteRepository` (+ 필요시 Read) | `IPostReadRepository` |
| 반환 타입 | `void` 또는 `number` | `PostResponseDto` 등 DTO |
| DTO 변환 | 하지 않음 | `static of()`로 수행 |
| 검증 | `affected === 0` 체크 또는 중복 체크 | `null` 체크 |
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
| 중복 title로 생성 | Command | 409 Conflict | 에러 메시지 |

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
├── findByTitle()                  ├── update()
└── findAllPaginated()             └── delete()
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
  abstract findByTitle(title: string): Promise<Post | null>;
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

## Part III: DTO와 유효성 검증

---

## 9. Request DTO 규칙

Request DTO는 HTTP 요청 바디/쿼리 파라미터를 타입 안전하게 받고 유효성을 검증한다.

### ValidationPipe 설정

`src/main.ts`:

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,              // DTO에 정의되지 않은 속성 자동 제거
    forbidNonWhitelisted: true,   // 미정의 속성이 있으면 400 에러
    transform: true,              // 쿼리 파라미터 문자열 → 타입 자동 변환
  }),
);
```

| 옵션 | 역할 | 예시 |
|------|------|------|
| `whitelist` | DTO에 없는 필드 제거 | `{ title: "Hi", hacked: true }` → `hacked` 제거 |
| `forbidNonWhitelisted` | 미지 필드가 있으면 400 반환 | `{ hacked: true }` → `400 Bad Request` |
| `transform` | 문자열을 타입에 맞게 변환 | `"1"` → `1` (with `@Type(() => Number)`) |

### class-validator 데코레이터 레퍼런스

이 프로젝트에서 사용하는 주요 데코레이터:

| 데코레이터 | 용도 | 예시 |
|-----------|------|------|
| `@IsString()` | 문자열 타입 검증 | `title: string` |
| `@IsNotEmpty()` | 빈 문자열 거부 | `title`은 비어 있으면 안 됨 |
| `@IsOptional()` | `undefined`/`null` 허용 | `isPublished?: boolean` |
| `@IsBoolean()` | boolean 타입 검증 | `isPublished: boolean` |
| `@IsInt()` | 정수 타입 검증 | `page: number` |
| `@Min(n)` | 최솟값 제한 | `@Min(1) page: number` |
| `@Max(n)` | 최댓값 제한 | `@Max(100) limit: number` |

### 생성 DTO vs 수정 DTO 비교

**`CreatePostRequestDto`** (`src/posts/dto/request/create-post.request.dto.ts`):

```typescript
export class CreatePostRequestDto {
  @ApiProperty({ description: '게시글 제목', example: 'First Post' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: '게시글 내용', example: 'Hello World' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: '공개 여부', default: false })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;           // ← 선택 필드
}
```

**`UpdatePostRequestDto`** (`src/posts/dto/request/update-post.request.dto.ts`):

```typescript
export class UpdatePostRequestDto {
  @ApiProperty({ description: '게시글 제목', example: 'Updated Title' })
  @IsString()
  title: string;

  @ApiProperty({ description: '게시글 내용', example: 'Updated Content' })
  @IsString()
  content: string;

  @ApiProperty({ description: '공개 여부' })
  @IsBoolean()
  isPublished: boolean;            // ← 모두 필수 필드
}
```

| 항목 | Create DTO | Update DTO |
|------|-----------|-----------|
| `isPublished` | `@IsOptional()` — 생략 가능 | 필수 — 생략 시 400 |
| Swagger | `@ApiPropertyOptional` (선택) | `@ApiProperty` (필수) |
| 의미 | 기본값 사용 가능 | 전체 업데이트 (모든 필드 전송) |

### @ApiProperty 매핑 규칙

| 필드 특성 | 데코레이터 | Swagger UI |
|-----------|-----------|------------|
| 필수 필드 | `@ApiProperty()` | Required로 표시 |
| 선택 필드 | `@ApiPropertyOptional()` | Optional로 표시, 기본값 표시 |

---

## 10. Response DTO 규칙

Response DTO는 Entity를 클라이언트에게 노출할 형태로 변환한다.

### 핵심 규칙

- **`static of()` 팩토리 메서드**로 Entity → DTO 변환을 캡슐화한다.
- Response DTO에는 **`class-validator` 데코레이터를 사용하지 않는다** (응답은 검증 대상이 아님).
- `@ApiProperty`만 사용하여 Swagger 문서를 생성한다.

### 일반 응답: PostResponseDto

`src/posts/dto/response/post.response.dto.ts`:

```typescript
export class PostResponseDto {
  @ApiProperty({ description: '게시글 ID', example: 1 })
  id: number;

  @ApiProperty({ description: '게시글 제목', example: 'First Post' })
  title: string;

  @ApiProperty({ description: '게시글 내용', example: 'Hello World' })
  content: string;

  @ApiProperty({ description: '공개 여부', example: false })
  isPublished: boolean;

  @ApiProperty({ description: '생성일시' })
  createdAt: Date;

  @ApiProperty({ description: '수정일시' })
  updatedAt: Date;

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

### Command 결과용 최소 응답: CreatePostResponseDto

생성 Command는 ID만 반환하므로, 최소한의 응답 DTO를 사용한다.

`src/posts/dto/response/create-post.response.dto.ts`:

```typescript
export class CreatePostResponseDto {
  @ApiProperty({ description: '생성된 게시글 ID', example: 1 })
  id: number;

  static of(id: number): CreatePostResponseDto {
    const dto = new CreatePostResponseDto();
    dto.id = id;
    return dto;
  }
}
```

### 페이지네이션 래퍼: PaginatedResponseDto<T>

`src/common/dto/response/paginated.response.dto.ts`:

```typescript
export class PaginationMeta {
  @ApiProperty({ description: '현재 페이지 번호', example: 1 })
  page: number;

  @ApiProperty({ description: '페이지당 항목 수', example: 10 })
  limit: number;

  @ApiProperty({ description: '전체 항목 수', example: 100 })
  totalElements: number;

  @ApiProperty({ description: '전체 페이지 수', example: 10 })
  totalPages: number;

  @ApiProperty({ description: '첫 페이지 여부', example: true })
  isFirst: boolean;

  @ApiProperty({ description: '마지막 페이지 여부', example: false })
  isLast: boolean;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ description: '항목 목록', isArray: true })
  items: T[];

  @ApiProperty({ description: '페이지네이션 메타 정보', type: PaginationMeta })
  meta: PaginationMeta;

  static of<T>(
    items: T[],
    totalElements: number,
    page: number,
    limit: number,
  ): PaginatedResponseDto<T> {
    const dto = new PaginatedResponseDto<T>();
    const totalPages = Math.ceil(totalElements / limit);

    dto.items = items;
    dto.meta = {
      page,
      limit,
      totalElements,
      totalPages,
      isFirst: page === 1,
      isLast: page >= totalPages,
    };

    return dto;
  }
}
```

이 제네릭 클래스는 다른 도메인에서도 재사용 가능하다: `PaginatedResponseDto<CommentResponseDto>` 등.

---

## 11. Query Parameter 처리 (페이지네이션 + 필터)

### 문제: HTTP query param은 항상 문자열이다

```text
GET /posts?page=2&limit=5&isPublished=true
```

이 요청에서 `page`, `limit`, `isPublished`는 모두 **문자열**로 전달된다:
- `"2"` (string, 아니라 number 아님)
- `"5"` (string)
- `"true"` (string, boolean 아님)

`class-transformer`의 `@Type`과 `@Transform`으로 변환해야 한다.

### PaginationRequestDto 베이스 클래스

`src/common/dto/request/pagination.request.dto.ts`:

```typescript
export class PaginationRequestDto {
  @ApiPropertyOptional({ description: '페이지 번호 (1-based)', default: 1 })
  @Type(() => Number)         // ← 문자열 "2" → 숫자 2로 변환
  @IsInt()
  @Min(1)
  page: number = 1;           // ← 기본값: 1

  @ApiPropertyOptional({
    description: '페이지당 항목 수',
    default: 10,
    maximum: 100,
  })
  @Type(() => Number)         // ← 문자열 "5" → 숫자 5로 변환
  @IsInt()
  @Min(1)
  @Max(100)                   // ← 최대 100개로 제한
  limit: number = 10;         // ← 기본값: 10
}
```

포인트:
- `@Type(() => Number)`: `class-transformer`가 문자열을 숫자로 변환한다.
- 기본값 설정: 쿼리 파라미터 생략 시 `page=1`, `limit=10`이 적용된다.
- `@Min(1)`, `@Max(100)`: 범위를 제한하여 잘못된 입력을 방지한다.

### 도메인별 필터 확장

`src/posts/dto/request/find-posts.request.dto.ts`:

```typescript
export class PostsPaginationRequestDto extends PaginationRequestDto {
  @ApiPropertyOptional({ description: '공개 여부 필터', example: true })
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;              // 다른 값은 그대로 → @IsBoolean()에서 거부됨
  })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}
```

`@Transform`이 필요한 이유:
- 쿼리 파라미터 `isPublished=true`는 문자열 `"true"`로 전달된다.
- `@Type(() => Boolean)`은 `"false"` → `true`로 변환한다 (truthy 문자열이므로). **사용하면 안 된다.**
- `@Transform`으로 정확한 매핑: `"true"` → `true`, `"false"` → `false`.

### 전체 데이터 흐름도

```text
GET /posts?page=2&limit=5&isPublished=true

  1. HTTP 요청 수신
     └─ { page: "2", limit: "5", isPublished: "true" }   ← 모두 문자열

  2. ValidationPipe + class-transformer
     └─ @Type(() => Number): "2" → 2, "5" → 5
     └─ @Transform: "true" → true
     └─ PostsPaginationRequestDto { page: 2, limit: 5, isPublished: true }

  3. Controller → Query 객체 생성
     └─ new FindAllPostsPaginatedQuery(2, 5, { isPublished: true })

  4. Query Handler → Repository 호출
     └─ postReadRepository.findAllPaginated(2, 5, { isPublished: true })

  5. Repository → SQL 실행
     └─ SELECT * FROM posts WHERE "isPublished" = true
        ORDER BY id DESC LIMIT 5 OFFSET 5

  6. Handler → DTO 변환
     └─ PaginatedResponseDto.of(items, totalElements, 2, 5)

  7. 응답
     └─ { items: [...], meta: { page: 2, limit: 5, ... } }
```

---

## Part IV: 인프라스트럭처

---

## 12. DI 심화: 왜 abstract class인가

### 문제: TypeScript interface는 런타임에 사라진다

```typescript
// ❌ 이렇게 하면 안 됨
interface IPostReadRepository {
  findById(id: number): Promise<Post | null>;
}

// NestJS는 런타임에 IPostReadRepository를 찾을 수 없다
// → "Nest can't resolve dependencies" 에러
constructor(private readonly repo: IPostReadRepository) {}
```

TypeScript의 `interface`는 컴파일 후 JavaScript에 존재하지 않는다. NestJS의 DI 컨테이너는 **런타임에 토큰을 매칭**하므로, 사라진 interface를 토큰으로 사용할 수 없다.

### 해결: abstract class를 DI 토큰 겸 인터페이스로 사용

```typescript
// ✅ abstract class는 런타임에도 존재한다
export abstract class IPostReadRepository {
  abstract findById(id: number): Promise<Post | null>;
  abstract findByTitle(title: string): Promise<Post | null>;
  abstract findAllPaginated(...): Promise<[Post[], number]>;
}
```

abstract class는:
- 컴파일 후에도 JavaScript 클래스로 남는다 → DI 토큰으로 사용 가능.
- `abstract` 키워드로 직접 인스턴스화를 방지한다 → interface와 동일한 역할.
- `implements` 키워드로 구현을 강제한다.

### useExisting 패턴: 하나의 구현체, 두 개의 토큰

`src/posts/post-repository.provider.ts`:

```typescript
export const postRepositoryProviders: Provider[] = [
  PostRepository,                                          // ① 실제 클래스 등록
  { provide: IPostReadRepository, useExisting: PostRepository },  // ② 읽기 토큰 → ①의 인스턴스
  { provide: IPostWriteRepository, useExisting: PostRepository }, // ③ 쓰기 토큰 → ①의 인스턴스
];
```

DI 컨테이너 내부 다이어그램:

```text
NestJS DI 컨테이너
┌──────────────────────────────────────────────┐
│                                              │
│  토큰                         인스턴스        │
│  ─────────────────────────────────────       │
│  PostRepository        ───→  [instance]      │
│  IPostReadRepository   ───→  [instance]  ←── 동일 인스턴스
│  IPostWriteRepository  ───→  [instance]  ←── (useExisting)
│                                              │
└──────────────────────────────────────────────┘
```

`useExisting`은 새 인스턴스를 만들지 않고, **기존에 등록된 인스턴스를 가리키는 별칭(alias)**을 만든다.

### TypeOrmModule.forFeature() 미사용 이유

일반적인 NestJS + TypeORM 프로젝트:

```typescript
// 일반적인 방식 — 이 프로젝트에서는 사용하지 않음
@Module({
  imports: [TypeOrmModule.forFeature([Post])],
})
```

이 프로젝트에서는 `BaseRepository`가 `DataSource`를 직접 주입받아 Repository에 접근한다.

`src/common/base.repository.ts`:

```typescript
export abstract class BaseRepository {
  constructor(private readonly dataSource: DataSource) {}

  private getEntityManager(entityManager?: EntityManager): EntityManager {
    return entityManager ?? this.dataSource.manager;
  }

  protected getRepository<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    entityManager?: EntityManager,
  ): Repository<T> {
    return this.getEntityManager(entityManager).getRepository(entity);
  }
}
```

이 방식의 핵심 이점: **`this.dataSource.manager`를 교체하면 모든 DB 호출이 특정 트랜잭션 안에서 실행된다.** 이것이 통합 테스트의 per-test 트랜잭션 롤백을 가능하게 한다 (→ [17. 통합 테스트 작성법](#17-통합-테스트-작성법) 참고).

```text
PostRepository.findById(id)
  → BaseRepository.getRepository(Post)
    → this.getEntityManager()
      → this.dataSource.manager.getRepository(Post)
                        ↑
              이 지점을 교체하면 모든 DB 호출이 트랜잭션 안에서 실행됨
```

### PostRepository 구현체

`src/posts/post.repository.ts`:

```typescript
@Injectable()
export class PostRepository
  extends BaseRepository
  implements IPostReadRepository, IPostWriteRepository
{
  constructor(dataSource: DataSource) {
    super(dataSource);       // BaseRepository에 DataSource 전달
  }

  private get postRepository() {
    return this.getRepository(Post);  // BaseRepository.getRepository() 사용
  }

  async findById(id: number): Promise<Post | null> {
    return this.postRepository.findOneBy({ id });
  }

  async findAllPaginated(
    page: number,
    limit: number,
    filter: PostFilter = {},
  ): Promise<[Post[], number]> {
    const where: FindOptionsWhere<Post> = {};
    if (filter.isPublished !== undefined) {
      where.isPublished = filter.isPublished;
    }
    return this.postRepository.findAndCount({
      where,
      skip: (page - 1) * limit,    // ← skip 계산은 Repository에서 수행
      take: limit,
      order: { id: 'DESC' },
    });
  }

  // ... create, update, delete 메서드
}
```

---

## 13. Entity와 Migration

### Post Entity

`src/posts/entities/post.entity.ts`:

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('posts')                           // ← 테이블명: posts
export class Post {
  @PrimaryGeneratedColumn()                // ← 자동 증가 PK
  id: number;

  @Column({ length: 200, unique: true })   // ← varchar(200), UNIQUE 제약조건
  title: string;

  @Column({ type: 'text' })               // ← TEXT 타입 (길이 제한 없음)
  content: string;

  @Column({ default: false })             // ← 기본값: false
  isPublished: boolean;

  @CreateDateColumn()                      // ← INSERT 시 자동으로 현재 시각
  createdAt: Date;

  @UpdateDateColumn()                      // ← UPDATE 시 자동으로 현재 시각
  updatedAt: Date;
}
```

| 데코레이터 | 역할 |
|-----------|------|
| `@Entity('posts')` | 이 클래스를 `posts` 테이블에 매핑 |
| `@PrimaryGeneratedColumn()` | auto-increment 기본키 |
| `@Column({ length: 200 })` | `varchar(200)` 컬럼 |
| `@Column({ type: 'text' })` | `text` 타입 컬럼 |
| `@Column({ default: false })` | 기본값이 있는 컬럼 |
| `@CreateDateColumn()` | INSERT 시 자동 timestamp |
| `@UpdateDateColumn()` | UPDATE 시 자동 timestamp |

### synchronize: false — 모든 스키마 변경은 migration 필수

이 프로젝트에서는 `synchronize`가 모든 환경에서 `false`이다. Entity를 수정해도 DB 스키마가 자동으로 변경되지 않으므로, **반드시 migration을 생성하고 실행해야 한다.**

### Migration 명령어 레퍼런스

```bash
# 엔티티 변경 사항을 감지하여 migration 자동 생성
pnpm migration:generate:local -- src/migrations/CreatePostTable

# 빈 migration 템플릿 생성 (수동으로 SQL 작성)
pnpm migration:create -- src/migrations/AddCategoryToPost

# migration 실행
pnpm migration:local        # 로컬 DB
pnpm migration:dev           # dev DB
pnpm migration:prod          # prod DB

# 마지막 migration 롤백
pnpm migration:revert:local
```

### 실제 Migration 예시

**테이블 생성** (`src/migrations/1770456974651-CreatePostTable.ts`):

```typescript
export class CreatePostTable1770456974651 implements MigrationInterface {
  name = 'CreatePostTable1770456974651';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'posts',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'title', type: 'varchar', length: '200' },
          { name: 'content', type: 'text' },
          { name: 'isPublished', type: 'boolean', default: false },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('posts');
  }
}
```

**제약조건 추가** (`src/migrations/1771663440634-AddUniqueTitleToPost.ts`):

```typescript
export class AddUniqueTitleToPost1771663440634 implements MigrationInterface {
  name = 'AddUniqueTitleToPost1771663440634';

  private readonly uniqueConstraint = new TableUnique({
    name: 'UQ_posts_title',
    columnNames: ['title'],
  });

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createUniqueConstraint('posts', this.uniqueConstraint);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropUniqueConstraint('posts', this.uniqueConstraint);
  }
}
```

### Migration 워크플로우

```text
1. Entity 수정 (예: Post에 새 컬럼 추가)
   └── src/posts/entities/post.entity.ts

2. Migration 자동 생성
   └── pnpm migration:generate:local -- src/migrations/AddCategoryToPost
   └── → src/migrations/TIMESTAMP-AddCategoryToPost.ts 파일 생성됨

3. 생성된 migration 파일 검토
   └── up()과 down() 메서드가 올바른지 확인

4. Migration 실행
   └── pnpm migration:local

5. 빌드 + 테스트
   └── pnpm build:local && pnpm test && pnpm test:e2e
```

---

## 14. 환경 설정과 Swagger

### 환경 변수 로드 메커니즘

`cross-env NODE_ENV=local` → `ConfigModule`이 `.env.local` 파일을 로드한다.

`src/app.module.ts`:

```typescript
const nodeEnv = process.env.NODE_ENV || 'local';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${nodeEnv}`,    // ← .env.local, .env.development, .env.production
    }),
    TypeOrmModule.forRootAsync({          // ← forRoot 아닌 forRootAsync 사용 (eager evaluation 방지)
      useFactory: () => ({
        ...createDataSourceOptions(process.env),
        synchronize: false,
        migrationsRun: nodeEnv === 'production',
      }),
    }),
    PostsModule,
  ],
})
export class AppModule {}
```

환경 파일:
- `.env.local` — 로컬 개발용
- `.env.development` — dev 서버용
- `.env.production` — 프로덕션용
- `.env.example` — 템플릿 (Git에 포함)

### Swagger 설정

`src/main.ts`:

```typescript
const config = new DocumentBuilder()
  .setTitle('Posts API')
  .setDescription('NestJS Repository Pattern CRUD API')
  .setVersion('1.0')
  .build();
const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api', app, document);   // ← /api 경로에서 접근
```

서버 실행 후 `http://localhost:3000/api`에서 Swagger UI를 확인할 수 있다.

### Swagger 데코레이터

| 데코레이터 | 위치 | 용도 |
|-----------|------|------|
| `@ApiTags('Posts')` | Controller 클래스 | Swagger UI에서 그룹핑 |
| `@ApiOperation({ summary: '...' })` | Controller 메서드 | 각 엔드포인트 설명 |
| `@ApiProperty()` | DTO 필드 | 필수 필드 문서화 |
| `@ApiPropertyOptional()` | DTO 필드 | 선택 필드 문서화 |

---

## Part V: 테스트

---

## 15. 테스트 전략 요약

### Classical School 원칙

> **로직은 단위 테스트, 연결(wiring)은 통합 테스트.** pass-through 레이어의 단위 테스트는 작성하지 않는다.

자세한 내용은 [`docs/testing-strategy.md`](./testing-strategy.md) 참고.

### 어떤 파일에 단위 테스트가 필요한지

| 파일 유형 | 분기 로직 있는가? | 단위 테스트 | 통합 테스트 |
|-----------|-----------------|-----------|-----------|
| Handler (`affected===0` 체크) | O | O | O |
| Handler (`ConflictException` 검증) | O | O | O |
| DTO `of()` 팩토리 | O (변환 로직) | O | - |
| Controller | X (pass-through) | X | O |
| Repository | X (pass-through) | X | O |

결정 기준:
- **분기문(if/else)이 있는가?** → 있으면 단위 테스트 작성
- **데이터 변환 로직이 있는가?** → 있으면 단위 테스트 작성
- **단순 위임인가?** → 통합 테스트로 커버

### 이 프로젝트의 현재 테스트 구조

```text
단위 테스트 (src/**/*.spec.ts):
├── create-post.handler.spec.ts        ← ConflictException 검증
├── update-post.handler.spec.ts        ← NotFoundException (affected===0)
├── delete-post.handler.spec.ts        ← NotFoundException (affected===0)
├── get-post-by-id.handler.spec.ts     ← NotFoundException (null 체크) + DTO 변환
├── find-all-posts-paginated.handler.spec.ts ← DTO 변환 + 페이지네이션
├── post.response.dto.spec.ts          ← of() 필드 매핑
└── paginated.response.dto.spec.ts     ← of() 메타 계산

통합 테스트 (test/**/*.integration-spec.ts):
└── posts.integration-spec.ts          ← 전체 HTTP 플로우 + DB
```

---

## 16. 단위 테스트 작성법

### Command Handler 단위 테스트 템플릿

`src/posts/command/update-post.handler.spec.ts` (핵심 예시):

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UpdatePostHandler } from '@src/posts/command/update-post.handler';
import { UpdatePostCommand } from '@src/posts/command/update-post.command';
import { IPostWriteRepository } from '@src/posts/interface/post-write-repository.interface';

describe('UpdatePostHandler', () => {
  let handler: UpdatePostHandler;
  let mockWriteRepository: jest.Mocked<IPostWriteRepository>;

  beforeEach(async () => {
    // 1. Mock 생성 — interface의 모든 메서드를 jest.fn()으로 채운다
    mockWriteRepository = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    // 2. 테스트 모듈 구성 — Handler + mock Repository
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdatePostHandler,
        { provide: IPostWriteRepository, useValue: mockWriteRepository },
      ],
    }).compile();

    handler = module.get(UpdatePostHandler);
  });

  // 3. 성공 케이스
  it('존재하는 게시글을 수정하면 void를 반환한다', async () => {
    mockWriteRepository.update.mockResolvedValue(1);  // affected = 1

    const command = new UpdatePostCommand(1, 'Updated Title', 'Content', false);
    const result = await handler.execute(command);

    expect(result).toBeUndefined();
  });

  // 4. 실패 케이스 — 분기 검증
  it('존재하지 않는 게시글을 수정하면 NotFoundException을 발생시킨다', async () => {
    mockWriteRepository.update.mockResolvedValue(0);  // affected = 0

    const command = new UpdatePostCommand(999, 'Updated Title', 'Content', false);

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });
});
```

### 중복 검증이 있는 Command Handler 테스트

`src/posts/command/create-post.handler.spec.ts`:

```typescript
describe('CreatePostHandler', () => {
  let handler: CreatePostHandler;
  let mockReadRepository: jest.Mocked<IPostReadRepository>;
  let mockWriteRepository: jest.Mocked<IPostWriteRepository>;

  beforeEach(async () => {
    mockReadRepository = {
      findById: jest.fn(),
      findByTitle: jest.fn(),
      findAllPaginated: jest.fn(),
    };

    mockWriteRepository = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatePostHandler,
        { provide: IPostReadRepository, useValue: mockReadRepository },
        { provide: IPostWriteRepository, useValue: mockWriteRepository },
      ],
    }).compile();

    handler = module.get(CreatePostHandler);
  });

  it('중복되지 않는 제목이면 게시글을 생성하고 id를 반환한다', async () => {
    mockReadRepository.findByTitle.mockResolvedValue(null);
    mockWriteRepository.create.mockResolvedValue({ id: 1 } as Post);

    const command = new CreatePostCommand('New Title', 'Content', false);
    const result = await handler.execute(command);

    expect(result).toBe(1);
    expect(mockReadRepository.findByTitle).toHaveBeenCalledWith('New Title');
  });

  it('동일한 제목이 이미 존재하면 ConflictException을 발생시킨다', async () => {
    mockReadRepository.findByTitle.mockResolvedValue({ id: 1 } as Post);

    const command = new CreatePostCommand('Duplicate Title', 'Content');

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
    expect(mockWriteRepository.create).not.toHaveBeenCalled();  // 생성 호출 안 됨
  });
});
```

### Query Handler 단위 테스트 템플릿

`src/posts/query/get-post-by-id.handler.spec.ts`:

```typescript
describe('GetPostByIdHandler', () => {
  let handler: GetPostByIdHandler;
  let mockReadRepository: jest.Mocked<IPostReadRepository>;

  const now = new Date();
  const mockPost: Post = {
    id: 1,
    title: 'Test Post',
    content: 'Test Content',
    isPublished: false,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(async () => {
    mockReadRepository = {
      findById: jest.fn(),
      findByTitle: jest.fn(),
      findAllPaginated: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetPostByIdHandler,
        { provide: IPostReadRepository, useValue: mockReadRepository },
      ],
    }).compile();

    handler = module.get(GetPostByIdHandler);
  });

  it('존재하는 게시글을 조회하면 PostResponseDto를 반환한다', async () => {
    mockReadRepository.findById.mockResolvedValue(mockPost);

    const query = new GetPostByIdQuery(1);
    const result = await handler.execute(query);

    expect(result).toBeInstanceOf(PostResponseDto);  // ← DTO 변환 검증
    expect(result.id).toBe(1);
    expect(result.title).toBe('Test Post');
  });

  it('존재하지 않는 게시글을 조회하면 NotFoundException을 발생시킨다', async () => {
    mockReadRepository.findById.mockResolvedValue(null);

    const query = new GetPostByIdQuery(999);

    await expect(handler.execute(query)).rejects.toThrow(NotFoundException);
  });
});
```

### DTO 단위 테스트 템플릿

`src/posts/dto/response/post.response.dto.spec.ts`:

```typescript
describe('PostResponseDto', () => {
  const now = new Date();

  const createPost = (overrides: Partial<Post> = {}): Post => {
    const post = new Post();
    post.id = 1;
    post.title = 'Test Title';
    post.content = 'Test Content';
    post.isPublished = false;
    post.createdAt = now;
    post.updatedAt = now;
    Object.assign(post, overrides);
    return post;
  };

  describe('of', () => {
    it('should map all Post entity fields to DTO', () => {
      const post = createPost();
      const dto = PostResponseDto.of(post);

      expect(dto.id).toBe(post.id);
      expect(dto.title).toBe(post.title);
      expect(dto.content).toBe(post.content);
      expect(dto.isPublished).toBe(post.isPublished);
      expect(dto.createdAt).toBe(post.createdAt);
      expect(dto.updatedAt).toBe(post.updatedAt);
    });

    it('should return an instance of PostResponseDto', () => {
      const post = createPost();
      const dto = PostResponseDto.of(post);

      expect(dto).toBeInstanceOf(PostResponseDto);
    });
  });
});
```

### jest.Mocked<T> 패턴

```typescript
// abstract class의 모든 abstract 메서드를 jest.fn()으로 구현
let mockReadRepository: jest.Mocked<IPostReadRepository>;

mockReadRepository = {
  findById: jest.fn(),          // 각 메서드를 jest.fn()으로 설정
  findByTitle: jest.fn(),
  findAllPaginated: jest.fn(),
};

// 반환값 설정
mockReadRepository.findById.mockResolvedValue(mockPost);

// 호출 검증
expect(mockReadRepository.findById).toHaveBeenCalledWith(1);
```

---

## 17. 통합 테스트 작성법

### 인프라 구조: Testcontainers + globalSetup/globalTeardown

```text
globalSetup (1회 실행)
├── PostgreSQL 컨테이너 기동 (Testcontainers)
├── migration 실행
└── 접속 정보를 .test-env.json에 기록

테스트 실행 (각 테스트 파일)
├── createIntegrationApp() — 실제 AppModule로 앱 생성
├── beforeEach: BEGIN TRANSACTION
├── 테스트 실행 (실제 DB 사용)
└── afterEach: ROLLBACK (데이터 원복)

globalTeardown (1회 실행)
├── 컨테이너 종료
└── .test-env.json 삭제
```

### globalSetup: 컨테이너 기동 + migration

`test/setup/global-setup.ts`:

```typescript
export default async function globalSetup() {
  // 1. PostgreSQL 컨테이너 기동
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();

  // 2. 접속 정보 저장
  const env = {
    DB_HOST: container.getHost(),
    DB_PORT: container.getPort().toString(),
    DB_USERNAME: container.getUsername(),
    DB_PASSWORD: container.getPassword(),
    DB_DATABASE: container.getDatabase(),
  };
  writeFileSync(TEST_ENV_PATH, JSON.stringify(env, null, 2));

  // 3. Migration 실행
  const dataSource = new DataSource({
    ...createDataSourceOptions(env),
    synchronize: false,
  });
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();

  // 4. 컨테이너를 글로벌에 저장 (teardown에서 종료)
  (globalThis as any).__TEST_CONTAINER__ = container;
}
```

### createIntegrationApp(): 실제 앱 생성

`test/setup/integration-helper.ts`:

```typescript
export async function createIntegrationApp(): Promise<INestApplication<App>> {
  // .test-env.json에서 접속 정보 로드
  const env = JSON.parse(readFileSync(TEST_ENV_PATH, 'utf-8'));
  Object.assign(process.env, env);

  // 실제 AppModule로 앱 생성 (mock 없음)
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}
```

### useTransactionRollback(): per-test 트랜잭션 격리

`test/setup/integration-helper.ts`:

```typescript
export function useTransactionRollback(
  app: INestApplication<App>,
): TransactionHelper {
  const dataSource = app.get(DataSource);
  let queryRunner: QueryRunner;
  let originalManager: EntityManager;

  return {
    async start() {
      originalManager = dataSource.manager;
      queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      // dataSource.manager를 트랜잭션 매니저로 교체
      Object.defineProperty(dataSource, 'manager', {
        value: queryRunner.manager,
        writable: true,
        configurable: true,
      });
    },
    async rollback() {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      // 원래 매니저 복원
      Object.defineProperty(dataSource, 'manager', {
        value: originalManager,
        writable: true,
        configurable: true,
      });
    },
  };
}
```

동작 원리:
1. `beforeEach`: `dataSource.manager`를 트랜잭션 안의 EntityManager로 교체
2. 테스트 실행: 모든 DB 호출이 이 트랜잭션 안에서 실행됨
3. `afterEach`: `ROLLBACK` → 테스트 중 생성된 모든 데이터가 사라짐
4. 다음 테스트는 깨끗한 DB에서 시작

이것이 가능한 이유: `BaseRepository.getRepository()`가 항상 `this.dataSource.manager`를 경유하기 때문 (→ [12. DI 심화](#12-di-심화-왜-abstract-class인가) 참고).

### 통합 테스트 보일러플레이트 템플릿

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createIntegrationApp,
  useTransactionRollback,
  TransactionHelper,
} from './setup/integration-helper';

describe('Posts (integration)', () => {
  let app: INestApplication<App>;
  let txHelper: TransactionHelper;

  // ① 앱 생성 (1회)
  beforeAll(async () => {
    app = await createIntegrationApp();
    txHelper = useTransactionRollback(app);
  });

  // ② 테스트별 트랜잭션 시작/롤백
  beforeEach(() => txHelper.start());
  afterEach(() => txHelper.rollback());

  // ③ 앱 종료
  afterAll(async () => {
    if (app) await app.close();
  });

  // ④ 헬퍼 함수: 중복 코드 방지
  function createPost(body: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/posts')
      .send({ title: 'Default Title', content: 'Default Content', ...body });
  }

  async function createAndGet(body: Record<string, unknown> = {}) {
    const createRes = await createPost(body).expect(201);
    const id = createRes.body.id as number;
    const getRes = await request(app.getHttpServer())
      .get(`/posts/${id}`)
      .expect(200);
    return getRes;
  }

  // ⑤ 테스트 케이스
  describe('POST /posts', () => {
    it('should create a post and return { id }', async () => {
      const res = await createPost({
        title: 'Integration Test',
        content: 'Real DB',
      }).expect(201);

      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe('number');
      expect(Object.keys(res.body)).toEqual(['id']);
    });

    it('should return 400 when title is missing', () => {
      return request(app.getHttpServer())
        .post('/posts')
        .send({ content: 'No title' })
        .expect(400);
    });

    it('should return 409 when creating a post with duplicate title', async () => {
      await createPost({ title: 'Unique Title', content: 'First' }).expect(201);

      const res = await createPost({
        title: 'Unique Title',
        content: 'Second',
      }).expect(409);

      expect(res.body.message).toContain('Unique Title');
    });
  });
});
```

### 헬퍼 함수 패턴

| 함수 | 용도 | 반환 |
|------|------|------|
| `createPost(body)` | 게시글 생성 요청 | `supertest.Test` (체이닝 가능) |
| `createAndGet(body)` | 생성 후 GET으로 조회 | 전체 응답 (`Response`) |

이 패턴으로 테스트 코드 중복을 줄이면서도, 각 테스트의 의도를 명확히 표현할 수 있다.

### 실행 방법

```bash
# Docker 필수 (Testcontainers가 PostgreSQL 컨테이너를 기동함)
pnpm test:e2e
```

`test/jest-e2e.json`에서 `maxWorkers: 1`로 설정되어 있다. 이유:
- 모든 테스트가 **동일한 PostgreSQL 컨테이너**를 공유한다.
- 병렬 실행 시 트랜잭션 격리가 깨질 수 있다.
- 파일 간 격리는 `useTransactionRollback`이 담당하므로, 순차 실행이면 충분하다.

---

## Part VI: 실전

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

**7단계 — 테스트 작성:**

단위 테스트 (`src/posts/command/like-post.handler.spec.ts`):

```typescript
describe('LikePostHandler', () => {
  let handler: LikePostHandler;
  let mockWriteRepository: jest.Mocked<IPostWriteRepository>;

  beforeEach(async () => {
    mockWriteRepository = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      like: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        LikePostHandler,
        { provide: IPostWriteRepository, useValue: mockWriteRepository },
      ],
    }).compile();

    handler = module.get(LikePostHandler);
  });

  it('존재하는 게시글에 좋아요를 누르면 void를 반환한다', async () => {
    mockWriteRepository.like.mockResolvedValue(1);
    const result = await handler.execute(new LikePostCommand(1));
    expect(result).toBeUndefined();
  });

  it('존재하지 않는 게시글에 좋아요를 누르면 NotFoundException을 발생시킨다', async () => {
    mockWriteRepository.like.mockResolvedValue(0);
    await expect(handler.execute(new LikePostCommand(999))).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

통합 테스트 (`test/posts.integration-spec.ts`에 추가):

```typescript
describe('POST /posts/:id/like', () => {
  it('should like a post and return 204', async () => {
    const createRes = await createPost().expect(201);
    const id = createRes.body.id as number;
    await request(app.getHttpServer()).post(`/posts/${id}/like`).expect(204);
  });

  it('should return 404 when post not found', () => {
    return request(app.getHttpServer()).post('/posts/99999/like').expect(404);
  });
});
```

### 체크포인트

- [ ] Command 객체는 순수 값 객체인가? (메서드 없음)
- [ ] Handler 반환 타입이 `void` 또는 `number`인가? (DTO 아님)
- [ ] 검증 로직이 Repository가 아닌 Handler에 있는가?
- [ ] Repository 인터페이스에 도메인 타입을 추가했는가?
- [ ] Module의 `commandHandlers` 배열에 Handler를 등록했는가?
- [ ] 단위 테스트: 성공/실패 케이스를 모두 작성했는가?
- [ ] 통합 테스트: HTTP 레이어 검증을 추가했는가?
- [ ] 빌드 확인: `pnpm build:local`
- [ ] 테스트 확인: `pnpm test && pnpm test:e2e`

---

## 18. 새 도메인 모듈 추가 체크리스트

예시: **Comments 도메인**을 새로 추가한다고 가정.

### 완성 후 디렉터리 구조

```text
src/comments/
├── entities/
│   └── comment.entity.ts                          ← Entity
├── interface/
│   ├── comment-read-repository.interface.ts        ← 읽기 인터페이스 + 필터 타입
│   └── comment-write-repository.interface.ts       ← 쓰기 인터페이스 + 입력 타입
├── command/
│   ├── create-comment.command.ts                   ← Command 객체
│   ├── create-comment.handler.ts                   ← Command Handler
│   └── create-comment.handler.spec.ts              ← 단위 테스트
├── query/
│   ├── get-comment-by-id.query.ts                  ← Query 객체
│   ├── get-comment-by-id.handler.ts                ← Query Handler
│   └── get-comment-by-id.handler.spec.ts           ← 단위 테스트
├── dto/
│   ├── request/
│   │   └── create-comment.request.dto.ts           ← Request DTO
│   └── response/
│       ├── comment.response.dto.ts                 ← Response DTO
│       ├── comment.response.dto.spec.ts            ← 단위 테스트
│       └── create-comment.response.dto.ts          ← Command 결과 DTO
├── comment.repository.ts                           ← Repository 구현체
├── comment-repository.provider.ts                  ← DI Provider
└── comments.module.ts                              ← 모듈 정의
```

### 15단계 가이드

#### 1단계: Entity 생성

```typescript
// src/comments/entities/comment.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  content: string;

  @Column()
  postId: number;                        // ← 도메인에 맞게 컬럼 정의

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

#### 2단계: Migration 생성 + 실행

```bash
pnpm migration:generate:local -- src/migrations/CreateCommentTable
# 생성된 파일 검토 후:
pnpm migration:local
```

#### 3단계: 읽기 인터페이스 정의

```typescript
// src/comments/interface/comment-read-repository.interface.ts
import { Comment } from '@src/comments/entities/comment.entity';

export type CommentFilter = {
  postId?: number;                       // ← 도메인별 필터
};

export abstract class ICommentReadRepository {
  abstract findById(id: number): Promise<Comment | null>;
  abstract findAllPaginated(
    page: number,
    limit: number,
    filter?: CommentFilter,
  ): Promise<[Comment[], number]>;
}
```

#### 4단계: 쓰기 인터페이스 정의

```typescript
// src/comments/interface/comment-write-repository.interface.ts
import { Comment } from '@src/comments/entities/comment.entity';

export interface CreateCommentInput {     // ← 도메인 입력 타입
  content: string;
  postId: number;
}

export abstract class ICommentWriteRepository {
  abstract create(input: CreateCommentInput): Promise<Comment>;
  abstract delete(id: number): Promise<number>;
}
```

#### 5단계: Repository 구현

```typescript
// src/comments/comment.repository.ts
@Injectable()
export class CommentRepository
  extends BaseRepository
  implements ICommentReadRepository, ICommentWriteRepository
{
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  private get commentRepository() {
    return this.getRepository(Comment);
  }

  async findById(id: number): Promise<Comment | null> {
    return this.commentRepository.findOneBy({ id });
  }

  // ... 나머지 메서드 구현
}
```

#### 6단계: Provider 등록

```typescript
// src/comments/comment-repository.provider.ts
export const commentRepositoryProviders: Provider[] = [
  CommentRepository,
  { provide: ICommentReadRepository, useExisting: CommentRepository },
  { provide: ICommentWriteRepository, useExisting: CommentRepository },
];
```

#### 7단계: Request DTO

```typescript
// src/comments/dto/request/create-comment.request.dto.ts
export class CreateCommentRequestDto {
  @ApiProperty({ description: '댓글 내용' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ description: '게시글 ID' })
  @Type(() => Number)
  @IsInt()
  postId: number;
}
```

#### 8단계: Response DTO

```typescript
// src/comments/dto/response/comment.response.dto.ts
export class CommentResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() content: string;
  @ApiProperty() postId: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  static of(comment: Comment): CommentResponseDto {
    const dto = new CommentResponseDto();
    dto.id = comment.id;
    dto.content = comment.content;
    dto.postId = comment.postId;
    dto.createdAt = comment.createdAt;
    dto.updatedAt = comment.updatedAt;
    return dto;
  }
}
```

#### 9단계: Command 객체

```typescript
// src/comments/command/create-comment.command.ts
export class CreateCommentCommand {
  constructor(
    public readonly content: string,
    public readonly postId: number,
  ) {}
}
```

#### 10단계: Command Handler

```typescript
// src/comments/command/create-comment.handler.ts
@CommandHandler(CreateCommentCommand)
export class CreateCommentHandler implements ICommandHandler<CreateCommentCommand> {
  constructor(private readonly commentWriteRepository: ICommentWriteRepository) {}

  async execute(command: CreateCommentCommand): Promise<number> {
    const comment = await this.commentWriteRepository.create({
      content: command.content,
      postId: command.postId,
    });
    return comment.id;
  }
}
```

#### 11단계: Query 객체 + Handler

```typescript
// src/comments/query/get-comment-by-id.query.ts
export class GetCommentByIdQuery {
  constructor(public readonly id: number) {}
}

// src/comments/query/get-comment-by-id.handler.ts
@QueryHandler(GetCommentByIdQuery)
export class GetCommentByIdHandler implements IQueryHandler<GetCommentByIdQuery> {
  constructor(private readonly commentReadRepository: ICommentReadRepository) {}

  async execute(query: GetCommentByIdQuery): Promise<CommentResponseDto> {
    const comment = await this.commentReadRepository.findById(query.id);
    if (!comment) {
      throw new NotFoundException(`Comment with ID ${query.id} not found`);
    }
    return CommentResponseDto.of(comment);
  }
}
```

#### 12단계: Controller

```typescript
// src/comments/comments.controller.ts
@ApiTags('Comments')
@Controller('comments')
export class CommentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: '댓글 생성' })
  async createComment(@Body() dto: CreateCommentRequestDto) {
    const id = await this.commandBus.execute<CreateCommentCommand, number>(
      new CreateCommentCommand(dto.content, dto.postId),
    );
    return CreateCommentResponseDto.of(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID로 댓글 조회' })
  async getCommentById(@Param('id', ParseIntPipe) id: number) {
    return this.queryBus.execute(new GetCommentByIdQuery(id));
  }
}
```

#### 13단계: Module 정의

```typescript
// src/comments/comments.module.ts
const commandHandlers = [CreateCommentHandler];
const queryHandlers = [GetCommentByIdHandler];

@Module({
  imports: [CqrsModule],
  controllers: [CommentsController],
  providers: [...commandHandlers, ...queryHandlers, ...commentRepositoryProviders],
})
export class CommentsModule {}
```

#### 14단계: AppModule에 등록

```typescript
// src/app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ ... }),
    TypeOrmModule.forRootAsync({ ... }),
    PostsModule,
    CommentsModule,              // ← 여기에 추가!
  ],
})
export class AppModule {}
```

#### 15단계: 테스트 작성

- 단위 테스트: `src/comments/command/create-comment.handler.spec.ts`
- 단위 테스트: `src/comments/query/get-comment-by-id.handler.spec.ts`
- 단위 테스트: `src/comments/dto/response/comment.response.dto.spec.ts`
- 통합 테스트: `test/comments.integration-spec.ts`

최종 검증:

```bash
pnpm build:local        # 빌드 확인
pnpm test               # 단위 테스트 통과
pnpm test:e2e           # 통합 테스트 통과 (Docker 필수)
```

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

### 실수 6: AppModule에 새 모듈 import 누락

```typescript
// ❌ CommentsModule을 생성했지만 AppModule에 등록하지 않음
// → 해당 모듈의 컨트롤러/핸들러가 전혀 동작하지 않음
// → 런타임에야 발견됨 (빌드는 성공)

// ✅ AppModule의 imports에 반드시 등록
@Module({
  imports: [
    ConfigModule.forRoot({ ... }),
    TypeOrmModule.forRootAsync({ ... }),
    PostsModule,
    CommentsModule,    // ← 새 모듈 반드시 추가!
  ],
})
export class AppModule {}
```

### 실수 7: @InjectRepository() 사용

```typescript
// ❌ 이 프로젝트에서는 사용하지 않음
constructor(
  @InjectRepository(Post)
  private readonly postRepo: Repository<Post>,
) {}

// ✅ BaseRepository 패턴 사용
export class PostRepository extends BaseRepository {
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  private get postRepository() {
    return this.getRepository(Post);  // BaseRepository의 메서드 사용
  }
}
```

이유: `@InjectRepository()`는 `TypeOrmModule.forFeature()`와 함께 쓰이는 패턴이다. 이 프로젝트는 `BaseRepository` + `DataSource` 직접 주입 패턴을 사용하여 트랜잭션 롤백 기반 테스트를 가능하게 한다.

### 실수 8: boolean query param에 @Transform 누락

```typescript
// ❌ 잘못된 예 — "true" 문자열이 그대로 전달됨
@IsBoolean()
@IsOptional()
isPublished?: boolean;       // 쿼리 "?isPublished=true" → 문자열 "true" → 검증 실패!

// ❌ 잘못된 예 — @Type(() => Boolean) 사용
@Type(() => Boolean)         // "false" → Boolean("false") → true (truthy!)
@IsBoolean()
@IsOptional()
isPublished?: boolean;

// ✅ 올바른 예 — @Transform으로 정확한 변환
@Transform(({ value }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;              // 다른 값은 @IsBoolean()에서 거부
})
@IsBoolean()
@IsOptional()
isPublished?: boolean;
```

### 실수 9: Entity 수정 후 migration 미생성

```typescript
// Entity에 새 컬럼 추가
@Column()
category: string;

// ❌ migration을 생성하지 않음
// → synchronize: false이므로 DB에 컬럼이 추가되지 않음
// → 런타임에 "column 'category' does not exist" 에러

// ✅ 반드시 migration 생성 + 실행
// pnpm migration:generate:local -- src/migrations/AddCategoryToPost
// pnpm migration:local
```

---

## 19. 파일 구조 빠른 참조

```text
src/
├── app.module.ts                                    # 루트 모듈 (모든 모듈 import)
├── main.ts                                          # 앱 부트스트랩 (ValidationPipe, Swagger)
├── data-source.ts                                   # TypeORM CLI용 DataSource 설정
├── common/
│   ├── base.repository.ts                           # BaseRepository (DataSource 직접 주입)
│   ├── dto/
│   │   ├── request/
│   │   │   └── pagination.request.dto.ts            # PaginationRequestDto (page, limit)
│   │   └── response/
│   │       ├── paginated.response.dto.ts            # PaginatedResponseDto<T> + PaginationMeta
│   │       └── paginated.response.dto.spec.ts       # 단위 테스트
│   └── query/
│       └── paginated.query.ts                       # PaginatedQuery 추상 클래스
├── database/
│   └── typeorm.config.ts                            # createDataSourceOptions() 함수
├── migrations/
│   ├── 1770456974651-CreatePostTable.ts             # posts 테이블 생성
│   └── 1771663440634-AddUniqueTitleToPost.ts        # title UNIQUE 제약조건
└── posts/
    ├── entities/
    │   └── post.entity.ts                           # Post 엔티티
    ├── interface/
    │   ├── post-read-repository.interface.ts         # IPostReadRepository + PostFilter
    │   └── post-write-repository.interface.ts        # IPostWriteRepository + 입력 타입
    ├── command/
    │   ├── create-post.command.ts                    # CreatePostCommand
    │   ├── create-post.handler.ts                    # Handler (ConflictException 검증)
    │   ├── create-post.handler.spec.ts               # 단위 테스트
    │   ├── update-post.command.ts                    # UpdatePostCommand
    │   ├── update-post.handler.ts                    # Handler (affected===0 체크)
    │   ├── update-post.handler.spec.ts               # 단위 테스트
    │   ├── delete-post.command.ts                    # DeletePostCommand
    │   ├── delete-post.handler.ts                    # Handler (affected===0 체크)
    │   └── delete-post.handler.spec.ts               # 단위 테스트
    ├── query/
    │   ├── get-post-by-id.query.ts                   # GetPostByIdQuery
    │   ├── get-post-by-id.handler.ts                 # Handler (null 체크 + DTO 변환)
    │   ├── get-post-by-id.handler.spec.ts            # 단위 테스트
    │   ├── find-all-posts-paginated.query.ts         # FindAllPostsPaginatedQuery
    │   ├── find-all-posts-paginated.handler.ts       # Handler (DTO 변환 + 페이지네이션)
    │   └── find-all-posts-paginated.handler.spec.ts  # 단위 테스트
    ├── dto/
    │   ├── request/
    │   │   ├── create-post.request.dto.ts            # 생성 요청 DTO
    │   │   ├── update-post.request.dto.ts            # 수정 요청 DTO
    │   │   └── find-posts.request.dto.ts             # 페이지네이션+필터 DTO
    │   └── response/
    │       ├── post.response.dto.ts                  # PostResponseDto (static of)
    │       ├── post.response.dto.spec.ts             # 단위 테스트
    │       └── create-post.response.dto.ts           # CreatePostResponseDto (최소 응답)
    ├── post.repository.ts                            # PostRepository 구현체
    ├── post-repository.provider.ts                   # DI Provider 배열
    ├── posts.controller.ts                           # REST API Controller
    └── posts.module.ts                               # PostsModule 정의

test/
├── jest-e2e.json                                     # 통합 테스트 Jest 설정
├── posts.integration-spec.ts                         # Posts 통합 테스트
└── setup/
    ├── global-setup.ts                               # Testcontainers 기동 + migration
    ├── global-teardown.ts                            # 컨테이너 종료 + 파일 정리
    └── integration-helper.ts                         # createIntegrationApp, useTransactionRollback
```
