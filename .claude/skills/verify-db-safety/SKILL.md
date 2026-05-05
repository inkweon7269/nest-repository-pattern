---
name: verify-db-safety
description: TypeORM 마이그레이션의 destructive query, rollback 가능성, NOT NULL 컬럼 추가 시 default 누락 등 DB 안전성 위험을 검증합니다. 마이그레이션/엔티티 추가·수정 후 사용.
---

# DB 마이그레이션 안전성 검증

## Purpose

TypeORM 마이그레이션 파일에서 데이터 손실, 다운타임, 롤백 불가 위험을 사전에 잡습니다.

1. **D1: 빈 `down()` 메서드** — 롤백 불가능한 마이그레이션 차단
2. **D2: destructive SQL 미보전** — `DROP TABLE` / `DROP COLUMN` / `DROP INDEX`이 down에서 복구되는지 확인
3. **D3: NOT NULL 컬럼 추가 시 DEFAULT 또는 backfill 누락** — 기존 데이터가 있는 테이블에서 즉시 실패
4. **D4: `DELETE FROM` / `TRUNCATE` (조건 없음)** — 마이그레이션 안에 데이터 일괄 삭제. 의도된 경우라도 명시적 검토 필요
5. **D5: `synchronize: true` 설정 등장** — 모든 환경에서 `false`여야 함 (CLAUDE.md 정책)
6. **D6: 엔티티 양방향 관계의 `Relation<T>` + `import type` 누락** — SWC 빌드 TS1272 회귀 위험

## When to Run

- 새 마이그레이션을 생성하거나 수정한 후 (`pnpm migration:generate:*`, `pnpm migration:create`)
- 엔티티 추가·수정 후 (마이그레이션이 자동 생성될 가능성)
- `synchronize` 설정을 다룬 후
- PR 전 회귀 점검

## Related Files

| File                                              | Purpose                                        |
| ------------------------------------------------- | ---------------------------------------------- |
| `libs/shared/src/migrations/*.ts`                 | TypeORM 마이그레이션 파일 (검사 대상)          |
| `libs/shared/src/entities/*.ts`                   | 엔티티 정의 (D6 대상)                          |
| `libs/shared/src/database/typeorm.config.ts`      | DataSource 설정 (D5 검사 대상)                 |
| `libs/shared/src/data-source.ts`                  | 마이그레이션 CLI용 DataSource (D5 검사 대상)   |

## Workflow

### Step 1: 대상 파일 수집

```bash
find libs/shared/src/migrations -name "*.ts" -not -name "*.spec.ts" | sort
find libs/shared/src/entities -name "*.entity.ts" | sort
```

---

### Step 2: D1 — 빈 `down()` 메서드 검출

**도구:** Bash, Read

```bash
for f in libs/shared/src/migrations/*.ts; do
  awk '
    /public[[:space:]]+async[[:space:]]+down\(/ { in_method = 1; depth = 0; start = NR; body = "" }
    in_method {
      n = split($0, chars, "")
      for (i = 1; i <= n; i++) {
        c = chars[i]
        if (c == "{") depth++
        else if (c == "}") {
          depth--
          if (depth == 0 && start != NR) {
            if (body !~ /[A-Za-z]/) printf "%s:%d down() body is empty/whitespace-only\n", FILENAME, start
            in_method = 0
            break
          }
        }
      }
      if (in_method && NR > start) {
        line = $0
        sub(/^[[:space:]]*/, "", line)
        if (line !~ /^\/\// && line != "" && line !~ /^\}/) body = body line
      }
    }
  ' "$f"
done
```

**PASS 기준:**
- 모든 마이그레이션의 `down()` 본문에 실제 쿼리/명령이 존재

**FAIL 기준:**
- `down()` 본문이 비어 있거나 주석만 있음 — 롤백 불가

**수정 권장:**
`up()` 명령의 역순으로 `DROP CONSTRAINT` → `DROP INDEX` → `DROP COLUMN` → `DROP TABLE` 등을 작성. 데이터 손실이 불가피한 경우(예: 컬럼 데이터 삭제)는 주석으로 명시.

---

### Step 3: D2 — destructive SQL이 down()에서 복구되는지 확인

**도구:** Bash, Read

```bash
for f in libs/shared/src/migrations/*.ts; do
  echo "=== $f ==="
  awk '
    /public[[:space:]]+async[[:space:]]+up\(/    { phase = "up";   depth = 0; in_phase = 1; next }
    /public[[:space:]]+async[[:space:]]+down\(/  { phase = "down"; depth = 0; in_phase = 1; next }
    in_phase {
      n = split($0, chars, "")
      for (i = 1; i <= n; i++) {
        c = chars[i]
        if (c == "{") depth++
        else if (c == "}") {
          depth--
          if (depth == 0) { in_phase = 0; break }
        }
      }
      if (in_phase) {
        if ($0 ~ /DROP[[:space:]]+TABLE/  || \
            $0 ~ /DROP[[:space:]]+COLUMN/ || \
            $0 ~ /DROP[[:space:]]+INDEX/  || \
            $0 ~ /DROP[[:space:]]+CONSTRAINT/) {
          printf "  %s:%d [%s] %s\n", FILENAME, NR, phase, $0
        }
      }
    }
  ' "$f"
done
```

**PASS 기준:**
- `up()`에 `DROP TABLE/COLUMN/INDEX/CONSTRAINT`가 있으면, `down()`에 그것을 다시 만드는 `CREATE TABLE/COLUMN/INDEX/CONSTRAINT` 또는 `ALTER TABLE ... ADD`가 존재

**FAIL 기준:**
- `up()`에서 drop만 있고 `down()`에 대응되는 create가 없음 — 롤백 시 스키마 손실

**수정 권장:**
컬럼/인덱스/제약을 drop할 때는 `down()`에 동일 정의를 다시 만든다. 데이터까지 잃을 수 있다는 점을 주석으로 명시.

---

### Step 4: D3 — NOT NULL 컬럼 추가 시 DEFAULT/backfill 누락

**도구:** Bash, Read

```bash
for f in libs/shared/src/migrations/*.ts; do
  awk '
    /public[[:space:]]+async[[:space:]]+up\(/ { in_up = 1; depth = 0; next }
    in_up {
      n = split($0, chars, "")
      for (i = 1; i <= n; i++) {
        c = chars[i]
        if (c == "{") depth++
        else if (c == "}") {
          depth--
          if (depth == 0) { in_up = 0; break }
        }
      }
      if (in_up && $0 ~ /ALTER[[:space:]]+TABLE/ && $0 ~ /ADD/ && $0 ~ /NOT[[:space:]]+NULL/ && $0 !~ /DEFAULT/) {
        printf "%s:%d ALTER TABLE ADD NOT NULL without DEFAULT: %s\n", FILENAME, NR, $0
      }
    }
  ' "$f"
done
```

**PASS 기준:**
- `ALTER TABLE … ADD … NOT NULL` 항상 `DEFAULT …`를 동반하거나, 새 빈 테이블의 `CREATE TABLE` 안에서만 사용 (검사 제외)

**FAIL 기준:**
- 기존 테이블에 NOT NULL 컬럼을 default 없이 추가 — 기존 행이 있으면 즉시 실패

**수정 권장:**
- 옵션 A: `DEFAULT` 절 추가
- 옵션 B: 3-step 마이그레이션 (① nullable로 추가 → ② 백필 `UPDATE` → ③ NOT NULL 제약 추가). 옵션 B가 안전하지만 마이그레이션 3개로 분할 필요.

---

### Step 5: D4 — `DELETE FROM` / `TRUNCATE` (조건 없음)

**도구:** Bash

```bash
for f in libs/shared/src/migrations/*.ts; do
  awk '
    {
      if ($0 ~ /TRUNCATE[[:space:]]+TABLE/) {
        printf "%s:%d TRUNCATE TABLE: %s\n", FILENAME, NR, $0
      }
      # DELETE FROM 다음 같은 라인 또는 그 다음에 WHERE가 없으면 위험
      if ($0 ~ /DELETE[[:space:]]+FROM/ && $0 !~ /WHERE/) {
        printf "%s:%d DELETE FROM without WHERE on same line: %s\n", FILENAME, NR, $0
      }
    }
  ' "$f"
done
```

**PASS 기준:**
- `TRUNCATE TABLE` / `DELETE FROM ... WHERE` 미존재, 또는 명시적 검토 후 의도된 경우

**경고 기준:**
- 위 패턴 발견 — 의도된 데이터 일괄 삭제인지 사용자 확인 필요. 백업/단계적 적용 검토 권장.

**비고:** WHERE 절이 다음 라인에 있을 수도 있어 false positive 가능. 발견 시 해당 라인을 직접 읽어 판정.

---

### Step 6: D5 — `synchronize: true` 검사

**도구:** Bash

```bash
grep -rn "synchronize:[[:space:]]*true" libs/ apps/ test/ 2>/dev/null | grep -v "node_modules" | grep -v ".spec.ts" || echo "(no occurrence — PASS)"
```

**PASS 기준:**
- `synchronize: true` 미존재 (CLAUDE.md 정책: 모든 환경에서 false)

**FAIL 기준:**
- 어디든 `synchronize: true` 등장 — 운영 사고 위험. `synchronize: false`로 즉시 변경 후 마이그레이션으로 처리.

---

### Step 7: D6 — 엔티티 양방향 관계의 `Relation<T>` + `import type` 검사

**도구:** Bash

```bash
for f in libs/shared/src/entities/*.entity.ts; do
  has_relation_import=$(grep -c "import type {.*Relation.*} from 'typeorm'" "$f")
  uses_relation=$(grep -c "Relation<" "$f")
  has_bidirectional=$(grep -cE "@(OneToMany|ManyToOne|OneToOne|ManyToMany)" "$f")
  if [ "$has_bidirectional" -gt 0 ] && [ "$uses_relation" -eq 0 ]; then
    echo "$f: bidirectional relation found but no Relation<T> wrapper"
  fi
  if [ "$uses_relation" -gt 0 ] && [ "$has_relation_import" -eq 0 ]; then
    echo "$f: Relation<T> used but not imported via 'import type'"
  fi
done
```

**PASS 기준:**
- 양방향 관계가 있는 모든 엔티티가 `Relation<T>` 래퍼를 사용
- `Relation`은 `import type { Relation } from 'typeorm'`로 들여옴

**FAIL 기준:**
- `@OneToMany`/`@ManyToOne` 등이 있는데 타입이 `User` 같은 raw 클래스만 사용 — SWC 빌드 시 TDZ로 실패 가능
- `Relation<T>`는 쓰는데 `import type` 없이 들여옴 — TS1272 (`isolatedModules` + `emitDecoratorMetadata`)

**수정 권장:**
```ts
import type { Relation } from 'typeorm';
import { User } from './user.entity';

@Entity('posts')
export class Post {
  @ManyToOne(() => User, (user) => user.posts, { onDelete: 'CASCADE' })
  user: Relation<User>;
}
```

---

## Output Format

```markdown
## verify-db-safety 검증 결과

| #   | 규칙 | 대상 파일                                             | 결과 | 상세                                              |
| --- | ---- | ----------------------------------------------------- | ---- | ------------------------------------------------- |
| 1   | D1   | `libs/shared/src/migrations/...InitialSchema.ts`      | PASS | down() 본문에 DROP 명령 다수 존재                 |
| 2   | D2   | `libs/shared/src/migrations/...OauthAccount.ts`       | PASS | up DROP 0건 (CREATE만), down에서 모두 DROP 복구   |
| 3   | D3   | (전체)                                                | PASS | NOT NULL ADD without DEFAULT 0건                  |
| 4   | D4   | (전체)                                                | PASS | TRUNCATE / DELETE FROM 0건                        |
| 5   | D5   | (전체)                                                | PASS | synchronize: true 0건                             |
| 6   | D6   | `libs/shared/src/entities/post.entity.ts`             | PASS | Relation<T> + import type 적용                    |

**총 검사: N개 | PASS: X개 | FAIL: Y개 | 경고: Z개**
```

## Exceptions

다음은 **위반이 아닙니다**:

1. **첫 번째 마이그레이션의 `down()`에 DROP TABLE 다수** — InitialSchema 같은 최초 마이그레이션은 모든 테이블을 만들고 down에서 모두 drop하는 게 정상.
2. **신규 빈 테이블의 `CREATE TABLE ... NOT NULL DEFAULT`** — 데이터가 없으므로 기존 데이터 호환 문제 없음. D3 검사는 `ALTER TABLE ADD`만 대상.
3. **테스트 시드 데이터 정리용 `TRUNCATE`** — `test/setup/integration-helper.ts`의 `truncateAllTables()` 같은 테스트 헬퍼는 마이그레이션이 아니므로 D4 검사 범위 외.
4. **마이그레이션 명령에 `DELETE FROM ... WHERE 1=1`처럼 WHERE가 형식적으로만 있는 경우** — D4의 정규식이 WHERE 유무만 보므로 의도 검토 필요.
5. **단방향 `@ManyToOne` 관계만 있는 엔티티** — `Relation<T>`는 양방향(순환 참조) 시 필수. 단방향이면 선택. D6은 `@OneToMany`/`@ManyToOne` 양쪽이 모두 있는 케이스 위주.

## Related Skills

| Skill                   | Purpose                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `verify-implementation` | 본 스킬을 포함한 모든 verify 스킬 순차 실행                 |
| `manage-skills`         | 본 스킬 등록/업데이트                                       |
