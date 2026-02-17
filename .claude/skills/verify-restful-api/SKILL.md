---
name: verify-restful-api
description: RESTful API 설계 원칙 준수 여부를 검증합니다. 컨트롤러, DTO, Swagger 문서화 추가/수정 후 사용.
---

# RESTful API 설계 원칙 검증

## Purpose

1. **HTTP 메서드 매핑** — CRUD 연산에 올바른 HTTP 메서드(GET/POST/PATCH/DELETE)가 사용되었는지 검증
2. **HTTP 상태 코드** — 각 연산에 적절한 상태 코드가 반환되는지 검증 (200, 201, 204 등)
3. **리소스 명명 규칙** — 라우트 경로가 복수 명사, kebab-case를 사용하고 동사를 포함하지 않는지 검증
4. **DTO 규약** — 요청/응답 DTO가 프로젝트 규약(class-validator, static of(), Swagger 데코레이터)을 따르는지 검증
5. **컨트롤러 책임 분리** — 컨트롤러가 라우팅만 담당하고 비즈니스 로직을 포함하지 않는지 검증

## When to Run

- 새 컨트롤러 또는 엔드포인트를 추가한 후
- 기존 엔드포인트의 HTTP 메서드, 상태 코드, 라우트 경로를 수정한 후
- 요청/응답 DTO를 추가하거나 수정한 후
- Swagger 문서화를 추가하거나 수정한 후
- 새 도메인 모듈을 생성한 후

## Related Files

| File | Purpose |
| ---- | ------- |
| `src/posts/posts.controller.ts` | Posts 컨트롤러 (HTTP 라우팅, 데코레이터) |
| `src/posts/dto/request/create-post.request.dto.ts` | 생성 요청 DTO (class-validator 검증) |
| `src/posts/dto/request/update-post.request.dto.ts` | 수정 요청 DTO (class-validator 검증) |
| `src/posts/dto/response/post.response.dto.ts` | 응답 DTO (static of() 팩토리, Swagger) |
| `src/posts/posts.facade.ts` | Facade (DTO 변환, 오케스트레이션) |
| `src/main.ts` | 글로벌 ValidationPipe, Swagger 설정 |

## Workflow

### Step 1: 컨트롤러 파일 수집

**도구:** Glob

**패턴:** `src/**/*.controller.ts`

모든 컨트롤러 파일을 수집합니다. 이후 단계에서 각 컨트롤러에 대해 검사를 수행합니다.

---

### Step 2: 리소스 라우트 명명 규칙 검증

**도구:** Grep, Read

**검사:** `@Controller()` 데코레이터의 경로 값이 RESTful 규칙을 따르는지 확인합니다.

```bash
# 모든 컨트롤러의 @Controller 데코레이터와 경로 추출
grep -n "@Controller(" src/**/*.controller.ts
```

**PASS 기준:**
- 경로가 **복수 명사**를 사용 (예: `posts`, `users`, `comments`)
- 경로가 **kebab-case**를 사용 (예: `blog-posts`, 카멜케이스 아님)
- 경로에 **동사가 포함되지 않음** (예: `get-posts`, `create-user` 금지)
- 경로가 **소문자**만 사용

**FAIL 기준:**
- 단수 명사 사용: `@Controller('post')` → `@Controller('posts')`로 수정
- 동사 포함: `@Controller('get-posts')` → `@Controller('posts')`로 수정
- 카멜케이스: `@Controller('blogPosts')` → `@Controller('blog-posts')`로 수정

---

### Step 3: HTTP 메서드와 CRUD 연산 매핑 검증

**도구:** Read

**검사:** 각 컨트롤러 파일을 읽고 HTTP 메서드가 올바른 CRUD 연산에 매핑되는지 확인합니다.

**PASS 기준:**
- `@Get()` 또는 `@Get(':id')` — 조회(Read) 연산에만 사용
- `@Post()` — 생성(Create) 연산에만 사용
- `@Patch(':id')` — 부분 수정(Partial Update) 연산에 사용
- `@Delete(':id')` — 삭제(Delete) 연산에 사용
- 개별 리소스 조작 시 경로에 `:id` 파라미터 포함

**FAIL 기준:**
- `@Post()` 로 조회를 수행하는 경우
- `@Get()` 으로 리소스를 생성/수정/삭제하는 경우
- `@Put()` 과 `@Patch()` 가 동일 리소스에 중복 존재하는 경우 (프로젝트 규약: PATCH만 사용)
- 단일 리소스 조작(`update`, `delete`, `getById`)에 `:id` 파라미터가 없는 경우

---

### Step 4: HTTP 상태 코드 검증

**도구:** Grep, Read

**검사:** 각 엔드포인트가 적절한 HTTP 상태 코드를 반환하는지 확인합니다.

```bash
# @HttpCode 데코레이터 사용 현황 확인
grep -n "@HttpCode\|@Delete\|@Post\|@Patch\|@Get" src/**/*.controller.ts
```

**PASS 기준:**
- `@Get` — 200 OK (NestJS 기본값, `@HttpCode` 불필요)
- `@Post` — 201 Created (NestJS 기본값, `@HttpCode` 불필요)
- `@Patch` — 200 OK (NestJS 기본값, `@HttpCode` 불필요)
- `@Delete` — `@HttpCode(HttpStatus.NO_CONTENT)` 명시 (204)

**FAIL 기준:**
- `@Delete` 메서드에 `@HttpCode(HttpStatus.NO_CONTENT)` 가 없는 경우
- `@Post` 메서드에 `@HttpCode(HttpStatus.OK)` 를 명시하여 201 대신 200을 반환하는 경우
- `@Get` 메서드에 불필요한 `@HttpCode(HttpStatus.OK)` 를 명시한 경우 (중복, 제거 권장)

---

### Step 5: 컨트롤러 책임 분리 검증

**도구:** Read

**검사:** 컨트롤러가 라우팅(HTTP 데코레이터)만 담당하고, 비즈니스 로직을 포함하지 않는지 확인합니다.

**PASS 기준:**
- 컨트롤러 메서드가 Facade 메서드를 단일 호출 후 바로 반환
- 컨트롤러에 `if/else`, `try/catch`, 반복문, 직접적인 데이터 변환이 없음
- 컨트롤러가 Repository, Service를 직접 주입하지 않음 (Facade만 주입)

**FAIL 기준:**
- 컨트롤러 메서드 내에 `if`, `for`, `while`, `try`, `switch` 키워드가 존재
- 컨트롤러가 `PostsService`, `IPostReadRepository` 등을 직접 주입
- 컨트롤러 메서드 내에서 `new PostResponseDto()` 등 DTO 변환을 수행

---

### Step 6: 파라미터 데코레이터 검증

**도구:** Grep, Read

**검사:** 경로 파라미터와 요청 본문에 적절한 데코레이터가 사용되는지 확인합니다.

```bash
# @Param 사용 시 ParseIntPipe 동반 여부 확인
grep -n "@Param(" src/**/*.controller.ts
```

**PASS 기준:**
- 숫자 ID 파라미터에 `@Param('id', ParseIntPipe)` 사용
- 요청 본문에 `@Body()` 데코레이터와 타입이 지정된 DTO 사용
- `@Body()` 의 DTO 타입이 `*RequestDto` 패턴을 따름

**FAIL 기준:**
- `@Param('id')` 만 사용하고 `ParseIntPipe` 누락 (문자열로 전달됨)
- `@Body()` 에 DTO 타입 미지정: `@Body() body` → `@Body() dto: CreatePostRequestDto`
- 요청 본문에 `any` 타입 사용

---

### Step 7: 요청 DTO 규약 검증

**도구:** Glob, Read

**패턴:** `src/**/dto/request/*.dto.ts`

**검사:** 모든 요청 DTO가 프로젝트 규약을 따르는지 확인합니다.

**PASS 기준:**
- 파일명이 `{operation}-{resource}.request.dto.ts` 패턴 (예: `create-post.request.dto.ts`)
- 클래스명이 `{Operation}{Resource}RequestDto` 패턴 (예: `CreatePostRequestDto`)
- 모든 필드에 `class-validator` 데코레이터 적용 (`@IsString`, `@IsNotEmpty`, `@IsBoolean` 등)
- 모든 필드에 Swagger 데코레이터 적용 (`@ApiProperty` 또는 `@ApiPropertyOptional`)
- Update DTO의 모든 필드가 optional (`?` 접미사 + `@IsOptional()`)

**FAIL 기준:**
- `class-validator` 데코레이터가 없는 필드 존재
- Swagger 데코레이터가 없는 필드 존재
- Create DTO의 필수 필드에 `@IsNotEmpty()` 누락
- Update DTO의 필드에 `@IsOptional()` 누락

---

### Step 8: 응답 DTO 규약 검증

**도구:** Glob, Read

**패턴:** `src/**/dto/response/*.dto.ts`

**검사:** 모든 응답 DTO가 프로젝트 규약을 따르는지 확인합니다.

**PASS 기준:**
- 파일명이 `{resource}.response.dto.ts` 패턴 (예: `post.response.dto.ts`)
- 클래스명이 `{Resource}ResponseDto` 패턴 (예: `PostResponseDto`)
- `static of(entity): Dto` 팩토리 메서드 존재
- 모든 필드에 `@ApiProperty()` 데코레이터 적용

**FAIL 기준:**
- `static of()` 메서드 미존재
- `@ApiProperty()` 데코레이터가 없는 필드 존재
- 응답 DTO에 `class-validator` 데코레이터 사용 (응답은 검증 불필요)

---

### Step 9: Swagger 문서화 검증

**도구:** Grep, Read

**검사:** 모든 컨트롤러와 엔드포인트에 Swagger 문서화가 적용되어 있는지 확인합니다.

```bash
# 컨트롤러 클래스에 @ApiTags 존재 여부
grep -n "@ApiTags\|@Controller" src/**/*.controller.ts

# 엔드포인트에 @ApiOperation 존재 여부
grep -n "@ApiOperation\|@Get\|@Post\|@Patch\|@Delete" src/**/*.controller.ts
```

**PASS 기준:**
- 모든 컨트롤러 클래스에 `@ApiTags()` 데코레이터 존재
- 모든 엔드포인트 메서드에 `@ApiOperation({ summary: '...' })` 데코레이터 존재

**FAIL 기준:**
- `@ApiTags()` 가 없는 컨트롤러 존재
- `@ApiOperation()` 이 없는 엔드포인트 존재

---

### Step 10: ValidationPipe 글로벌 설정 검증

**도구:** Read

**파일:** `src/main.ts`

**검사:** 글로벌 ValidationPipe가 올바르게 설정되어 있는지 확인합니다.

**PASS 기준:**
- `app.useGlobalPipes(new ValidationPipe({...}))` 존재
- `whitelist: true` 설정됨 (DTO에 없는 속성 자동 제거)
- `forbidNonWhitelisted: true` 설정됨 (DTO에 없는 속성 전달 시 400 에러)
- `transform: true` 설정됨 (페이로드를 DTO 인스턴스로 자동 변환)

**FAIL 기준:**
- `useGlobalPipes` 호출 누락
- `whitelist`, `forbidNonWhitelisted`, `transform` 중 하나라도 누락 또는 `false`

## Output Format

```markdown
## verify-restful-api 검증 결과

| # | 검사 | 대상 파일 | 결과 | 상세 |
|---|------|----------|------|------|
| 1 | 리소스 명명 | `posts.controller.ts` | PASS | 복수 명사 `posts` 사용 |
| 2 | HTTP 메서드 매핑 | `posts.controller.ts` | PASS | GET/POST/PATCH/DELETE 올바름 |
| 3 | HTTP 상태 코드 | `posts.controller.ts` | PASS | DELETE 204, POST 201 등 |
| ... | ... | ... | ... | ... |

**총 검사: N개 | PASS: X개 | FAIL: Y개 | 면제: Z개**
```

## Exceptions

다음은 **위반이 아닙니다**:

1. **커스텀 액션 엔드포인트** — RESTful 리소스 CRUD가 아닌 특수 연산(예: `@Post(':id/publish')`)은 동사가 포함될 수 있으며, 이는 RPC-style 서브리소스 액션으로 허용됩니다
2. **벌크 연산 엔드포인트** — `@Delete()` (ID 없이)로 다건 삭제를 수행하는 경우, 요청 본문에 ID 목록을 전달하는 패턴은 허용됩니다
3. **상태 코드 커스터마이징** — `@Post` 에서 비동기 처리를 위해 `@HttpCode(HttpStatus.ACCEPTED)` (202)를 반환하는 것은 유효한 RESTful 패턴입니다
4. **HealthCheck/Metrics 컨트롤러** — 인프라 용도의 컨트롤러(`health.controller.ts`, `metrics.controller.ts`)는 RESTful 리소스 규약에서 면제됩니다
