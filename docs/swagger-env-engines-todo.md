# Swagger 403 제거 + env·engines 보완 체크리스트

> 배경, 변경 근거, 범위 외 결정은 [swagger-env-engines-prd.md](./swagger-env-engines-prd.md)를 참고한다.

## 진행 현황 (요약)

| Phase | 상태 | 비고 |
|---|---|---|
| 1. Swagger 403 제거 | ✅ 완료 | posts.controller.ts PATCH/DELETE |
| 2. .env.example 보완 | ✅ 완료 | PORT, THROTTLE_SKIP |
| 3. engines 추가 | ✅ 완료 | node >=22, pnpm >=9 |
| 4. 최종 검증 | ✅ 완료 | api-compat 확인 + format → lint:check → build:all → test → test:e2e |

## Phase 1: Swagger 403 제거 (`posts.controller.ts`)

- [x] PATCH `:id`의 `@ApiForbiddenResponse` 제거
- [x] DELETE `:id`의 `@ApiForbiddenResponse` 제거
- [x] PATCH·DELETE `@ApiNotFoundResponse` description에 "본인의 게시글이 아닌 경우 포함" 보강
- [x] `ApiForbiddenResponse` import 제거 (미사용)

## Phase 2: `.env.example` 보완

- [x] `PORT=3000` 추가 (`ADMIN_PORT` 옆, service 앱 포트 주석)
- [x] `THROTTLE_SKIP=false` 추가 (테스트 전용 — true면 rate limiting 비활성화 주석)

## Phase 3: `package.json` engines 추가

- [x] `"engines": { "node": ">=22", "pnpm": ">=9" }` 추가

## Phase 4: 최종 검증

- [x] 하위 호환성 영향 없음 확인 (라우트·DTO·응답 스키마 무변경 — Swagger 데코레이터와 메타데이터만 변경)
- [x] `pnpm format`
- [x] `pnpm lint:check`
- [x] `pnpm build:all`
- [x] `pnpm test`
- [x] `pnpm test:e2e` (Docker 필요)
- [x] 변경 파일이 `posts.controller.ts`·`.env.example`·`package.json`·docs 2개뿐인지 확인
