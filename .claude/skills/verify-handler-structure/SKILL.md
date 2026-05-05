---
name: verify-handler-structure
description: Service 앱 Command Handler의 구조 규칙(메서드 책임 분리, try-catch 범위, @Transactional 범위, 23505 매핑 위치) 회귀를 검증합니다. 핸들러 추가/수정 후 사용.
---

# Command Handler 구조 검증

## Purpose

`apps/service/src/**/command/*.handler.ts`에 정착된 핸들러 구조 패턴이 회귀하지 않도록 자동 점검합니다.

1. **R1: `execute()` 메서드 길이** — `execute()`가 50줄을 초과하면 경고. 의도가 본문에 묻혀 있을 가능성.
2. **R2: try 블록 책임 단일화** — `try { ... }` 안에 `await` 호출이 2개 이상이면 경고. 단일 write 한 줄만 감싸야 함 (이벤트 emit, 캐시 무효화, 추가 write 금지).
3. **R3: `@Transactional()` 안 read 금지** — `@Transactional()` 데코레이터가 붙은 메서드 본문에 `Read` 또는 `findBy` 호출이 있으면 경고. 트랜잭션 안에 read를 넣어 불필요한 락이 잡히는 것을 방지.
4. **R4 (soft, 정보성): `execute()` 본문의 23505 매핑** — `execute()` 본문 안에 `QueryFailedError` 또는 `'23505'` 문자열이 직접 등장하면 경고. 추출된 private 메서드(예: `*OrConflict`) 안에 위치하도록 유도.

## When to Run

- 새 Command Handler를 추가한 후
- 기존 Handler의 `execute()` 또는 private 메서드를 수정한 후
- Handler에 `@Transactional()` 데코레이터를 추가/제거한 후
- Handler에서 try-catch 블록을 추가하거나 수정한 후
- PR 전 회귀 점검

## Related Files

| File                                                                                         | Purpose                                                                |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/service/src/auth/command/register.handler.ts`                                          | 단일 write + 23505 매핑 (`createUserOrConflict`) — 기준 패턴            |
| `apps/service/src/auth/command/login.handler.ts`                                             | read + 검증만, 트랜잭션 없음 — 기준 패턴                               |
| `apps/service/src/auth/command/refresh-token.handler.ts`                                     | JWT 검증 try-catch는 `decodeRefreshPayloadOrUnauthorized`에 격리       |
| `apps/service/src/auth/command/google-login.handler.ts`                                      | `signupAndIssueTokens`만 `@Transactional()`, read는 트랜잭션 밖 — 기준 패턴 |
| `apps/service/src/auth/command/link-google-account.handler.ts`                               | 검증 → write `linkOAuthOrConflict` 패턴                                 |
| `apps/service/src/auth/command/logout.handler.ts`                                            | 단일 write, `@Transactional()` 불필요                                   |
| `apps/service/src/auth/command/unlink-google-account.handler.ts`                             | 단일 write                                                              |
| `apps/service/src/posts/command/create-post.handler.ts`                                      | `persistPostOrConflict` + try 밖 emit/cache invalidation — 기준 패턴    |
| `apps/service/src/posts/command/update-post.handler.ts`                                      | 단일 write + affected count 검증                                        |
| `apps/service/src/posts/command/delete-post.handler.ts`                                      | 단일 write + affected count 검증                                        |

## Workflow

### Step 1: 대상 파일 수집

**도구:** Bash

**검사 대상:** `apps/service/src/**/command/*.handler.ts` (spec 파일 제외)

```bash
find apps/service/src -path "*/command/*.handler.ts" -not -name "*.spec.ts" | sort
```

이후 단계에서 각 파일에 대해 R1-R4 검사를 수행합니다. **back-office 앱은 본 스킬의 검사 범위에 포함되지 않습니다** (별도 리팩터링 스코프).

---

### Step 2: R1 — `execute()` 메서드 길이 검증

**도구:** Bash, Read

**검사:** 각 핸들러의 `async execute(` 메서드가 50줄을 초과하는지 확인합니다.

```bash
for f in $(find apps/service/src -path "*/command/*.handler.ts" -not -name "*.spec.ts"); do
  awk '
    /^[[:space:]]*async execute\(/ { start = NR; depth = 0; in_method = 1 }
    in_method {
      n = split($0, chars, "")
      for (i = 1; i <= n; i++) {
        c = chars[i]
        if (c == "{") depth++
        else if (c == "}") {
          depth--
          if (depth == 0 && start != NR) {
            len = NR - start + 1
            if (len > 50) printf "%s:%d execute() = %d lines (>50)\n", FILENAME, start, len
            in_method = 0
            exit
          }
        }
      }
    }
  ' "$f"
done
```

**PASS 기준:**
- 모든 `execute()` 메서드 본문이 50줄 이하

**FAIL 기준 (경고):**
- `execute()`가 51줄 이상 — 검증/조회/조립이 본문에 인라인된 신호. private 메서드(`validate*`, `load*OrThrow`, `*OrConflict`, `emit*Event`, `invalidate*Cache`)로 추출 권장.

**수정 권장:**
```ts
// ❌ 60줄 execute 본문에 인라인
async execute(command) {
  if (...) throw ...;          // 검증
  const x = await this.repo.findBy...();  // 조회
  if (!x) throw ...;
  try { ... } catch { ... }    // write
  this.eventEmitter.emit(...); // side-effect
  return ...;
}

// ✅ 호출만 평탄화
async execute(command) {
  this.validate...(...);
  const x = await this.load...OrThrow(...);
  await this.persist...OrConflict({...});
  this.emit...Event(...);
  return x.id;
}
```

---

### Step 3: R2 — try 블록 안 await 호출 수 검증

**도구:** Bash, Read

**검사:** 각 핸들러의 `try {` 블록 안에 `await` 호출이 2개 이상 있는지 확인합니다.

```bash
for f in $(find apps/service/src -path "*/command/*.handler.ts" -not -name "*.spec.ts"); do
  awk '
    /try[[:space:]]*\{/ { in_try = 1; depth = 0; awaits = 0; start = NR }
    in_try {
      # 동일 라인의 try { 이후만 카운트
      line = $0
      if (NR == start) {
        sub(/.*try[[:space:]]*\{/, "", line)
      }
      n = split(line, chars, "")
      for (i = 1; i <= n; i++) {
        c = chars[i]
        if (c == "{") depth++
        else if (c == "}") {
          if (depth == 0) {
            if (awaits > 1) printf "%s:%d try block has %d awaits (>1)\n", FILENAME, start, awaits
            in_try = 0
            break
          }
          depth--
        }
      }
      if (in_try && line ~ /\<await\>/) awaits++
    }
  ' "$f"
done
```

**PASS 기준:**
- 모든 `try { ... }` 블록 안에 `await` 호출이 0개 또는 1개

**FAIL 기준 (경고):**
- `try` 블록 안에 `await`가 2개 이상 — 단일 write 외에 이벤트 emit, 캐시 무효화, 추가 write가 함께 묶였을 가능성. catch 책임 모호.

**수정 권장:**
```ts
// ❌ try 안에 write + emit + cache 무효화
async execute(command) {
  try {
    const post = await this.postWriteRepository.create(...);
    this.eventEmitter.emit(...);
    await this.cacheService.delByPattern(...);
    return post.id;
  } catch (error) { /* 23505 매핑 */ }
}

// ✅ try는 write 한 줄, side-effect는 try 밖
async execute(command) {
  const post = await this.persistPostOrConflict({...});  // try 안에 write 1줄
  this.emitCreatedEvent(post.id, ...);                   // try 밖
  await this.invalidateUserCache(...);                   // try 밖
  return post.id;
}

private async persistPostOrConflict(input) {
  try {
    return await this.postWriteRepository.create(input);
  } catch (error) {
    if (error instanceof QueryFailedError && (error.driverError as { code?: string })?.code === '23505') {
      throw new ConflictException(...);
    }
    throw error;
  }
}
```

---

### Step 4: R3 — `@Transactional()` 안 read 금지

**도구:** Bash, Read

**검사:** `@Transactional()` 데코레이터가 붙은 메서드 본문에 `Read` 클래스(예: `userReadRepository`, `IPostReadRepository`) 또는 `findBy` 호출이 있는지 확인합니다.

```bash
for f in $(find apps/service/src -path "*/command/*.handler.ts" -not -name "*.spec.ts"); do
  awk '
    /^[[:space:]]*@Transactional\(\)/ { tx_pending = 1; next }
    tx_pending && /^[[:space:]]*(private|public|protected)?[[:space:]]*async/ {
      tx_pending = 0; in_method = 1; depth = 0; start = NR; next
    }
    in_method {
      n = split($0, chars, "")
      for (i = 1; i <= n; i++) {
        c = chars[i]
        if (c == "{") depth++
        else if (c == "}") {
          depth--
          if (depth == 0 && NR != start) {
            in_method = 0
            break
          }
        }
      }
      if (in_method && ($0 ~ /ReadRepository/ || $0 ~ /\.findBy[A-Z]/)) {
        printf "%s:%d @Transactional method contains read call: %s\n", FILENAME, NR, $0
      }
    }
  ' "$f"
done
```

**PASS 기준:**
- `@Transactional()` 메서드 본문에 `ReadRepository` 또는 `findBy*` 호출 없음

**FAIL 기준 (경고):**
- `@Transactional()` 메서드 본문에 read 호출 발견 — 트랜잭션 범위가 read 분기까지 확장돼 불필요한 락이 잡힐 가능성.

**수정 권장:**
read 호출은 트랜잭션 밖 `execute()`로 이동시키고, `@Transactional()`은 다중 write를 묶은 private 메서드에만 유지.

```ts
// ❌ @Transactional 안에 read
@Transactional()
async execute(command) {
  const oauth = await this.oauthReadRepository.findByProviderId(...);  // read in tx
  if (oauth) {
    const user = await this.userReadRepository.findById(...);          // read in tx
    return this.tokenIssuer.issueTokens(user);
  }
  ...
}

// ✅ read는 트랜잭션 밖, write 묶음만 트랜잭션
async execute(command) {
  const oauth = await this.findExistingOAuth(...);                     // 밖
  if (oauth) return this.loginExistingOAuthUser(...);                  // 밖
  await this.validateEmailAvailable(...);                              // 밖
  return this.signupAndIssueTokens(...);                               // 안
}

@Transactional()
private async signupAndIssueTokens(profile) {
  const user = await this.createUserOrConflict({...});
  await this.linkOAuthOrConflict({...});
  return this.tokenIssuer.issueTokens(user);
}
```

---

### Step 5: R4 (soft, 정보성) — `execute()` 본문에 23505 매핑 직접 등장

**도구:** Bash, Read

**검사:** `execute()` 메서드 본문 안에 `QueryFailedError` 또는 `'23505'` 문자열이 직접 등장하는지 확인합니다.

```bash
for f in $(find apps/service/src -path "*/command/*.handler.ts" -not -name "*.spec.ts"); do
  awk '
    /^[[:space:]]*async execute\(/ { in_method = 1; depth = 0; start = NR }
    in_method {
      n = split($0, chars, "")
      for (i = 1; i <= n; i++) {
        c = chars[i]
        if (c == "{") depth++
        else if (c == "}") {
          depth--
          if (depth == 0 && NR != start) {
            in_method = 0
            break
          }
        }
      }
      if (in_method && ($0 ~ /QueryFailedError/ || $0 ~ /'\''23505'\''/)) {
        printf "%s:%d execute() body references QueryFailedError/23505: %s\n", FILENAME, NR, $0
      }
    }
  ' "$f"
done
```

**PASS 기준:**
- `execute()` 본문에 `QueryFailedError` 및 `'23505'`가 등장하지 않음 (추출된 private 메서드 안에만 위치)

**경고 기준 (soft):**
- `execute()` 본문에 직접 등장 — 매핑이 핸들러 표면에 노출됨. `*OrConflict` 패턴의 private 메서드로 추출 권장.

**비고:** R4는 "위반"이 아닌 정보성 경고입니다. 후속 PR에서 공통 매핑 유틸 도입 시 강한 규칙으로 승격 가능.

---

## Output Format

```markdown
## verify-handler-structure 검증 결과

| #   | 규칙 | 대상 파일                                                | 결과 | 상세                                                |
| --- | ---- | -------------------------------------------------------- | ---- | --------------------------------------------------- |
| 1   | R1   | `apps/service/src/auth/command/google-login.handler.ts`  | PASS | execute() = 13 lines                                |
| 2   | R2   | `apps/service/src/posts/command/create-post.handler.ts`  | PASS | try 블록 모두 await 1개                             |
| 3   | R3   | `apps/service/src/auth/command/google-login.handler.ts`  | PASS | @Transactional 안 read 없음 (read는 execute에 있음) |
| 4   | R4   | (전체)                                                   | PASS | execute()에 23505 직접 등장 없음                    |
| ... | ...  | ...                                                      | ...  | ...                                                 |

**총 검사: N개 | PASS: X개 | FAIL: Y개 | 경고(soft): Z개**
```

## Exceptions

다음은 **위반이 아닙니다**:

1. **`execute()`가 50줄 이하인 단순 핸들러** — `LoginHandler`, `LogoutHandler`, `DeletePostHandler`처럼 본문이 짧으면 private 분리 강제 불필요. R1은 길이 임계 초과만 경고.
2. **단일 write 핸들러의 `@Transactional()` 미사용** — write가 1개라 트랜잭션이 불필요한 핸들러는 R3 검사 대상에서 제외 (메서드에 데코레이터가 없으면 검사 안 함).
3. **`try` 블록 안 `await`가 1개인 경우** — `await this.userWriteRepository.create(...)`처럼 단일 write를 감싼 정상 패턴. R2는 ≥2개만 경고.
4. **`finally` 블록의 cleanup `await`** — 본 프로젝트의 핸들러에는 일반적으로 없지만, `try { write }` + `finally { cleanup }` 구조에서 `finally`의 `await`는 R2 카운트에 포함하지 않음 (정리 책임은 catch와 분리됨).
5. **back-office 앱 핸들러** — 본 스킬의 검사 범위(`apps/service/src/**/command/*.handler.ts`)에 포함되지 않음. back-office는 별도 리팩터링 스코프.
6. **R4의 정보성 경고** — `QueryFailedError`/`'23505'`가 `execute()` 본문에 등장해도 동작상 문제는 아님. 가독성/책임 분리를 위한 권장사항.

## Related Skills

| Skill                   | Purpose                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `verify-implementation` | 본 스킬을 포함한 모든 verify 스킬을 순차 실행하는 통합 검증                            |
| `manage-skills`         | 본 스킬의 등록/업데이트 (변경된 핸들러가 있을 때 Related Files/탐지 명령 동기화 권장) |
