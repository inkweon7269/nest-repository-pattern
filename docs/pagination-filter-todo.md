# Pagination 베이스 클래스 추출 + 필터 기능 추가 체크리스트

> PR #2 리뷰어 코멘트를 반영한 작업의 단계별 체크리스트.
> 각 단계는 의존성 순서로 정렬되어 있으며, 순서대로 진행해야 한다.

## 배경

리뷰어(RolandSall)가 `FindAllPostsPaginatedQuery`에 아래 코멘트를 남김:

> "include some filters for fun. and maybe make extend a class that have these generics fields `page` and `limit` eventually you will end up having multiple Pagination on different domain objects"

핵심 요구사항:

1. `page`와 `limit`를 공통으로 갖는 **베이스 클래스**를 추출하여 다른 도메인에서도 재사용
2. `isPublished` **필터**를 게시글 페이지네이션에 추가

---

## Phase 1: PaginatedQuery 베이스 클래스 생성

다른 도메인의 페이지네이션 Query도 상속받을 수 있는 공통 추상 클래스.

- [x] `src/common/query/paginated.query.ts` 생성
  - `page: number`, `limit: number`를 가진 추상 클래스
  - 기존 `src/common/dto/`, `src/common/base.repository.ts`와 같은 위치 패턴

```typescript
export abstract class PaginatedQuery {
  constructor(
    public readonly page: number,
    public readonly limit: number,
  ) {}
}
```

---

## Phase 2: PostFilter 타입 + Repository 인터페이스 수정

`CreatePostInput`/`UpdatePostInput`이 `IPostWriteRepository`와 같은 파일에 있는 패턴을 따라,
`PostFilter`도 `IPostReadRepository`와 같은 파일에 정의한다.

- [x] `src/posts/interface/post-read-repository.interface.ts` 수정
  - `PostFilter` 타입 추가 (`isPublished?: boolean`)
  - `findAllPaginated` 시그니처에 `filter?: PostFilter` 파라미터 추가

---

## Phase 3: Query 클래스 수정

- [x] `src/posts/query/find-all-posts-paginated.query.ts` 수정
  - `PaginatedQuery`를 상속 (`extends PaginatedQuery`)
  - `filter: PostFilter = {}` 필드 추가
  - 기존 `page`, `limit`는 `super(page, limit)`로 전달

---

## Phase 4: Request DTO 생성

HTTP 레이어에서 query string을 검증하는 DTO.
기존 `PaginationRequestDto`를 상속하여 필터 필드만 추가한다.

- [x] `src/posts/dto/request/find-posts.request.dto.ts` 생성
  - `PostsPaginationRequestDto` 클래스 — `PaginationRequestDto` 상속
  - `isPublished?: boolean` 필드 (`@IsBoolean`, `@IsOptional`)
  - `@Transform`으로 문자열 `'true'`/`'false'` → boolean 변환
    - `@Type(() => Boolean)` 미사용 이유: `Boolean('false') === true` 버그 방지

---

## Phase 5: Repository 구현 수정

- [x] `src/posts/post.repository.ts` 수정
  - `findAllPaginated`에 `filter: PostFilter = {}` 파라미터 추가
  - `FindOptionsWhere<Post>`로 `isPublished` 조건 적용
  - `filter.isPublished !== undefined` 체크 (`false` 값을 올바르게 처리하기 위해)

---

## Phase 6: Handler 수정

- [x] `src/posts/query/find-all-posts-paginated.handler.ts` 수정
  - `query.filter`를 `findAllPaginated`의 세 번째 인자로 전달
  - 그 외 로직 변경 없음 (pass-through)

---

## Phase 7: Controller 수정

- [x] `src/posts/posts.controller.ts` 수정
  - `PaginationRequestDto` → `PostsPaginationRequestDto`로 교체
  - `FindAllPostsPaginatedQuery` 생성 시 `{ isPublished: dto.isPublished }` 전달

---

## Phase 8: 단위 테스트 수정

- [x] `src/posts/query/find-all-posts-paginated.handler.spec.ts` 수정
  - mock 호출 검증에 `filter` 인자(`{}`) 추가
  - 기존 테스트는 `new FindAllPostsPaginatedQuery(1, 2)` → `filter = {}`가 기본값이므로 동작 유지

---

## Phase 9: 통합 테스트 추가

Classical School 원칙에 따라, 필터링 로직(Repository의 TypeORM `where` 절)은 통합 테스트로 검증한다.

- [x] `test/posts.integration-spec.ts` — `GET /posts` 블록에 4개 테스트 추가
  - `isPublished=true` 필터링
  - `isPublished=false` 필터링
  - `isPublished` 필터 + 페이지네이션 조합
  - 잘못된 `isPublished` 값 → 400 에러

---

## Phase 10: 검증

- [x] `pnpm build:local` — 빌드 성공
- [x] `pnpm test` — 단위 테스트 18/18 통과
- [x] `pnpm format --check` — 포맷팅 통과
- [ ] `pnpm test:e2e` — 통합 테스트 통과 확인 (Docker 필요)

---

## Request Flow (필터 적용 후)

```text
GET /posts?page=1&limit=10&isPublished=true
    ↓
PostsController.findAllPaginated(dto: PostsPaginationRequestDto)
    ↓  (ValidationPipe: page ≥ 1, limit ∈ [1,100], isPublished → boolean 변환)
    ↓
new FindAllPostsPaginatedQuery(page, limit, { isPublished: true })
    ↓
QueryBus.execute()
    ↓
FindAllPostsPaginatedHandler.execute(query)
    ↓
IPostReadRepository.findAllPaginated(1, 10, { isPublished: true })
    ↓
PostRepository → TypeORM findAndCount({ where: { isPublished: true }, skip: 0, take: 10 })
    ↓
PaginatedResponseDto.of(items, totalElements, page, limit)
```

---

## 파일 변경 요약

### 신규 생성 (2개)

| 파일                                              | 유형             |
| ------------------------------------------------- | ---------------- |
| `src/common/query/paginated.query.ts`             | 공통 추상 클래스 |
| `src/posts/dto/request/find-posts.request.dto.ts` | Request DTO      |

### 수정 (5개)

| 파일                                                    | 변경 내용                                                |
| ------------------------------------------------------- | -------------------------------------------------------- |
| `src/posts/interface/post-read-repository.interface.ts` | `PostFilter` 타입 추가, `findAllPaginated` 시그니처 변경 |
| `src/posts/query/find-all-posts-paginated.query.ts`     | `PaginatedQuery` 상속, `filter` 필드 추가                |
| `src/posts/query/find-all-posts-paginated.handler.ts`   | `query.filter` 전달                                      |
| `src/posts/post.repository.ts`                          | `FindOptionsWhere`로 `isPublished` 필터 구현             |
| `src/posts/posts.controller.ts`                         | `PostsPaginationRequestDto` 적용, 필터 객체 전달         |

### 테스트 수정 (2개)

| 파일                                                       | 변경 내용                               |
| ---------------------------------------------------------- | --------------------------------------- |
| `src/posts/query/find-all-posts-paginated.handler.spec.ts` | mock 호출 검증에 `filter` 인자 추가     |
| `test/posts.integration-spec.ts`                           | `isPublished` 필터 통합 테스트 4개 추가 |
