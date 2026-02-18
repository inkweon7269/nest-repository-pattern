# CQRS 리팩토링 체크리스트

> Facade → CQRS/Mediator 패턴 전환 작업의 단계별 체크리스트.
> 각 단계는 의존성 순서로 정렬되어 있으며, 순서대로 진행해야 한다.

---

## Phase 1: 환경 준비

- [ ] `@nestjs/cqrs` 패키지 설치
  ```bash
  pnpm add @nestjs/cqrs
  ```

---

## Phase 2: Command 클래스 생성

시스템 상태를 **변경**하는 의도를 표현하는 순수 값 객체.

- [ ] `src/posts/command/create-post.command.ts` 생성
  - 필드: `title: string`, `content: string`, `isPublished?: boolean`
- [ ] `src/posts/command/update-post.command.ts` 생성
  - 필드: `id: number`, `title?: string`, `content?: string`, `isPublished?: boolean`
- [ ] `src/posts/command/delete-post.command.ts` 생성
  - 필드: `id: number`

---

## Phase 3: Query 클래스 생성

시스템 상태를 **조회**하는 의도를 표현하는 순수 값 객체.

- [ ] `src/posts/query/get-post-by-id.query.ts` 생성
  - 필드: `id: number`
- [ ] `src/posts/query/find-all-posts-paginated.query.ts` 생성
  - 필드: `page: number`, `limit: number`, `skip: number`, `take: number`

---

## Phase 4: Command Handler 구현

각 Handler는 `@CommandHandler` 데코레이터로 장식하고 `ICommandHandler<T>` 인터페이스를 구현한다.

- [ ] `src/posts/command/create-post.handler.ts` 구현
  - 주입: `IPostWriteRepository`
  - 로직: `create(dto)` → `PostResponseDto.of(post)` 반환
- [ ] `src/posts/command/update-post.handler.ts` 구현
  - 주입: `IPostReadRepository` + `IPostWriteRepository`
  - 로직: `findById(id)` → null이면 `NotFoundException` → `update(id, dto)` → `PostResponseDto.of(post)` 반환
- [ ] `src/posts/command/delete-post.handler.ts` 구현
  - 주입: `IPostReadRepository` + `IPostWriteRepository`
  - 로직: `findById(id)` → null이면 `NotFoundException` → `delete(id)`

---

## Phase 5: Query Handler 구현

각 Handler는 `@QueryHandler` 데코레이터로 장식하고 `IQueryHandler<T, R>` 인터페이스를 구현한다.

- [ ] `src/posts/query/get-post-by-id.handler.ts` 구현
  - 주입: `IPostReadRepository`
  - 로직: `findById(id)` → null이면 `NotFoundException` → `PostResponseDto.of(post)` 반환
- [ ] `src/posts/query/find-all-posts-paginated.handler.ts` 구현
  - 주입: `IPostReadRepository`
  - 로직: `findAllPaginated(skip, take)` → `map PostResponseDto.of` → `PaginatedResponseDto.of(items, totalElements, page, limit)` 반환

---

## Phase 6: Controller 수정

- [ ] `src/posts/posts.controller.ts` 수정
  - `PostsFacade` 의존성 제거
  - `CommandBus`, `QueryBus` 주입 (`@nestjs/cqrs`)
  - 각 엔드포인트에서 Command/Query 객체 생성 후 `bus.execute()` 호출
  - Swagger 데코레이터(`@ApiTags`, `@ApiOperation`) 유지
  - 반환 타입 어노테이션 유지

---

## Phase 7: Module 수정

- [ ] `src/posts/posts.module.ts` 수정
  - `CqrsModule` import 추가
  - `commandHandlers` 배열 등록: `[CreatePostHandler, UpdatePostHandler, DeletePostHandler]`
  - `queryHandlers` 배열 등록: `[GetPostByIdHandler, FindAllPostsPaginatedHandler]`
  - `PostsFacade`, `PostsService`, `PostsValidationService` providers에서 제거
  - `postRepositoryProviders`는 유지

---

## Phase 8: 레거시 파일 삭제

- [ ] `src/posts/posts.facade.ts` 삭제
- [ ] `src/posts/posts.facade.spec.ts` 삭제
- [ ] `src/posts/service/posts.service.ts` 삭제
- [ ] `src/posts/service/posts-validation.service.ts` 삭제
- [ ] `src/posts/service/` 디렉토리 삭제 (비어 있으면)

---

## Phase 9: 단위 테스트 작성

Classical School 원칙에 따라, DTO 변환 또는 NotFoundException 분기가 있는 Handler만 단위 테스트.

- [ ] `src/posts/command/update-post.handler.spec.ts` 작성
  - mock: `IPostReadRepository`, `IPostWriteRepository`
  - 케이스 1: 존재하는 post → 업데이트 후 `PostResponseDto` 변환 검증
  - 케이스 2: 존재하지 않는 post → `NotFoundException` 발생 검증
- [ ] `src/posts/command/delete-post.handler.spec.ts` 작성
  - mock: `IPostReadRepository`, `IPostWriteRepository`
  - 케이스 1: 존재하는 post → `delete` 호출 검증
  - 케이스 2: 존재하지 않는 post → `NotFoundException` 발생 검증
- [ ] `src/posts/query/get-post-by-id.handler.spec.ts` 작성
  - mock: `IPostReadRepository`
  - 케이스 1: 존재하는 post → `PostResponseDto` 변환 검증
  - 케이스 2: 존재하지 않는 post → `NotFoundException` 발생 검증
- [ ] `src/posts/query/find-all-posts-paginated.handler.spec.ts` 작성
  - mock: `IPostReadRepository`
  - 케이스: DTO 변환 + `PaginatedResponseDto` 메타 정보(page, limit, totalPages, isFirst, isLast) 검증

> **참고**: `CreatePostHandler`는 pass-through 성격이므로 단위 테스트 대상이 아님. 통합 테스트로 커버.

---

## Phase 10: 검증

### 10.1 단위 테스트

- [ ] `pnpm test` 실행 — 모든 단위 테스트 통과 확인
  - Handler 단위 테스트 (4개 파일)
  - 기존 DTO 단위 테스트 (2개 파일, 변경 없음)

### 10.2 통합 테스트

- [ ] `pnpm test:e2e` 실행 — 통합 테스트 통과 확인 (Docker 필요)
  - `test/posts.integration-spec.ts`는 HTTP 레벨 검증이므로 내부 구조 변경에 무관해야 함

### 10.3 빌드

- [ ] `pnpm build:local` 실행 — 빌드 성공 확인

### 10.4 린트

- [ ] `pnpm lint` 실행 — 린트 통과 확인

### 10.5 수동 검증 (선택)

- [ ] `pnpm start:local` — 로컬 서버 기동
- [ ] `http://localhost:3000/api` — Swagger UI에서 각 엔드포인트 수동 테스트
  - [ ] `POST /posts` — 게시글 생성
  - [ ] `GET /posts` — 페이지네이션 조회
  - [ ] `GET /posts/:id` — ID 조회
  - [ ] `PATCH /posts/:id` — 게시글 수정
  - [ ] `DELETE /posts/:id` — 게시글 삭제

---

## Phase 11: 문서 업데이트

- [ ] `CLAUDE.md` 업데이트
  - Architecture 섹션의 Request Flow를 CQRS 구조로 변경
  - Facade/Service/ValidationService 관련 설명 제거
  - Command/Query/Handler 구조 설명 추가

---

## 파일 변경 요약

### 신규 생성 (14개)

| 파일 | 유형 |
|------|------|
| `src/posts/command/create-post.command.ts` | Command |
| `src/posts/command/create-post.handler.ts` | Command Handler |
| `src/posts/command/update-post.command.ts` | Command |
| `src/posts/command/update-post.handler.ts` | Command Handler |
| `src/posts/command/update-post.handler.spec.ts` | 단위 테스트 |
| `src/posts/command/delete-post.command.ts` | Command |
| `src/posts/command/delete-post.handler.ts` | Command Handler |
| `src/posts/command/delete-post.handler.spec.ts` | 단위 테스트 |
| `src/posts/query/get-post-by-id.query.ts` | Query |
| `src/posts/query/get-post-by-id.handler.ts` | Query Handler |
| `src/posts/query/get-post-by-id.handler.spec.ts` | 단위 테스트 |
| `src/posts/query/find-all-posts-paginated.query.ts` | Query |
| `src/posts/query/find-all-posts-paginated.handler.ts` | Query Handler |
| `src/posts/query/find-all-posts-paginated.handler.spec.ts` | 단위 테스트 |

### 수정 (2개)

| 파일 | 변경 내용 |
|------|-----------|
| `src/posts/posts.controller.ts` | `PostsFacade` → `CommandBus`/`QueryBus` 주입 |
| `src/posts/posts.module.ts` | `CqrsModule` import, Handler 등록, Facade/Service/Validation 제거 |

### 삭제 (4개)

| 파일 | 이유 |
|------|------|
| `src/posts/posts.facade.ts` | Handler로 대체됨 |
| `src/posts/posts.facade.spec.ts` | Handler 테스트로 대체됨 |
| `src/posts/service/posts.service.ts` | Handler가 Repository 직접 호출 |
| `src/posts/service/posts-validation.service.ts` | 검증 로직이 Handler 내부로 이동 |

### 변경 없음

| 파일 | 이유 |
|------|------|
| `src/posts/interface/post-read-repository.interface.ts` | Repository 패턴 유지 |
| `src/posts/interface/post-write-repository.interface.ts` | Repository 패턴 유지 |
| `src/posts/post.repository.ts` | 데이터 접근 레이어 유지 |
| `src/posts/post-repository.provider.ts` | DI 패턴 유지 |
| `src/posts/entities/post.entity.ts` | 엔티티 변경 없음 |
| `src/posts/dto/**` | DTO 구조 유지 |
| `src/common/**` | 공통 유틸 유지 |
| `test/posts.integration-spec.ts` | HTTP 레벨 검증으로 내부 구조에 무관 |
