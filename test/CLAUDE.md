# test — 통합 테스트 가이드

Testcontainers 기반 통합 테스트(`test/service/*.integration-spec.ts`, `test/back-office/*.integration-spec.ts`). 단위 테스트 작성 패턴은 `apps/service/CLAUDE.md`의 "단위 테스트 작성 패턴" 참고.

## 통합 테스트 구조

- **Testcontainers + `globalSetup` 패턴** — `globalSetup`에서 PostgreSQL/Redis 컨테이너를 1회 기동하고 migration을 실행한 뒤, 접속 정보를 `.test-env.json`에 기록. 각 테스트 파일은 `createIntegrationApp(ServiceAppModule)`(back-office는 `AdminTestModule`)으로 앱을 생성하고 `useTransactionRollback()`으로 **per-test 격리**를 적용하여 mock 없이 전체 플로우(Controller → CommandBus/QueryBus → Handler → Repository → TypeORM → PostgreSQL) 검증. HTTP 레이어(ValidationPipe, 라우팅, 상태 코드)도 통합 테스트에서 함께 검증. `globalTeardown`에서 컨테이너 종료 및 임시 파일 삭제. Docker 필수.
- **격리 메커니즘**: `useTransactionRollback().start()`(beforeEach)에서 **TRUNCATE RESTART IDENTITY CASCADE + Redis FLUSHDB**로 매 테스트 직전 정리. `rollback()`(afterEach)는 no-op. `dataSource.manager` override 방식은 `@Transactional()`(typeorm-transactional)이 별도 커넥션으로 새 트랜잭션을 열어 충돌하므로 사용하지 않는다. 첫 테스트 실행 전과 다른 spec 파일 사이에는 새 `createIntegrationApp` 호출이 정리를 보장.
- **typeorm-transactional 등록**: `createIntegrationApp` 내부에서 `deleteDataSourceByName('default')` 후 `addTransactionalDataSource(app.get(DataSource))` 호출. spec 파일마다 새 DataSource를 만들므로 매번 재등록 필요.
- **Jest setupFiles**: 루트 `jest` 설정과 `test/{service,back-office}/jest-e2e.json`에 `test/setup/jest-setup.ts`가 등록되어 `initializeTransactionalContext()`를 1회 실행.
- ~~**e2e 테스트**~~ — 제거됨. 통합 테스트가 HTTP 레이어를 포함한 전체 플로우를 검증하므로 별도 e2e 테스트를 유지하지 않음.

## 작성 규칙

- 통합 테스트 URL은 `/v1/` 프리픽스 사용 필수 (URI 버저닝 `defaultVersion: '1'`).
- Rate Limiting은 `THROTTLE_SKIP=true`로 통합 테스트 환경에서 비활성화된다 (`skipIf` 설정).
- Jest `globalSetup`/`globalTeardown` 파일은 반드시 상대 경로 import를 사용한다 (path alias 금지).
- 필수 요청 필드를 공유 엔드포인트(예: auth/register)에 추가할 때는 그 엔드포인트를 호출하는 모든 통합 스펙의 픽스처를 함께 갱신하고 전체 `pnpm test:e2e`를 실행한다.
