# 인터페이스 분리 원칙 (Interface Segregation Principle)

## 1. ISP란?

**인터페이스 분리 원칙(ISP)** 은 SOLID 원칙의 네 번째 원칙이다.

> "클라이언트는 자신이 사용하지 않는 메서드에 의존하도록 강제되어서는 안 된다."
>
> — Robert C. Martin

하나의 범용 인터페이스보다 **여러 개의 구체적인 인터페이스**가 낫다는 원칙이다.

### 위반 시 발생하는 문제

```
┌─────────────────────────────────┐
│        IPostRepository          │
├─────────────────────────────────┤
│ + findById(id): Post            │  ← 읽기
│ + findAll(): Post[]             │  ← 읽기
│ + create(dto): Post             │  ← 쓰기
│ + update(id, dto): Post         │  ← 쓰기
│ + delete(id): void              │  ← 쓰기
└─────────────────────────────────┘
         ▲             ▲
         │             │
    ReadService    WriteService
    (findById,     (create만
     findAll만      필요)
     필요)
```

- `ReadService`는 `create`, `update`, `delete`를 사용하지 않지만, 인터페이스 전체에 의존한다.
- `WriteService`도 `findById`, `findAll`이 불필요하지만 의존하게 된다.
- 쓰기 메서드 시그니처가 바뀌면, 읽기만 하는 서비스까지 **영향을 받는다**.

### ISP 적용 후

```
┌──────────────────────┐    ┌──────────────────────────┐
│  IPostReadRepository │    │  IPostWriteRepository    │
├──────────────────────┤    ├──────────────────────────┤
│ + findById(id): Post │    │ + create(dto): Post      │
│ + findAll(): Post[]  │    │ + update(id, dto): Post  │
└──────────────────────┘    │ + delete(id): void       │
         ▲                  └──────────────────────────┘
         │                              ▲
    ReadService                    WriteService
    (필요한 것만 의존)              (필요한 것만 의존)
```

- 각 서비스는 **자신이 실제로 사용하는 메서드만** 의존한다.
- 읽기 인터페이스가 변경되어도 쓰기 쪽은 영향 없고, 그 반대도 마찬가지다.
- CQRS(Command Query Responsibility Segregation)로의 확장이 자연스러워진다.

---

## 2. 현재 프로젝트의 ISP 위반 분석

### 현재 구조

```
Controller → Facade → Service → IPostRepository → PostRepository → TypeORM
```

현재 `IPostRepository`는 읽기/쓰기 5개 메서드를 하나의 abstract class에 모두 정의하고 있다.

**`src/posts/post-repository.interface.ts`** (현재 코드)

```typescript
export abstract class IPostRepository {
  abstract findById(id: number): Promise<Post | null>;   // 읽기
  abstract findAll(): Promise<Post[]>;                    // 읽기
  abstract create(dto: CreatePostRequestDto): Promise<Post>;                    // 쓰기
  abstract update(id: number, dto: UpdatePostRequestDto): Promise<Post | null>; // 쓰기
  abstract delete(id: number): Promise<void>;                                   // 쓰기
}
```

### 문제점

| 문제 | 설명 |
|------|------|
| **불필요한 의존** | 글 목록 조회만 하는 소비자도 `create`, `update`, `delete`에 의존 |
| **변경 전파** | 쓰기 메서드 시그니처 변경 시 읽기 전용 소비자까지 재컴파일/재테스트 필요 |
| **확장성 제한** | 읽기 메서드가 늘어날수록(`findByAuthor`, `findWithPagination`, `searchByKeyword` 등) 쓰기 전용 소비자의 불필요한 의존도 함께 늘어남 |
| **CQRS 전환 장벽** | 읽기/쓰기를 다른 데이터 저장소로 분리하려 할 때 인터페이스부터 쪼개야 함 |

### 현재 DI 흐름

```typescript
// post-repository.provider.ts
export const postRepositoryProvider: Provider = {
  provide: IPostRepository,      // 하나의 DI 토큰
  useClass: PostRepository,      // 하나의 구현체
};

// posts.service.ts
export class PostsService {
  constructor(private readonly postRepository: IPostRepository) {}
  // findById, findAll → 읽기 메서드만 사용
  // create → 쓰기 메서드만 사용
  // 하지만 IPostRepository 전체에 의존
}
```

---

## 3. 개선: 읽기/쓰기 인터페이스 분리

### 3.1 분리된 인터페이스

**`IPostReadRepository`** - 조회 전용

```typescript
// src/posts/post-read-repository.interface.ts
import { Post } from './entities/post.entity';

export abstract class IPostReadRepository {
  abstract findById(id: number): Promise<Post | null>;
  abstract findAll(): Promise<Post[]>;
}
```

**`IPostWriteRepository`** - 변경 전용

```typescript
// src/posts/post-write-repository.interface.ts
import { Post } from './entities/post.entity';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';
import { UpdatePostRequestDto } from './dto/request/update-post.request.dto';

export abstract class IPostWriteRepository {
  abstract create(dto: CreatePostRequestDto): Promise<Post>;
  abstract update(id: number, dto: UpdatePostRequestDto): Promise<Post | null>;
  abstract delete(id: number): Promise<void>;
}
```

import 구문 자체가 분리의 근거를 보여준다:
- `IPostReadRepository`는 `Post` 엔티티만 import한다.
- `IPostWriteRepository`는 `Post` + 요청 DTO들을 import한다.

### 3.2 구현체: 두 인터페이스를 모두 구현

```typescript
// src/posts/post.repository.ts
@Injectable()
export class PostRepository
  extends BaseRepository
  implements IPostReadRepository, IPostWriteRepository
{
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  // 읽기 메서드
  async findById(id: number): Promise<Post | null> { ... }
  async findAll(): Promise<Post[]> { ... }

  // 쓰기 메서드
  async create(dto: CreatePostRequestDto): Promise<Post> { ... }
  async update(id: number, dto: UpdatePostRequestDto): Promise<Post | null> { ... }
  async delete(id: number): Promise<void> { ... }
}
```

구현체는 하나지만, 소비자는 필요한 인터페이스만 주입받는다. 이것이 ISP의 핵심이다.

### 3.3 Provider: useExisting 패턴

```typescript
// src/posts/post-repository.provider.ts
export const postRepositoryProviders: Provider[] = [
  PostRepository,
  { provide: IPostReadRepository, useExisting: PostRepository },
  { provide: IPostWriteRepository, useExisting: PostRepository },
];
```

**왜 `useExisting`인가?**

| 방식 | 결과 |
|------|------|
| `useClass: PostRepository` x 2 | PostRepository 인스턴스가 **2개** 생성됨 |
| `useExisting: PostRepository` x 2 | PostRepository 인스턴스 **1개**를 두 토큰이 공유 |

`useExisting`은 이미 등록된 프로바이더의 인스턴스를 **별칭(alias)** 으로 참조한다. 따라서 `PostRepository`를 먼저 자체 프로바이더로 등록한 뒤, 두 추상 클래스 토큰이 같은 인스턴스를 가리키게 한다.

```
IPostReadRepository  ──┐
                       ├──→  PostRepository (인스턴스 1개)
IPostWriteRepository ──┘
```

### 3.4 Service: 분리된 인터페이스 주입

```typescript
// src/posts/posts.service.ts
@Injectable()
export class PostsService {
  constructor(
    private readonly postReadRepository: IPostReadRepository,
    private readonly postWriteRepository: IPostWriteRepository,
  ) {}

  async findById(id: number): Promise<Post | null> {
    return this.postReadRepository.findById(id);   // 읽기 인터페이스 사용
  }

  async findAll(): Promise<Post[]> {
    return this.postReadRepository.findAll();       // 읽기 인터페이스 사용
  }

  async create(dto: CreatePostRequestDto): Promise<Post> {
    return this.postWriteRepository.create(dto);    // 쓰기 인터페이스 사용
  }
}
```

각 메서드가 자신의 역할에 맞는 인터페이스만 호출한다. 향후 읽기 전용 서비스를 만들 때 `IPostReadRepository`만 주입하면 된다.

### 3.5 Module: 배열 spread

```typescript
// src/posts/posts.module.ts
@Module({
  controllers: [PostsController],
  providers: [PostsFacade, PostsService, ...postRepositoryProviders],
})
export class PostsModule {}
```

---

## 4. 변경 전후 비교

### Before

```
IPostRepository (5개 메서드)
    ▲
    │ 하나의 DI 토큰
PostsService (읽기+쓰기 전체 의존)
```

### After

```
IPostReadRepository (2개)    IPostWriteRepository (3개)
    ▲                            ▲
    │                            │
PostsService                 PostsService
(읽기 메서드 →               (쓰기 메서드 →
 읽기 인터페이스만 사용)       쓰기 인터페이스만 사용)
```

### 변경 파일 요약

| 파일 | 작업 |
|------|------|
| `src/posts/post-read-repository.interface.ts` | 신규 생성 |
| `src/posts/post-write-repository.interface.ts` | 신규 생성 |
| `src/posts/post.repository.ts` | `implements` 절 변경 |
| `src/posts/post-repository.provider.ts` | `useExisting` 패턴으로 재구성 |
| `src/posts/posts.service.ts` | 2개 인터페이스 분리 주입 |
| `src/posts/posts.module.ts` | spread 연산자 적용 |
| `src/posts/post-repository.interface.ts` | 삭제 |
| `src/posts/posts.service.spec.ts` | mock 객체 읽기/쓰기 분리 |
| `test/posts.e2e-spec.ts` | `overrideProvider` 3개로 체이닝 |

### e2e 테스트 시 주의: PostRepository도 override 필요

`useExisting` 패턴에서는 `PostRepository`가 자체 프로바이더로 등록된다. e2e 테스트에서 `PostsModule`을 import하면 NestJS가 `PostRepository`를 인스턴스화하려 하고, 이때 `DataSource`를 resolve할 수 없어 에러가 발생한다. 따라서 `IPostReadRepository`, `IPostWriteRepository`뿐 아니라 **`PostRepository`도 함께 override**해야 한다.

```typescript
// test/posts.e2e-spec.ts
const moduleFixture = await Test.createTestingModule({
  imports: [PostsModule],
})
  .overrideProvider(PostRepository)       // DataSource 의존성 해소
  .useValue(mockRepository)
  .overrideProvider(IPostReadRepository)
  .useValue(mockRepository)
  .overrideProvider(IPostWriteRepository)
  .useValue(mockRepository)
  .compile();
```

### 변경이 필요 없는 파일

- **Controller, Facade** - Repository 레이어를 직접 참조하지 않음
- **post.repository.spec.ts** - DataSource를 직접 모킹하며 인터페이스 미참조
- **posts.facade.spec.ts** - PostsService를 모킹
- **posts.controller.spec.ts** - PostsFacade를 모킹
- **posts.integration-spec.ts** - 실제 AppModule 사용, 인터페이스 토큰 미참조

---

## 5. CQRS로의 확장 가능성

ISP를 적용한 읽기/쓰기 분리는 CQRS 패턴의 기반이 된다.

```
현재 (ISP 적용 후)
──────────────────
IPostReadRepository  → PostRepository → PostgreSQL
IPostWriteRepository → PostRepository → PostgreSQL

향후 CQRS 확장 시
──────────────────
IPostReadRepository  → PostReadRepository  → Elasticsearch (검색 최적화)
IPostWriteRepository → PostWriteRepository → PostgreSQL (쓰기 최적화)
```

인터페이스가 이미 분리되어 있으므로, 읽기/쓰기 저장소를 다르게 가져가는 것이 프로바이더 설정만 바꾸면 되는 수준으로 단순해진다. 소비자 코드(Service, Facade, Controller)는 전혀 수정할 필요가 없다.
