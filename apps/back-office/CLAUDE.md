# apps/back-office — 관리자 서버 가이드

관리자 서버 (Admin Auth, ADMIN_PORT=3001). 루트 모듈은 `BackOfficeAppModule`.

> **공통 패턴은 `apps/service/CLAUDE.md`를 따른다** — CQRS 설계 원칙, Handler Authoring Rules, Repository Pattern DI 구조(`IAdminReadRepository`/`IAdminWriteRepository` 동일 적용), Transaction Infrastructure, DTO 구조, API Versioning, Rate Limiting, Swagger. back-office 작업 전 해당 문서를 먼저 읽는다.

## back-office 특이사항

- **JWT 발급**: `AdminTokenIssuer`가 service 앱의 `AuthTokenIssuer`와 동일한 역할 수행. JWT secret은 `configService.getOrThrow<string>(...)`로 로드 (env 누락 시 부팅 실패).
- **CORS**: 환경변수 키가 service와 분리 — `BACK_OFFICE_CORS_ORIGINS` 사용 (`SERVICE_CORS_ORIGINS` 아님).
- **이벤트 미발행**: 현재 EventBus 이벤트를 발행하지 않으므로 `CqrsLoggingModule`을 import하지 않는다. 이벤트 도입 시점에 `BackOfficeAppModule`에 추가한다.
- **통합 테스트는 `AdminTestModule` 사용**: `test/back-office/admin-test.module.ts`가 back-office 통합 테스트 전용 부트스트랩 모듈이다. `BackOfficeAppModule`을 직접 쓰지 않는 기존 관례를 유지하고, `createIntegrationApp(AdminTestModule, { corsOriginEnvKey: 'BACK_OFFICE_CORS_ORIGINS' })`처럼 CORS 키를 명시적으로 전달한다.
