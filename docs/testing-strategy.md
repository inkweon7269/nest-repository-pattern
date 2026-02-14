# 테스트 전략 개선: Classical School 전환 및 통합 테스트 강화

## 1. 배경: 두 가지 TDD 학파

테스트 전략에는 대표적으로 두 학파가 있다.

### London School (Mockist)

> 모든 레이어를 격리하고, 직접 의존하는 하위 레이어를 모킹한다.

```
Controller spec → mock Facade
Facade spec     → mock Service
Service spec    → mock Repository
Repository spec → mock DataSource
```

하나의 `getPostById` 흐름에 대해 4개의 테스트 스위트가 존재한다. 각 테스트는 "X 레이어가 Y 레이어를 올바른 인자로 호출했는가?"를 검증한다.

**문제점:**
- 테스트가 통과해도 증명하는 것은 **mock이 의도대로 동작한다**는 것뿐
- Repository의 실제 반환 타입이 바뀌거나 메서드 이름이 변경되어도 mock 기반 테스트는 여전히 통과
- **가정을 테스트하는 것이지, 시스템을 테스트하는 것이 아님**

### Classical School (Detroit Style)

> 실제 객체를 사용하고, 제어할 수 없는 경계(DB, 외부 API)만 모킹한다.

```
통합 테스트 → Controller → Facade → Service → Repository → TypeORM → PostgreSQL
                                                                ↑
                                                          실제 DB (Testcontainers)
```

질문이 바뀐다: "X가 Y를 호출했는가?" → **"이 입력이 주어졌을 때 올바른 출력이 나오는가?"**

---

## 2. 현재 프로젝트의 문제 분석

### 단위 테스트: pass-through 레이어에 대한 과잉 테스트

현재 `PostsService`의 모든 메서드는 한 줄짜리 위임이다:

```typescript
// src/posts/posts.service.ts
async findById(id: number): Promise<Post | null> {
  return this.postReadRepository.findById(id);   // 그대로 전달
}

async findAll(): Promise<Post[]> {
  return this.postReadRepository.findAll();       // 그대로 전달
}

async create(dto: CreatePostRequestDto): Promise<Post> {
  return this.postWriteRepository.create(dto);    // 그대로 전달
}
```

이 서비스를 테스트하는 기존 단위 테스트:

```typescript
// src/posts/posts.service.spec.ts (기존 - 삭제 대상)
it('should call repository.findById and return a post', async () => {
  mockReadRepository.findById.mockResolvedValue(mockPost);  // mock 설정
  const result = await service.findById(1);                  // 호출
  expect(mockReadRepository.findById).toHaveBeenCalledWith(1); // mock 호출 확인
  expect(result).toEqual(mockPost);                          // mock 반환값 확인
});
```

이 테스트가 증명하는 것: **"내가 설정한 mock이 내가 설정한 대로 동작한다"**. 실제 버그는 잡을 수 없다.

### 통합 테스트: per-file 격리의 한계

기존 방식은 `beforeAll`에서 한 번 `truncateAllTables()`를 실행한다:

```typescript
// 기존 방식
beforeAll(async () => {
  app = await createIntegrationApp();
  const dataSource = app.get(DataSource);
  await truncateAllTables(dataSource);  // 파일 시작 시 1회만 정리
});
```

**문제점:**
- 앞선 테스트에서 생성한 데이터가 뒤의 테스트에 영향을 줌
- `expect(res.body.length).toBeGreaterThanOrEqual(2)` 같은 느슨한 단언을 사용해야 함
- "빈 배열 반환" 같은 시나리오는 테스트 불가능
- 테스트 파일이 늘어날수록 `maxWorkers: 1` + truncate로 인해 선형적으로 느려짐

---

## 3. 개선 원칙

> **로직은 단위 테스트, 연결(wiring)은 통합 테스트.**

### 단위 테스트를 유지할 기준

단위 테스트는 **실제 조건 분기나 변환 로직**이 있는 코드에만 작성한다:

| 기준 | 예시 | 단위 테스트? |
|------|------|-------------|
| 조건 분기 (if/else) | `if (!post) throw new NotFoundException(...)` | O |
| 데이터 변환 | `PostResponseDto.of(entity)` 필드 매핑 | O |
| 순수 위임 | `return this.repository.findById(id)` | X |
| 프레임워크 위임 | Controller의 HTTP 데코레이터 | X |

### 통합 테스트가 잡는 실제 버그들

mock 기반 테스트에서는 **절대 발견할 수 없는** 버그 유형:

- 잘못된 SQL 생성 (TypeORM 매핑 오류)
- 깨진 migration (컬럼명 불일치)
- DB 제약조건 위반 (varchar(200) 초과, unique 중복)
- 트랜잭션 동작 오류
- 시퀀스/자동 생성 필드 문제

---

## 4. 삭제 대상 및 근거

### `posts.controller.spec.ts` (3 tests) - 삭제

```typescript
// 전형적인 pass-through 테스트 패턴
mockFacade.getAllPosts.mockResolvedValue(mockResponseDtos);
const result = await controller.getAllPosts();
expect(result).toEqual(mockResponseDtos);
```

Controller에 조건문, 변환, 예외 처리가 없다. HTTP 라우팅과 ParseIntPipe는 통합 테스트에서 실제 HTTP 요청으로 검증된다.

### `posts.service.spec.ts` (5 tests) - 삭제

PostsService의 모든 메서드가 한 줄 위임이다. 비즈니스 로직이 추가되면 그때 단위 테스트를 작성하면 된다:

```typescript
// 현재: 단위 테스트 불필요
async findById(id: number): Promise<Post | null> {
  return this.postReadRepository.findById(id);
}

// 미래: 비즈니스 로직이 생기면 단위 테스트 가치가 생김
async publish(id: number): Promise<Post> {
  const post = await this.postReadRepository.findById(id);
  if (!post) throw new NotFoundException();
  if (!post.title || !post.content) {
    throw new BadRequestException('Cannot publish post without title and content');
  }
  post.isPublished = true;
  return this.postWriteRepository.update(id, post);
}
```

### `post.repository.spec.ts` (6 tests) - 삭제

TypeORM 내부 메서드를 모킹해서 호출 여부를 확인하는 테스트다. 실제 SQL 생성, 컬럼 매핑, 제약조건 동작은 검증할 수 없다. 통합 테스트가 실제 PostgreSQL에서 이 모든 것을 검증한다.

---

## 5. 유지 대상 및 근거

### `posts.facade.spec.ts` (6 tests) - 유지

PostsFacade에는 **실제 조건 분기 로직**이 있다:

```typescript
// 조건 분기 + 예외 throw + 에러 메시지 포매팅
async getPostById(id: number): Promise<PostResponseDto> {
  const post = await this.postsService.findById(id);
  if (!post) {
    throw new NotFoundException(`Post with ID ${id} not found`);
  }
  return PostResponseDto.of(post);
}
```

테스트가 검증하는 것:
- null일 때 `NotFoundException`이 throw되는지 (분기)
- 에러 메시지에 post ID가 포함되는지 (포매팅)
- 엔티티가 `PostResponseDto`로 올바르게 변환되는지 (변환)

### `post.response.dto.spec.ts` (3 tests) - 유지

의존성 없는 순수 정적 팩토리 함수. 빠르고 결정적이며 실제 변환 로직을 검증한다.

---

## 6. 트랜잭션 롤백: per-test 격리

### 기존 방식 vs 개선 방식

```
기존: truncateAllTables()
──────────────────────────
beforeAll → TRUNCATE posts RESTART IDENTITY CASCADE
test 1 (POST /posts)  → DB에 데이터 남음
test 2 (GET /posts)   → test 1의 데이터가 보임 (의존 관계 발생)
test 3 (GET /posts)   → test 1, 2의 데이터가 보임

개선: 트랜잭션 롤백
──────────────────────────
beforeEach → BEGIN TRANSACTION
test 1 (POST /posts)  → 트랜잭션 안에서 실행
afterEach  → ROLLBACK (test 1의 모든 쓰기 사라짐)
beforeEach → BEGIN TRANSACTION
test 2 (GET /posts)   → 빈 DB에서 시작 (완전 독립)
afterEach  → ROLLBACK
```

### 동작 원리

프로젝트의 `BaseRepository`는 DB에 접근할 때 항상 `this.dataSource.manager`를 경유한다:

```
PostRepository.findById(id)
  → BaseRepository.getRepository(Post)
    → this.getEntityManager()
      → this.dataSource.manager.getRepository(Post)
                        ↑
              이 지점을 교체하면 모든 DB 호출이 트랜잭션 안에서 실행됨
```

`beforeEach`에서 `dataSource.manager`를 QueryRunner의 트랜잭션 EntityManager로 교체하고, `afterEach`에서 롤백 후 원래 매니저를 복원한다.

```typescript
export function useTransactionRollback(app): TransactionHelper {
  const dataSource = app.get(DataSource);
  let queryRunner: QueryRunner;
  let originalManager: EntityManager;

  return {
    async start() {
      originalManager = dataSource.manager;
      queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      // manager를 트랜잭션 매니저로 교체
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

### 성능 비교

| 항목 | truncateAllTables | 트랜잭션 롤백 |
|------|-------------------|---------------|
| DB 호출 | 테이블당 TRUNCATE 1회 | ROLLBACK 1회 |
| 격리 수준 | per-file (같은 파일 내 테스트는 격리 안 됨) | **per-test** |
| 시퀀스 리셋 | O (RESTART IDENTITY) | X |
| maxWorkers 제약 | 1 필수 | 완화 가능 |

---

## 7. 통합 테스트 확대 시나리오

### 기존 시나리오 (9 tests)

| 엔드포인트 | 시나리오 |
|-----------|---------|
| POST /posts | 생성 성공, isPublished: true, 제목 누락, 본문 비어있음, 미지 필드 거부 |
| GET /posts | 전체 조회 |
| GET /posts/:id | ID로 조회, 404, 비숫자 ID |

### 추가 시나리오 (~9 tests)

| 엔드포인트 | 시나리오 | 가치 |
|-----------|---------|------|
| POST /posts | auto-generated 필드 검증 (id, createdAt, updatedAt) | DB 자동 생성 필드가 실제로 동작하는지 |
| POST /posts | isPublished 기본값 false | 엔티티의 `default: false` 설정 검증 |
| POST /posts | title 200자 경계값 (varchar(200) 성공) | DB 제약조건 경계값 |
| POST /posts | title 201자 경계값 (varchar(200) 실패) | **mock에서는 불가능한 DB 제약조건 위반 테스트** |
| POST /posts | 연속 생성 시 순차 id 할당 | 시퀀스 동작 검증 |
| GET /posts | 빈 배열 반환 (데이터 없을 때) | per-test 격리 덕분에 가능한 시나리오 |
| GET /posts | 응답 shape 검증 (필수 필드 존재 + 내부 필드 미노출) | 보안 관련 |
| GET /posts/:id | 전체 필드 round-trip (isPublished: true 포함) | 엔티티 ↔ DTO 매핑 정확성 |
| POST /posts | 빈 문자열 title 거부 | DTO 유효성 검증 |

### 핵심: mock으로는 불가능한 테스트

```typescript
it('title이 varchar(200) 제약조건을 초과하면 에러가 발생한다', async () => {
  const overMaxTitle = 'A'.repeat(201);
  const res = await createPost({ title: overMaxTitle });
  expect(res.status).toBeGreaterThanOrEqual(400);
});
```

이 테스트는:
- DTO에 `@MaxLength(200)` 검증이 없다는 **실제 갭을 발견**
- 요청이 ValidationPipe를 통과하지만 DB에서 거부됨
- mock 기반 테스트에서는 mock이 항상 성공하므로 이 문제를 영원히 발견할 수 없음

---

## 8. 변경 전후 비교

### Before: London School

```
src/posts/
├── posts.controller.spec.ts    ← mock Facade (3 tests)
├── posts.facade.spec.ts        ← mock Service (6 tests)
├── posts.service.spec.ts       ← mock Repository (5 tests)
├── post.repository.spec.ts     ← mock DataSource (6 tests)
├── dto/response/
│   └── post.response.dto.spec.ts (3 tests)

test/
├── posts.e2e-spec.ts           (10 tests, mock DB)
├── posts.integration-spec.ts   (9 tests, real DB, truncate per-file)

Total: 42 tests (24 unit + 10 e2e + 9 integration)
```

### After: Classical School

```
src/posts/
├── posts.facade.spec.ts        ← 실제 로직 테스트 (6 tests) ✅ 유지
├── dto/response/
│   └── post.response.dto.spec.ts (3 tests) ✅ 유지

test/
├── posts.e2e-spec.ts           (10 tests, mock DB) ✅ 유지
├── posts.integration-spec.ts   (~18 tests, real DB, 트랜잭션 롤백 per-test) ✅ 확대

Total: ~37 tests (9 unit + 10 e2e + ~18 integration)
```

테스트 수는 줄었지만, **실제 버그 탐지 능력은 크게 향상**되었다.

### 테스트 피라미드 변화

```
Before:                          After:

    /\                              /\
   /  \  e2e (10)                  /  \  e2e (10)
  /    \                          /    \
 / unit \ (24)                   /integ.\ (~18)
/________\                      /________\
                                 unit (9)
```

단위 테스트 레이어가 얇아지고, 통합 테스트 레이어가 두꺼워진다. e2e 테스트는 HTTP 레이어 검증 역할로 유지된다.
