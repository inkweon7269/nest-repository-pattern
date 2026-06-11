# 테스트 it 문장 한국어 통일 체크리스트

> 측정 방법(오탐 교정 포함), 변경 원칙, 범위 외 결정은 [spec-it-korean-prd.md](./spec-it-korean-prd.md)를 참고한다.

## 진행 현황 (요약)

| Phase | 상태 | 비고 |
|---|---|---|
| 1. back-office 통합 spec | ✅ 완료 | admin.integration-spec.ts 27건 |
| 2. service 통합 spec | ✅ 완료 | posts 53 + auth 28 = 81건 (google-oauth는 측정 오탐으로 0건) |
| 3. DTO 단위 spec | ✅ 완료 | 5개 파일 17건 |
| 4. 최종 검증 | ✅ 완료 | 잔존 0건 측정 + format → lint:check → build:all → test → test:e2e |

## Phase 1: `test/back-office/admin.integration-spec.ts` (27건)

- [x] 27건 전부 한국어(행위+결과)로 교체, 라우트·상태 코드 원문 유지
- [x] `pnpm test:e2e:back-office` 34개 통과 (테스트 수 불변)

## Phase 2: service 통합 spec (82건)

- [x] `test/service/posts.integration-spec.ts` 53건 교체 (기존 한국어 케이스 스타일 준수)
- [x] `test/service/auth.integration-spec.ts` 28건 교체
- [x] `test/service/google-oauth.integration-spec.ts` — 측정 오탐 확인(영어 it 없음), 변경 없음 (PRD §1 참고)
- [x] `pnpm test:e2e:service` 160개 통과 (테스트 수 불변)

## Phase 3: DTO 단위 spec (17건)

- [x] `libs/shared/src/common/dto/response/paginated.response.dto.spec.ts` 7건
- [x] `apps/service/src/posts/dto/response/post.response.dto.spec.ts` 4건
- [x] `apps/service/src/posts/dto/response/create-post.response.dto.spec.ts` 2건
- [x] `apps/service/src/auth/dto/response/auth-tokens.response.dto.spec.ts` 2건
- [x] `apps/service/src/auth/dto/response/register.response.dto.spec.ts` 2건
- [x] `pnpm test` 185개 통과 (테스트 수 불변)

## Phase 4: 최종 검증

- [x] 측정 스크립트 재실행 — 한글 미포함 it 문장 전체 0건
- [x] `git diff` 검토 — it 문자열 라인 외 변경 없음
- [x] `pnpm format`
- [x] `pnpm lint:check`
- [x] `pnpm build:all`
- [x] `pnpm test` (185개)
- [x] `pnpm test:e2e` (160 + 34, Docker 필요)
