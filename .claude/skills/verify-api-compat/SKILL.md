---
name: verify-api-compat
description: API 하위 호환성을 검증합니다. Response DTO의 of() 누락 필드, Request DTO 필수 필드 신규 추가/제거, Response DTO 필드 제거·타입 변경, 라우트 시그니처 변경 등 클라이언트를 깨뜨릴 수 있는 변경을 git diff 기반으로 검출합니다. DTO/컨트롤러 변경 후 사용.
---

# API 하위 호환성 검증

## Purpose

DTO 및 컨트롤러 변경이 기존 클라이언트(프론트엔드, 외부 API consumer, Swagger 문서 사용자)에 미치는 영향을 점검합니다. RESTful 정적 규약 점검은 별도 스킬(`verify-restful-api`)에서 다루며, 본 스킬은 **변경분 기반의 호환성 위험**에 집중합니다.

1. **C1: Response DTO `of()` 누락 필드** — 클래스에 선언된 필드가 `of()` 본문에서 설정되지 않으면 응답에 `undefined`로 누락 (런타임 회귀)
2. **C2: Request DTO 필수 필드 신규 추가** — 기존 클라이언트가 보내지 않는 필수 필드가 추가되면 검증 실패. 새 필드는 옵셔널(`@IsOptional()` + `?`)로 추가하거나 버전 분기 권장
3. **C3: Response DTO 필드 제거·이름 변경** — 응답 필드 삭제는 클라이언트 깨짐 (deprecation 단계 거치지 않은 경우 경고)
4. **C4: Request/Response DTO 필드 타입 변경** — 동일 필드명으로 타입을 바꾸면 클라이언트 직렬화/역직렬화 실패 가능
5. **C5: 컨트롤러 라우트/HTTP 메서드/파라미터 시그니처 변경** — URL이나 메서드가 바뀌면 기존 호출자 깨짐
6. **C6: Idempotency 데코레이터 제거** — `@Idempotent()`이 있던 POST에서 데코레이터 제거 시 중복 요청 보호 상실

## When to Run

- DTO(`*.dto.ts`)를 추가·수정·삭제한 후
- Controller 라우트, 메서드, 파라미터를 변경한 후
- Response 매핑(`of()` 팩토리)을 수정한 후
- PR 전 호환성 점검
- 외부 API consumer가 있는 환경에서 모든 머지 전

## Related Files

| File                                          | Purpose                                            |
| --------------------------------------------- | -------------------------------------------------- |
| `apps/**/*.controller.ts`                     | 라우트 시그니처 (C5, C6)                           |
| `apps/**/dto/request/*.dto.ts`                | Request DTO (C2, C4)                               |
| `apps/**/dto/response/*.dto.ts`               | Response DTO + `of()` 팩토리 (C1, C3, C4)          |
| `libs/shared/src/idempotency/`                | Idempotency 데코레이터 (C6)                        |

## Workflow

### Step 1: 변경 범위 수집

작업 대상은 **변경된 파일**입니다. 전체 코드베이스가 아닙니다.

```bash
# 커밋되지 않은 변경
git diff HEAD --name-only -- 'apps/**/*.dto.ts' 'apps/**/*.controller.ts'

# 브랜치 변경 (main에서 분기된 경우)
git diff main...HEAD --name-only -- 'apps/**/*.dto.ts' 'apps/**/*.controller.ts' 2>/dev/null
```

변경 파일이 없으면 "검사 대상 없음"으로 종료. 특정 PR을 검토할 때는 `gh pr diff <num>` 또는 `git diff <base>..<head>`로 범위 지정.

---

### Step 2: C1 — Response DTO `of()` 누락 필드 검출

**도구:** Bash, Read

**검사:** 각 Response DTO에서 클래스 필드 선언 수와 `of()` 본문의 `dto.<field> = ...` 할당 수를 비교.

```bash
for f in $(find apps -path "*/dto/response/*.dto.ts" -not -name "*.spec.ts"); do
  # 클래스 필드 선언: 데코레이터 괄호 밖에서 'name: type;' 또는 'name?: type;' 또는 'name!: type;'
  declared=$(awk '
    /^[[:space:]]*static [[:space:]]*of[[:space:]]*\(/ { exit }
    {
      # 데코레이터 안(괄호 depth > 0)이면 무시
      n = split($0, chars, "")
      for (i = 1; i <= n; i++) {
        c = chars[i]
        if (c == "(") deco_depth++
        else if (c == ")") deco_depth--
      }
    }
    # 데코레이터 라인 통과
    /^[[:space:]]*@[A-Z]/ && deco_depth >= 0 { next }
    # 필드 선언: 들여쓰기 + identifier + (?|!)? + : + ... + ; 로 끝
    deco_depth == 0 && /^[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*[?!]?:[[:space:]].*;[[:space:]]*$/ { print }
  ' "$f" | wc -l | tr -d " ")

  assigned=$(awk '
    /static [[:space:]]*of[[:space:]]*\(/ { in_of = 1; depth = 0 }
    in_of {
      n = split($0, chars, "")
      for (i = 1; i <= n; i++) {
        c = chars[i]
        if (c == "{") depth++
        else if (c == "}") {
          depth--
          if (depth == 0) { in_of = 0; break }
        }
      }
      if (in_of && $0 ~ /dto\.[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*=/) print
    }
  ' "$f" | wc -l | tr -d " ")

  if [ "$declared" -gt 0 ] && [ "$declared" -ne "$assigned" ]; then
    printf "%s: declared %s fields but of() assigns %s\n" "$f" "$declared" "$assigned"
  fi
done
```

**PASS 기준:**
- 모든 Response DTO에서 선언 필드 수 = `of()` 할당 수
- `of()`에 if-else 분기가 있어 조건부 할당된 필드가 있어도, 모든 분기에서 결국 할당됨

**FAIL 기준:**
- 선언 필드 수 > `of()` 할당 수 — 누락된 필드는 응답에 `undefined`로 직렬화 (`class-transformer`가 제거하지 않는 한). 클라이언트가 그 필드를 기대하면 런타임 회귀

**비고:** 정적 카운트 비교라 false positive 가능 (분기 할당, helper 함수 사용 등). 발견 시 해당 DTO를 직접 읽어 의도 확인.

**수정 권장:**
```ts
// ❌ password를 of()에서 누락
export class UserResponseDto {
  id: number;
  email: string;
  name: string;
  static of(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    // dto.name = user.name;  ← 누락
    return dto;
  }
}
```

---

### Step 3: C2 — Request DTO 필수 필드 신규 추가 (git diff)

**도구:** Bash

**검사:** `git diff`로 Request DTO에서 새로 추가된 필드 중 `@IsOptional()` 없이 추가된 필드를 검출.

```bash
for f in $(git diff HEAD --name-only -- 'apps/**/dto/request/*.dto.ts'); do
  # 추가된(+) 라인 중 필드 선언이면서 같은 hunk에 IsOptional이 없는 경우
  git diff HEAD -- "$f" | awk '
    /^@@/ { in_hunk = 1; added_field = ""; saw_optional = 0 }
    in_hunk && /^\+.*[a-zA-Z_][a-zA-Z0-9_]*:[[:space:]]/ && /^\+[[:space:]]+[a-zA-Z]/ {
      if (added_field != "" && !saw_optional) printf "%s: added required field: %s\n", FILENAME, added_field
      added_field = $0
      saw_optional = 0
    }
    in_hunk && /^\+.*@IsOptional\(\)/ { saw_optional = 1 }
    /^@@/ {
      if (added_field != "" && !saw_optional) printf "%s: added required field: %s\n", FILENAME, added_field
      added_field = ""; saw_optional = 0
    }
    END {
      if (added_field != "" && !saw_optional) printf "%s: added required field: %s\n", FILENAME, added_field
    }
  ' FILENAME="$f"
done
```

**PASS 기준:**
- Request DTO에 새 필드가 없거나, 모든 새 필드가 `@IsOptional()` + `?` 옵셔널

**FAIL 기준 (경고):**
- 새 필수 필드 추가 — 기존 클라이언트가 그 필드를 보내지 않으면 ValidationPipe에서 400 반환

**수정 권장:**
- 옵션 A (권장): 옵셔널로 추가 (`@IsOptional()` + `?`) + 핸들러에서 default 값 처리
- 옵션 B: API 버전 분기 (`/v2/`)
- 옵션 C: feature flag로 점진 출시 후 강제 전환

---

### Step 4: C3 — Response DTO 필드 제거·이름 변경 (git diff)

**도구:** Bash

**검사:** Response DTO에서 제거(-)된 필드 선언 검출.

```bash
for f in $(git diff HEAD --name-only -- 'apps/**/dto/response/*.dto.ts'); do
  removed=$(git diff HEAD -- "$f" | grep -E "^-[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*[?!]?:[[:space:]]" | grep -vE "^---")
  if [ -n "$removed" ]; then
    printf "%s: removed/renamed response fields:\n%s\n" "$f" "$removed"
  fi
done
```

**PASS 기준:**
- Response DTO 필드 제거·이름 변경이 없거나, 모든 제거가 deprecation 단계(예: 사전 공지/주석 후 후속 PR에서 제거)에서 진행

**FAIL 기준 (경고):**
- 응답 필드 즉시 제거·이름 변경 — 클라이언트가 해당 필드를 사용하면 즉시 깨짐

**수정 권장:**
- 옵션 A: 필드 유지 + 새 필드 추가, 차후 메이저 버전(`/v2/`)에서 제거
- 옵션 B: `@deprecated` JSDoc + Swagger description에 deprecation 명시 → 후속 PR에서 제거

---

### Step 5: C4 — Request/Response DTO 필드 타입 변경 (git diff)

**도구:** Bash

**검사:** 동일 필드명에서 `:` 뒤 타입이 변경된 경우.

```bash
for f in $(git diff HEAD --name-only -- 'apps/**/dto/*/*.dto.ts'); do
  # diff에서 같은 필드의 - 와 + 를 찾고 타입 비교
  git diff HEAD -- "$f" | awk '
    /^-[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)[?!]?:/ {
      match($0, /([a-zA-Z_][a-zA-Z0-9_]*)[?!]?:[[:space:]]*(.*)/, arr)
      removed[arr[1]] = arr[2]
    }
    /^\+[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)[?!]?:/ {
      match($0, /([a-zA-Z_][a-zA-Z0-9_]*)[?!]?:[[:space:]]*(.*)/, arr)
      if (arr[1] in removed && removed[arr[1]] != arr[2]) {
        printf "%s: field %s type changed: %s -> %s\n", FILENAME, arr[1], removed[arr[1]], arr[2]
      }
    }
  ' FILENAME="$f"
done
```

**PASS 기준:**
- 변경된 DTO에서 동일 이름 필드의 타입이 유지됨

**FAIL 기준 (경고):**
- 같은 필드명으로 타입 변경 (예: `string` → `number`, `Date` → `string`) — 직렬화/역직렬화 실패 가능

**수정 권장:**
- 새 이름의 필드를 추가하고 기존 필드는 deprecate
- 또는 API 버전 분기

---

### Step 6: C5 — 컨트롤러 라우트/HTTP 메서드 시그니처 변경 (git diff)

**도구:** Bash

**검사:** Controller 파일의 변경 hunk에서 라우트 데코레이터(`@Get/@Post/@Patch/@Delete`)의 인자(경로) 변경 또는 데코레이터 자체 변경 검출.

```bash
for f in $(git diff HEAD --name-only -- 'apps/**/*.controller.ts'); do
  git diff HEAD -- "$f" | awk '
    /^-.*@(Get|Post|Patch|Delete|Put)\(/ { removed[NR] = $0 }
    /^\+.*@(Get|Post|Patch|Delete|Put)\(/ { added[NR] = $0 }
    END {
      if (length(removed) > 0 || length(added) > 0) {
        printf "%s: route signature changed:\n", FILENAME
        for (k in removed) printf "  - %s\n", removed[k]
        for (k in added)   printf "  + %s\n", added[k]
      }
    }
  ' FILENAME="$f"
done
```

**PASS 기준:**
- Controller 라우트 데코레이터에 변경이 없음

**FAIL 기준 (경고):**
- 라우트 경로(`@Post('xxx')` 인자) 또는 HTTP 메서드 자체가 변경 — 외부 호출자 깨짐
- `@Param`/`@Body` 시그니처 변경도 함께 검토 (현재 검사 범위 외, 수동)

**수정 권장:**
- 새 라우트 경로 또는 메서드 추가 (이전 경로/메서드도 일정 기간 유지)
- 메이저 버전 분기 (`/v2/`)

---

### Step 7: C6 — `@Idempotent()` 데코레이터 제거 (git diff)

**도구:** Bash

```bash
for f in $(git diff HEAD --name-only -- 'apps/**/*.controller.ts'); do
  removed=$(git diff HEAD -- "$f" | grep -E "^-.*@Idempotent\(\)" | grep -vE "^---")
  added=$(  git diff HEAD -- "$f" | grep -E "^\+.*@Idempotent\(\)" | grep -vE "^\+\+\+")
  removed_count=$(printf "%s\n" "$removed" | grep -c "@Idempotent" || true)
  added_count=$(  printf "%s\n" "$added"   | grep -c "@Idempotent" || true)
  if [ "$removed_count" -gt "$added_count" ]; then
    printf "%s: @Idempotent() removed (removed=%d, added=%d)\n" "$f" "$removed_count" "$added_count"
  fi
done
```

**PASS 기준:**
- POST 엔드포인트의 `@Idempotent()` 데코레이터가 의도 없이 사라지지 않음

**FAIL 기준 (경고):**
- 제거 개수가 추가 개수보다 큼 — 중복 요청 보호 상실. 의도된 변경이라면 PR 설명에 명시

---

## Output Format

```markdown
## verify-api-compat 검증 결과

| #   | 규칙 | 대상 파일                                                | 결과 | 상세                                              |
| --- | ---- | -------------------------------------------------------- | ---- | ------------------------------------------------- |
| 1   | C1   | `apps/service/src/posts/dto/response/post.response.dto.ts` | PASS | 7개 필드 선언 / 7개 of() 할당                     |
| 2   | C2   | (변경 파일 없음)                                         | PASS | -                                                 |
| 3   | C3   | (변경 파일 없음)                                         | PASS | -                                                 |
| 4   | C4   | (변경 파일 없음)                                         | PASS | -                                                 |
| 5   | C5   | (변경 파일 없음)                                         | PASS | -                                                 |
| 6   | C6   | (변경 파일 없음)                                         | PASS | -                                                 |

**총 검사: N개 | PASS: X개 | FAIL: Y개 | 경고: Z개**
```

## Exceptions

다음은 **위반이 아닙니다**:

1. **신규 DTO 파일 추가** — git diff에서 모두 `+` 라인이므로 C2/C3/C4가 모두 경고로 잡힐 수 있으나, 이는 **신규 추가**일 뿐 호환성 깨짐이 아님. 파일이 신규(이전에 존재하지 않음)인지 `git log` 또는 `git diff --diff-filter=A`로 구분 가능.
2. **back-office 전용 API 변경** — back-office는 외부 클라이언트가 없는 내부 운영 도구. C2/C3/C5 경고도 운영 합의가 있으면 무시 가능.
3. **`/v2/`, `/v3/` 등 새 버전 분기로 옮긴 변경** — 기존 `/v1/`이 유지되면 C5는 PASS로 간주.
4. **deprecated 표시 후 일정 기간 경과한 필드 제거** — `@deprecated` JSDoc 또는 Swagger description에 명시 후 합의된 기간 경과한 제거는 의도된 변경.
5. **C1 false positive** — 조건부 분기로 필드를 채우는 `of()` 또는 helper 함수 호출은 정적 카운트로 못 잡음. 발견 시 직접 코드 확인.
6. **응답 필드 추가** — 응답에 필드를 **추가**하는 것은 일반적으로 후방 호환. 클라이언트가 unknown field를 무시하는 한 안전.

## Related Skills

| Skill                   | Purpose                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `verify-restful-api`    | DTO/컨트롤러의 RESTful 정적 규약 검증 (`@ApiProperty`, `class-validator`, of() 존재 등) |
| `verify-implementation` | 본 스킬을 포함한 모든 verify 스킬 순차 실행                                             |
| `manage-skills`         | 본 스킬 등록/업데이트                                                                   |
