# 테스트 it 문장 한국어 통일 PRD

루트 CLAUDE.md의 전체 spec 일관 규칙 — "`describe`는 영문 클래스명, `it` 문장은 한국어로 행위와 결과를 진술한다" — 을 위반하는 영어 `it` 문장을 전부 한국어로 통일한다. **테스트 로직·assertion은 일절 변경하지 않는 문자열 전용 작업**이다.

## 1. 배경 및 측정

1차 점검(2026-06)에서는 back-office 통합 테스트만 영어로 보고됐으나, 정밀 측정 결과 service 쪽에도 영어 문장이 광범위하게 남아 있다.

> 측정 방법: `it(...)` 라인 중 **한글이 전혀 없는** 라인을 영어로 집계. ("한글로 시작" 기준은 `it('HttpException은 …')`처럼 식별자로 시작하는 한국어 문장을 오탐하므로 부적합 — 1차 점검의 back-office 단위 spec 위반 보고는 이 오탐이었고, 실제로는 모두 한국어였다.)

| 파일 | 영어 it | 비고 |
| --- | --- | --- |
| `test/back-office/admin.integration-spec.ts` | 27 / 27 | 파일 전체가 영어 |
| `test/service/posts.integration-spec.ts` | 53 | 한국어와 혼재 |
| `test/service/auth.integration-spec.ts` | 28 | 한국어와 혼재 |
| `test/service/google-oauth.integration-spec.ts` | ~~1~~ 0 | 측정 오탐 — assertion의 `split('.')`이 `it(` 패턴에 걸림. 실제 영어 it 없음 |
| `libs/shared/src/common/dto/response/paginated.response.dto.spec.ts` | 7 | |
| `apps/service/src/posts/dto/response/post.response.dto.spec.ts` | 4 | |
| `apps/service/src/posts/dto/response/create-post.response.dto.spec.ts` | 2 | |
| `apps/service/src/auth/dto/response/auth-tokens.response.dto.spec.ts` | 2 | |
| `apps/service/src/auth/dto/response/register.response.dto.spec.ts` | 2 | |
| **합계** | **125건 / 8개 파일** | |

## 2. 변경 원칙

- `it('should return 401 for GET /posts without token')` → `it('토큰 없이 GET /posts 호출 시 401을 반환한다')` 형식 — **행위(조건) + 결과**를 한국어로 진술하고, HTTP 메서드·라우트·상태 코드·식별자는 원문 그대로 유지한다.
- 같은 파일의 기존 한국어 문장 스타일(예: `posts.integration-spec.ts`의 한국어 케이스)을 어휘·어순 기준으로 삼는다.
- `describe` 블록은 변경하지 않는다 (영문 클래스/엔드포인트명 유지가 규칙).
- **테스트 본문(setup·실행·assertion)은 한 글자도 변경하지 않는다.** diff가 `it('…')` 문자열 라인에만 존재해야 한다.

## 3. 수용 기준 (Acceptance Criteria)

- [x] 한글 미포함 `it` 문장이 9개 파일 모두에서 0건이 된다 (측정 스크립트 재실행으로 확인).
- [x] diff가 `it(...)` 설명 문자열 라인(및 prettier 줄바꿈)에만 존재한다 — 테스트 로직 무변경.
- [x] 테스트 수가 변하지 않는다: 단위 185개, 통합 service 160 + back-office 34.
- [x] `pnpm format` → `pnpm lint:check` → `pnpm build:all` → `pnpm test` → `pnpm test:e2e` 전부 통과한다.

## 4. 범위 외 (Out of scope)

- 테스트 내용·구조 개선 — 1차 점검에서 지적된 DTO spec의 중복 `instanceof` 단언 제거 등은 별도 결정 사항. 이번 작업에서 문장 번역과 섞으면 diff 리뷰가 어려워진다.
- `describe` 문구 변경 — 규칙상 영문 유지.
- 주석·변수명 등 코드 본문의 영어 — 규칙 대상 아님.
