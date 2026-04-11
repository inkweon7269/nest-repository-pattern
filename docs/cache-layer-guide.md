# Cache Layer 가이드

## 개요

CQRS 패턴에 맞춰 Query Handler에서 캐시를 읽고/저장하며, Command Handler에서 캐시를 무효화하는 Cache-Aside 패턴을 적용한다. 기존 `ioredis` 기반 `REDIS_CLIENT`를 재사용하여 추가 패키지 없이 구현한다.

## 아키텍처

```text
[Query 요청]
Controller → QueryBus → Query Handler
                            ├─ CacheService.get() → Redis (HIT → 즉시 반환)
                            └─ (MISS) → Repository → DB 조회
                                          └─ CacheService.set() → Redis 저장

[Command 요청]
Controller → CommandBus → Command Handler
                              ├─ Repository → DB 쓰기
                              └─ CacheService.del() / delByPattern() → 캐시 무효화
```

## 핵심 설계 원칙

### 1. CQRS 정합

- **Query Handler**: 캐시 읽기/저장 담당
- **Command Handler**: 캐시 무효화 담당
- Controller와 Repository는 캐시를 모르는 상태 유지

### 2. Fail-Open 패턴

- 모든 Redis 연산은 `CacheService` 내부에서 try/catch로 감싸짐
- Redis 장애 시 캐시 미스로 처리하고 DB 조회로 fallback
- 캐시 무효화 실패 시 warn 로그만 남기고 정상 진행
- **캐시 장애가 서비스 가용성에 영향을 미치지 않음**

### 3. 사용자 격리

- 모든 캐시 키에 `userId`를 포함하여 교차 접근 방지
- 예: `post:1:5` (userId=1의 postId=5)
- 인증된 JWT 토큰에서 추출한 userId로 키를 생성하므로 위조 불가

### 4. 추가 패키지 없음

- `@nestjs/cache-manager` + `cache-manager` v6는 내부적으로 `keyv` + `@keyv/redis`로 별도 Redis 연결을 생성
- 프로젝트에 이미 `ioredis` 기반 `REDIS_CLIENT`가 글로벌로 제공되므로, 이를 재사용하여 연결 이중화 방지

## 구성 요소

### CacheService

**파일**: `src/common/cache/cache.service.ts`

기존 `REDIS_CLIENT`를 주입받아 캐시 CRUD를 제공하는 인프라 유틸리티.

| 메서드 | 설명 | 실패 시 동작 |
|--------|------|-------------|
| `get<T>(key)` | 캐시 조회. 히트 시 `T` 반환, 미스 시 `undefined` | `undefined` 반환 (캐시 미스 처리) |
| `set(key, value, ttlSeconds)` | 캐시 저장. TTL(초) 지정 | warn 로그 후 무시 |
| `del(key)` | 단일 키 삭제 | warn 로그 후 무시 |
| `delByPattern(pattern)` | 패턴 매칭 키 일괄 삭제 (Redis SCAN) | warn 로그 후 무시 |

### AppCacheModule

**파일**: `src/common/cache/cache.module.ts`

```typescript
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class AppCacheModule {}
```

`REDIS_CLIENT`는 `IdempotencyModule`이 `@Global()`로 제공하므로 별도 import 불필요.

## 캐시 전략

### 캐시 대상 (Query)

| Handler | 캐시 키 패턴 | TTL | 비고 |
|---------|-------------|-----|------|
| `GetPostByIdHandler` | `post:{userId}:{postId}` | 300초 (5분) | 단일 게시물 조회 |
| `FindAllPostsPaginatedHandler` | `posts:{userId}:{page}:{limit}:{isPublished\|all}` | 180초 (3분) | 페이지네이션 목록 |
| `GetProfileHandler` | `profile:{userId}` | 600초 (10분) | 사용자 프로필 |

### 캐시 무효화 (Command)

| Handler | 무효화 대상 | 이유 |
|---------|-----------|------|
| `CreatePostHandler` | `posts:{userId}:*` | 새 게시물로 목록 캐시가 stale |
| `UpdatePostHandler` | `post:{userId}:{postId}` + `posts:{userId}:*` | 수정된 게시물 + 목록 갱신 |
| `DeletePostHandler` | `post:{userId}:{postId}` + `posts:{userId}:*` | 삭제된 게시물 + 목록 갱신 |

## 구현 패턴

### Query Handler에서 캐시 적용

```typescript
// src/posts/query/get-post-by-id.handler.ts

const POST_CACHE_TTL = 300; // 5분

@QueryHandler(GetPostByIdQuery)
export class GetPostByIdHandler implements IQueryHandler<GetPostByIdQuery> {
  constructor(
    private readonly postReadRepository: IPostReadRepository,
    private readonly cacheService: CacheService,
  ) {}

  async execute(query: GetPostByIdQuery): Promise<PostResponseDto> {
    // 1. 캐시 조회
    const cacheKey = `post:${query.userId}:${query.id}`;
    const cached = await this.cacheService.get<PostResponseDto>(cacheKey);
    if (cached) return cached;

    // 2. DB 조회 + 검증
    const post = await this.postReadRepository.findById(query.id);
    if (!post || post.userId !== query.userId) {
      throw new NotFoundException(`Post with ID ${query.id} not found`);
    }

    // 3. DTO 변환 + 캐시 저장
    const result = PostResponseDto.of(post);
    await this.cacheService.set(cacheKey, result, POST_CACHE_TTL);
    return result;
  }
}
```

### Command Handler에서 캐시 무효화

```typescript
// src/posts/command/update-post.handler.ts

@CommandHandler(UpdatePostCommand)
export class UpdatePostHandler implements ICommandHandler<UpdatePostCommand> {
  constructor(
    private readonly postWriteRepository: IPostWriteRepository,
    private readonly cacheService: CacheService,
  ) {}

  async execute(command: UpdatePostCommand): Promise<void> {
    // 1. DB 쓰기
    const affected = await this.postWriteRepository.update(
      command.id, command.userId,
      { title: command.title, content: command.content, isPublished: command.isPublished },
    );
    if (affected === 0) {
      throw new NotFoundException(`Post with ID ${command.id} not found`);
    }

    // 2. 캐시 무효화 (개별 + 목록)
    await this.cacheService.del(`post:${command.userId}:${command.id}`);
    await this.cacheService.delByPattern(`posts:${command.userId}:*`);
  }
}
```

## 로깅

`CacheService`는 NestJS `Logger`를 내장하며, 모든 연산을 `debug` 레벨로 로깅한다.

### 로그 출력 예시

```
[CacheService] Cache HIT: post:1:5
[CacheService] Cache MISS: post:1:10
[CacheService] Cache SET: post:1:10 (TTL: 300s)
[CacheService] Cache DEL: post:1:5
[CacheService] Cache DEL pattern: posts:1:* (3 keys)
```

### 장애 시 로그

```
[CacheService] Cache GET failed: post:1:5 — Connection is closed
[CacheService] Cache SET failed: post:1:10 — Connection is closed
```

- `debug` 레벨: 정상 캐시 히트/미스/SET/DEL
- `warn` 레벨: Redis 장애, JSON 파싱 실패 등 예외 상황
- `.env.*`의 `LOG_LEVEL=debug`일 때만 debug 로그 출력

## 모듈 등록

### PostsModule

```typescript
// src/posts/posts.module.ts
@Module({
  imports: [CqrsModule, AuthModule, SlackModule, AppCacheModule],
  // ...
})
export class PostsModule {}
```

### AuthModule

```typescript
// src/auth/auth.module.ts
@Module({
  imports: [CqrsModule, PassportModule, JwtModule.register({}), AppCacheModule],
  // ...
})
export class AuthModule {}
```

## 단위 테스트

Handler 단위 테스트에서 `CacheService`를 mock으로 제공한다.

```typescript
const module: TestingModule = await Test.createTestingModule({
  providers: [
    GetPostByIdHandler,
    { provide: IPostReadRepository, useValue: mockReadRepository },
    {
      provide: CacheService,
      useValue: {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        delByPattern: jest.fn(),
      },
    },
  ],
}).compile();
```

## 새 도메인에 캐시 추가하기

1. 해당 모듈에 `AppCacheModule`을 imports에 추가
2. Query Handler에 `CacheService`를 주입하고 `get()`/`set()` 패턴 적용
3. Command Handler에 `CacheService`를 주입하고 `del()`/`delByPattern()` 패턴 적용
4. 캐시 키에 반드시 `userId`를 포함하여 사용자 격리 유지
5. TTL은 데이터 변경 빈도에 따라 설정 (자주 변경: 3분, 드물게 변경: 10분)
6. 단위 테스트에 `CacheService` mock 추가

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/common/cache/cache.service.ts` | 캐시 유틸리티 서비스 |
| `src/common/cache/cache.module.ts` | AppCacheModule |
| `src/common/idempotency/idempotency.module.ts` | `REDIS_CLIENT` 제공 (글로벌) |
| `src/posts/query/*.handler.ts` | Query 캐시 적용 |
| `src/posts/command/*.handler.ts` | Command 캐시 무효화 |
| `src/auth/query/get-profile.handler.ts` | 프로필 캐시 적용 |
