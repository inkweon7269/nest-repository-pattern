# CodeRabbit 리뷰 자동 응답 자동화

> PR에 도착한 CodeRabbit 코드 리뷰 코멘트를 Claude Code가 분석하고, 코드 수정 또는 사유 설명 답글을 자동으로 작성한다.

---

## 1. 배경

### 1.1 문제

PR을 생성하면 CodeRabbit이 자동으로 코드 리뷰 코멘트를 작성한다. 각 코멘트를 하나씩 확인하고, 코드를 수정하거나 반박 사유를 작성하는 과정은 반복적이고 시간이 많이 소요된다.

### 1.2 목표

- CodeRabbit 코멘트 수집 → 타당성 분석 → 코드 수정/답글 작성을 한 번의 명령으로 자동화
- 프로젝트 아키텍처 규칙(CLAUDE.md)을 기준으로 코멘트의 타당성을 판단
- 코드 수정 시 빌드/테스트 검증을 포함하여 안전한 반영을 보장

### 1.3 제약사항

- Claude Code MAX 요금제를 사용하므로 GitHub Actions + API Key 방식(별도 과금)은 제외
- 로컬에서 `/respond-coderabbit`로 수동 실행하는 방식으로 진행

---

## 2. 전체 흐름

```text
PR 생성
  ↓
CodeRabbit이 인라인 리뷰 코멘트 작성
  ↓
사용자가 로컬에서 /respond-coderabbit 실행
  ↓
┌─────────────────────────────────────────────┐
│  Step 1. PR 정보 확인                        │
│  Step 2. CodeRabbit 코멘트 수집              │
│  Step 3. 이미 처리된 코멘트 제외              │
│  Step 4. 코드베이스 분석 및 분류              │
│  Step 5. 분류 결과 표시 + 사용자 확인         │
│  Step 6. 코드 수정 (ACCEPT/PARTIAL)          │
│  Step 7. 빌드/테스트 검증                    │
│  Step 8. 커밋/푸시                           │
│  Step 9. 각 코멘트에 답글 작성               │
└─────────────────────────────────────────────┘
  ↓
코드 수정이 있었다면 → CodeRabbit 재리뷰 대기 → /respond-coderabbit 재실행
코드 수정이 없었다면 → PR 작성자에게 최종 확인 태그
```

---

## 3. 워크플로우 상세

### Step 1: PR 정보 확인

인수로 PR 번호가 제공되면 해당 PR을 사용한다. 제공되지 않으면 현재 브랜치에서 자동 감지한다.

```bash
# PR 번호가 인수로 제공되지 않은 경우
gh pr view --json number,author,title,url,headRefName

# owner/repo 정보
gh repo view --json nameWithOwner --jq '.nameWithOwner'
```

**종료 조건:** 현재 브랜치에 연결된 PR이 없으면 워크플로우를 종료한다.

### Step 2: CodeRabbit 코멘트 수집

CodeRabbit 봇의 인라인 리뷰 코멘트(파일별 코드 코멘트)를 수집한다.

```bash
gh api --paginate "repos/{owner}/{repo}/pulls/{pr_number}/comments" \
  --jq '[.[] | select(.user.login == "coderabbitai[bot]" or .user.login == "coderabbit[bot]")
             | select(.in_reply_to_id == null)
             | {id, path, line, original_line, side, body, created_at, html_url}]'
```

**필터링 조건:**
- `user.login` — CodeRabbit 봇이 작성한 코멘트만 (`coderabbitai[bot]` 또는 `coderabbit[bot]`)
- `in_reply_to_id == null` — 최상위 코멘트만 (답글 제외)

**종료 조건:** 코멘트가 0개이면 워크플로우를 종료한다.

### Step 3: 이미 처리된 코멘트 제외

자동 응답에는 `<!-- claude-code-response -->` HTML 마커를 포함하므로, 이 마커가 존재하는 답글이 달린 코멘트는 건너뛴다.

```bash
gh api --paginate "repos/{owner}/{repo}/pulls/{pr_number}/comments" \
  --jq '[.[] | select(.in_reply_to_id != null) | {id, user: .user.login, body, in_reply_to_id}]'
```

**처리 로직:**
1. Step 2에서 수집한 CodeRabbit 코멘트 ID 목록을 확보
2. 전체 리뷰 코멘트 중 `in_reply_to_id`가 해당 ID와 일치하는 답글을 검색
3. 답글 `body`에 `<!-- claude-code-response -->` 마커가 포함 → **이미 처리됨**
4. PR 작성자가 수동으로 답글한 코멘트 → **이미 처리됨**

**종료 조건:** 모든 코멘트가 이미 처리되었으면 Step 10으로 이동한다.

### Step 4: 코드베이스 분석 및 분류

처리되지 않은 각 코멘트에 대해:

1. 코멘트 본문에서 제안 내용, 코드 블록(`suggestion` 포함), 수정 이유를 추출
2. `path` 필드의 파일을 읽고, `line` 필드 주변 컨텍스트를 확인
3. CLAUDE.md의 아키텍처 규칙과 기존 패턴을 참조하여 타당성을 판단

**분류 기준:**

| 분류 | 조건 | 액션 |
|------|------|------|
| ACCEPT | 제안이 타당하고 프로젝트 규칙과 일치 | 코드 수정 |
| PARTIAL | 제안의 일부만 타당 | 타당한 부분만 수정, 나머지는 설명 |
| REJECT | 현재 코드가 의도적 설계이거나 프로젝트 규칙에 부합 | 설명 답글 |
| SKIP | 코멘트가 질문, 참고 사항, 또는 칭찬 | 간단한 답변 |

**분류 시 참조하는 프로젝트 규칙:**
- CQRS 설계 원칙 (Command는 void/ID 반환, Query는 DTO 변환)
- Repository Pattern DI 구조 (ISP 적용)
- DTO 구조 규약 (class-validator, static of(), Swagger 데코레이터)
- Testing 구조 (Classical School)

### Step 5: 분류 결과 표시 및 사용자 확인

분석 결과를 테이블로 표시한다:

```text
## CodeRabbit 코멘트 분석 결과

PR: #42 — feat: 인증 모듈 구현
처리 대상: 5개 코멘트 (전체 8개 중 3개 이미 처리됨)

| # | 파일                          | 라인 | 분류    | 요약                              |
|---|-------------------------------|------|---------|-----------------------------------|
| 1 | src/auth/auth.controller.ts   | 42   | ACCEPT  | JWT 가드 데코레이터 순서 수정       |
| 2 | src/auth/command/login.handler.ts | 15 | REJECT  | CQRS 원칙에 따라 현재 구조 유지    |
| 3 | src/auth/dto/login.request.dto.ts | 8  | PARTIAL | @IsEmail 추가, @MaxLength는 불필요 |
| 4 | src/auth/auth.module.ts       | 22   | SKIP    | 설명 질문에 대한 답변              |
| 5 | src/auth/user.repository.ts   | 31   | ACCEPT  | 불필요한 타입 단언 제거            |

코드 수정 예정: 3건 (ACCEPT 2 + PARTIAL 1)
설명 응답 예정: 2건 (REJECT 1 + SKIP 1)
```

사용자에게 진행 여부를 확인한다:
- **전체 진행** — 모든 분류대로 수정 및 응답
- **개별 확인** — 각 코멘트를 하나씩 검토 후 진행
- **취소** — 변경 없이 종료

### Step 6: 코드 수정

ACCEPT 또는 PARTIAL로 분류된 코멘트에 대해 코드 수정을 적용한다.

**규칙:**
- CLAUDE.md의 아키텍처 규칙을 준수하여 수정
- 기존 코드 패턴과 일관성 유지
- 수정 내용을 기록 (Step 9 답글 작성에 사용)

### Step 7: 빌드/테스트 검증

```bash
pnpm build:local
pnpm test
```

auth 관련 파일이 변경된 경우:

```bash
pnpm test:e2e
```

**실패 시:** 코드를 되돌리지 않고, 실패 내용을 사용자에게 보고한 뒤 워크플로우를 중단한다. 코멘트 답글은 작성하지 않는다 (검증되지 않은 코드에 대해 "수정했습니다"라고 답글하는 것을 방지).

### Step 8: 커밋/푸시

코드 수정이 있는 경우에만 실행한다. 모든 코멘트가 REJECT/SKIP이면 이 단계를 건너뛴다.

```bash
git add {변경된 파일 목록}

git commit -m "refactor: CodeRabbit 리뷰 코멘트 반영

- {변경 요약 1}
- {변경 요약 2}

Co-Authored-By: Claude Code <noreply@anthropic.com>"

git push
```

### Step 9: 코멘트 답글 작성

각 처리된 코멘트에 답글을 작성한다. 모든 답글의 첫 줄에 `<!-- claude-code-response -->` 마커를 포함한다.

**ACCEPT (코드 수정됨):**

```bash
gh api "repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies" \
  --method POST \
  -f body="<!-- claude-code-response -->
감사합니다! 제안을 반영했습니다.

**수정 내용:** {구체적인 변경 설명}
**커밋:** {commit_sha}"
```

**PARTIAL (일부 수정):**

```bash
gh api "repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies" \
  --method POST \
  -f body="<!-- claude-code-response -->
제안의 일부를 반영했습니다.

**반영:** {수정한 부분}
**미반영 사유:** {프로젝트 규칙 또는 설계 의도 기반 설명}
**커밋:** {commit_sha}"
```

**REJECT (수정 불필요):**

```bash
gh api "repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies" \
  --method POST \
  -f body="<!-- claude-code-response -->
검토 감사합니다. 현재 코드를 유지합니다.

**사유:** {프로젝트 규칙 또는 설계 의도에 기반한 설명}"
```

**SKIP (질문/참고):**

```bash
gh api "repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies" \
  --method POST \
  -f body="<!-- claude-code-response -->
{질문에 대한 답변 또는 참고 사항에 대한 확인}"
```

### Step 10: 반복 안내 또는 완료 알림

**코드 수정이 있었고 푸시가 완료된 경우:**

CodeRabbit이 새 커밋에 대해 재리뷰할 수 있으므로, 재리뷰 완료 후 `/respond-coderabbit`을 다시 실행하도록 안내한다.

**미처리 코멘트가 0개인 경우 (모든 코멘트 처리 완료):**

PR 작성자에게 최종 확인을 태그한다.

```bash
# PR 작성자 확인
gh pr view {pr_number} --json author --jq '.author.login'

# 완료 코멘트 작성
gh api "repos/{owner}/{repo}/issues/{pr_number}/comments" \
  --method POST \
  -f body="<!-- claude-code-response:complete -->
@{author} 모든 CodeRabbit 리뷰 코멘트 처리가 완료되었습니다. 변경 사항을 확인해 주세요.

**처리 요약:**
- 코드 수정: X건
- 설명 응답: Y건
- 관련 커밋: {commit_sha}"
```

---

## 4. 상태 추적 설계

별도 파일이나 DB 없이 GitHub API 데이터만으로 처리 여부를 판별하는 stateless 방식을 사용한다.

```text
각 CodeRabbit 코멘트 C에 대해:
  replies = in_reply_to_id == C.id인 모든 코멘트
  if replies 중 body에 "<!-- claude-code-response -->" 포함:
    → 이미 처리됨 (이 스킬이 응답)
  else if replies 중 PR 작성자가 작성한 답글 존재:
    → 이미 처리됨 (사용자가 수동 응답)
  else:
    → 미처리 → 분석 대상
```

**장점:**
- 재실행해도 중복 답글이 달리지 않음 (멱등성)
- 별도 상태 파일 관리 불필요
- GitHub PR 페이지에서 마커가 보이지 않음 (HTML 주석)

---

## 5. 사용법

### 기본 실행

```bash
# 현재 브랜치의 PR에 대해 실행
/respond-coderabbit

# 특정 PR 번호 지정
/respond-coderabbit 42
```

### 반복 실행 시나리오

```text
1차 실행: 8개 코멘트 중 5개 ACCEPT, 2개 REJECT, 1개 SKIP
  → 5개 파일 수정 → 커밋/푸시 → 8개 코멘트 전부 답글 작성

  (CodeRabbit이 새 커밋에 대해 3개 추가 코멘트 작성)

2차 실행: 3개 신규 코멘트 중 1개 ACCEPT, 2개 REJECT
  → 1개 파일 수정 → 커밋/푸시 → 3개 코멘트 답글 작성

  (CodeRabbit 재리뷰: 추가 코멘트 없음)

3차 실행: 미처리 코멘트 0개
  → PR 작성자에게 최종 확인 태그
```

---

## 6. 처리 대상 및 예외

### 처리 대상

- CodeRabbit이 PR의 특정 파일/라인에 남긴 **인라인 리뷰 코멘트** (pull request review comments)

### 처리 대상이 아닌 것

| 항목 | 설명 |
|------|------|
| PR 요약 코멘트 | CodeRabbit이 PR 전체에 대해 작성하는 요약/워크스루 (issue comment) |
| 이미 답글이 달린 코멘트 | 사용자가 수동 답글했거나 이 스킬이 이미 처리한 코멘트 |
| Dependabot PR | CodeRabbit 코멘트가 없는 의존성 업데이트 PR |
| 머지된 PR | 이미 머지된 PR에서는 코드 수정/푸시가 불가능 |

---

## 7. 구현 파일

| # | 파일 | 작업 |
|---|------|------|
| 1 | `.claude/skills/respond-coderabbit/SKILL.md` | 신규 — 스킬 정의 |
| 2 | `CLAUDE.md` Skills 테이블 | 수정 — 항목 추가 |

설정 변경 없음. `.claude/settings.local.json`에 이미 `gh api:*`, `gh pr:*`, `git:*` 허용.

---

## 8. 향후 확장 가능성

| 방안 | 설명 | 비용 |
|------|------|------|
| GitHub Actions 연동 | `pull_request_review_comment` 이벤트로 자동 트리거 | ANTHROPIC_API_KEY 별도 과금 |
| 분류 규칙 커스터마이징 | 프로젝트별 ACCEPT/REJECT 기준을 설정 파일로 분리 | 없음 |
| 다른 리뷰 봇 지원 | CodeRabbit 외 리뷰 봇(Codacy, SonarQube 등) 대응 | 없음 |
