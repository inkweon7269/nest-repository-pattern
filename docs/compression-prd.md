# Compression PRD

HTTP 응답 본문을 gzip 압축하여 네트워크 전송량을 줄이는 기능. 보안 미들웨어(`applySecurityMiddleware`)와 동일한 공유 헬퍼 패턴을 따른다.

## 1. 목표

- service / back-office 양쪽 앱의 HTTP 응답을 gzip으로 압축하여 페이로드 전송량과 응답 지연을 감소시킨다.
- 압축 로직을 `libs/shared`의 단일 부트스트랩 헬퍼로 캡슐화하여 두 앱 + 통합 테스트 헬퍼가 동일한 설정을 공유하도록 한다 (helmet/CORS와 동일한 단일 진실 원천 원칙).
- 작은 응답·이미 압축된 콘텐츠·opt-out 요청은 압축하지 않아 불필요한 CPU 오버헤드를 피한다.

## 2. 사용자 시나리오

1. 클라이언트가 `Accept-Encoding: gzip`을 보내고 1KB를 초과하는 JSON 응답(예: `GET /v1/posts` 목록)을 요청하면, 서버는 `Content-Encoding: gzip` 헤더와 함께 압축된 본문을 반환한다.
2. 응답 본문이 threshold(1KB) 미만이면 압축 오버헤드를 피하기 위해 압축하지 않는다.
3. 특정 라우트가 응답에 `x-no-compression` 헤더를 설정하면 해당 응답은 압축에서 제외된다 (SSE·스트리밍 등 향후 확장 대비 opt-out 경로).
4. 클라이언트가 `Accept-Encoding`을 보내지 않으면 압축 없이 평문 응답을 받는다 (정상 동작).

## 3. 수용 기준 (Acceptance Criteria)

- [ ] `compression` 패키지와 `@types/compression`가 의존성에 추가된다.
- [ ] `libs/shared/src/bootstrap/compression.ts`에 `applyCompressionMiddleware(app, options?)` 헬퍼가 신설되고, `libs/shared/src/index.ts`에서 export된다.
- [ ] service `main.ts`, back-office `main.ts`, 통합 테스트 헬퍼 `createIntegrationApp` 3곳 모두에서 헬퍼를 호출한다.
- [ ] `Accept-Encoding: gzip` + 1KB 초과 응답에 대해 `Content-Encoding: gzip`이 설정된다 (통합 테스트로 검증).
- [ ] 응답에 `x-no-compression` 헤더가 있으면 압축되지 않는다 (filter 동작 검증).
- [ ] `pnpm build:all`, `pnpm test`, `pnpm test:e2e` 모두 통과한다.
- [ ] `docs/compression-guide.md` 작성 + `CLAUDE.md`에 Compression 섹션 추가.

## 4. 비기능 요구사항

- **단일 진실 원천**: 압축 설정 변경은 반드시 `compression.ts` 헬퍼 한 곳에서만 한다 (security.ts 선례와 동일). main.ts에 옵션을 중복 정의하지 않는다.
- **threshold 1KB**: `compression` 기본값 유지. 작은 응답에 대한 압축 오버헤드 회피.
- **opt-out**: `compression`의 기본 filter를 확장하여 응답 헤더 `x-no-compression`이 있으면 압축을 건너뛴다 (`compression`의 권장 패턴).
- **미들웨어 순서**: `applySecurityMiddleware` 호출 **이후**에 `applyCompressionMiddleware`를 호출한다. 두 미들웨어 모두 라우트 핸들러보다 먼저 등록되므로 헤더/압축 동작에 충돌은 없으나, 적용 순서를 일관되게 유지한다.
- **타입 안전**: 헬퍼 시그니처는 `INestApplication`을 받고 `void`를 반환. 옵션은 `import type`으로 들여오는 인터페이스로 노출 (SWC `isolatedModules` 호환).
- **테스트 격리**: 기존 `security.integration-spec.ts`와 동일하게 service + back-office 양쪽에서 압축 헤더를 검증한다.

## 5. 범위 외 (Out of scope)

- Brotli(`br`) 인코딩 — `compression` 패키지는 gzip/deflate만 지원. Brotli는 별도 패키지(`shrink-ray-current` 등)가 필요하므로 이번 범위 제외.
- env 기반 threshold/level 런타임 튜닝 — 기본값 고정. 추후 필요 시 별도 작업.
- 정적 파일 사전 압축(precompressed assets), CDN 레벨 압축.
- 요청 본문(request body) 압축 해제 — 표준 클라이언트는 요청을 압축하지 않으므로 제외.

## 6. 영향받는 파일 목록 (구현 팀 참고)

| 파일 | 변경 내용 |
| --- | --- |
| `package.json` | `compression` 의존성, `@types/compression` devDependency 추가 |
| `libs/shared/src/bootstrap/compression.ts` | **신규** — `applyCompressionMiddleware` 헬퍼 + opt-out filter |
| `libs/shared/src/index.ts` | `applyCompressionMiddleware` (및 옵션 타입) export 추가 |
| `apps/service/src/main.ts` | `applySecurityMiddleware` 호출 직후 `applyCompressionMiddleware(app)` 추가 |
| `apps/back-office/src/main.ts` | 동일하게 `applyCompressionMiddleware(app)` 추가 |
| `test/setup/integration-helper.ts` | `createIntegrationApp` 내부에서 `applyCompressionMiddleware(app)` 호출 |
| `test/service/compression.integration-spec.ts` | **신규** — gzip 헤더 + opt-out 통합 테스트 |
| `test/back-office/compression.integration-spec.ts` | **신규** — back-office 압축 헤더 통합 테스트 |
| `docs/compression-guide.md` | **신규** — 가이드 문서 |
| `CLAUDE.md` | Compression 섹션 추가 (Security 섹션 인근) |

## 7. 멀티 에이전트 실행 계획 (Task 분해)

승인 후 아래 순서로 진행한다. 각 단계는 의존 관계 순으로 정렬됨.

| # | Task | 담당 에이전트 | 의존 |
| --- | --- | --- | --- |
| T1 | `compression` + `@types/compression` 설치, `applyCompressionMiddleware` 헬퍼 신설 + index export | `nestjs-expert` | — |
| T2 | service / back-office `main.ts` + `createIntegrationApp` 3곳 헬퍼 호출 적용 | `nestjs-expert` | T1 |
| T3 | service / back-office 압축 통합 테스트 작성 (gzip 헤더 + opt-out) | `tdd-test-writer` | T2 |
| T4 | `docs/compression-guide.md` 작성 + `CLAUDE.md` 섹션 추가 | `nestjs-expert` | T2 |
| T5 | 전체 검증(`format`→`lint:check`→`build:all`→`test`→`test:e2e`) + diff fresh review | `code-reviewer` | T3, T4 |
