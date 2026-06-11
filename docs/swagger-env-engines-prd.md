# Swagger 죽은 403 제거 + 환경 문서·engines 보완 PRD

프로젝트 전수 점검(2026-06)에서 확인된 빠른 정리 항목 3건을 한 PR로 묶는다. 모두 런타임 동작 변경이 없는 문서·메타데이터 정합성 작업이다.

## 1. 변경 항목

### 1.1 PostsController의 실현 불가능한 403 Swagger 문서 제거

- **현상**: `apps/service/src/posts/posts.controller.ts`의 PATCH(`:118`)·DELETE(`:142`)에 `@ApiForbiddenResponse('본인의 게시글만 수정/삭제 가능')`가 선언되어 있지만, 코드베이스 전체에 `ForbiddenException`을 던지는 곳이 없다. 소유권 불일치는 핸들러에서 `NotFoundException`(404)으로 처리된다 (affected=0 분기).
- **참고**: 404 처리 자체는 의도된 설계다 — 타인 리소스의 존재 여부를 숨기는 IDOR 내성 패턴이며, TagsController는 이미 403 문서 없이 동일하게 동작한다 (이쪽이 기준).
- **변경**: `@ApiForbiddenResponse` 2개를 제거하고, `@ApiNotFoundResponse` description을 "게시글을 찾을 수 없음 (본인의 게시글이 아닌 경우 포함)"으로 보강한다. 미사용이 되는 import도 정리한다.
- **API 동작 변경 없음** — Swagger 문서만 실제 동작과 일치시킨다.

### 1.2 `.env.example` 누락 변수 보완

- **현상**: 코드에서 사용 중인데 템플릿에 없는 변수 2개.
  - `PORT` — `apps/service/src/main.ts:56` `process.env.PORT ?? 3000` (`ADMIN_PORT`는 이미 템플릿에 있음)
  - `THROTTLE_SKIP` — 양쪽 `app.module.ts`의 `skipIf: () => process.env.THROTTLE_SKIP === 'true'`
- **변경**: 두 변수를 기본값·용도 주석과 함께 추가한다. `PORT=3000`은 `ADMIN_PORT=3001` 옆에, `THROTTLE_SKIP=false`는 테스트 전용임을 주석으로 명시한다.

### 1.3 `package.json` engines 필드 추가

- **현상**: CI는 Node 22·pnpm 9로 고정되어 있지만 로컬 도구 버전을 선언하는 `engines`가 없어, 버전이 다른 환경에서 조용히 설치·실행될 수 있다.
- **변경**: `"engines": { "node": ">=22", "pnpm": ">=9" }` 추가. CI(Node 22)와 현재 로컬(Node 24)을 모두 포함하는 하한 선언이다.
- **동작 특성**: pnpm은 기본 설정에서 engines 불일치 시 경고만 출력한다 (`engine-strict=true`일 때만 차단). 강제 차단 도입은 범위 외 — 선언만으로도 의도가 문서화되고 CI/도구가 참조할 수 있다.

## 2. 수용 기준 (Acceptance Criteria)

- [x] `posts.controller.ts`에서 `@ApiForbiddenResponse` 2건이 제거되고 import에 잔존하지 않는다.
- [x] PATCH·DELETE의 `@ApiNotFoundResponse` description이 소유권 불일치 케이스를 포함하도록 보강된다.
- [x] `.env.example`에 `PORT`, `THROTTLE_SKIP`이 용도 주석과 함께 추가된다.
- [x] `package.json`에 `engines` 필드가 추가된다.
- [x] `verify-api-compat` 관점에서 하위 호환성 영향 없음을 확인한다 (라우트·DTO·응답 스키마 무변경).
- [x] `pnpm format` → `pnpm lint:check` → `pnpm build:all` → `pnpm test` → `pnpm test:e2e` 전부 통과한다.

## 3. 범위 외 (Out of scope)

- `.npmrc`의 `engine-strict=true` 도입 (버전 불일치 강제 차단) — 팀 합의 필요.
- 소유권 불일치를 403으로 바꾸는 동작 변경 — 404 유지가 의도된 설계.
- back-office 컨트롤러 Swagger 점검 — 1차 점검에서 동일 문제 미발견.
- 나머지 점검 항목(tsconfig strict, eslint any 범위, HttpExceptionFilter 로깅 등) — 별도 작업.
