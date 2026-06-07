# libs/shared — 공유 라이브러리 가이드

엔티티·마이그레이션·공통 인프라(`@app/shared`로 import). 양쪽 앱이 공유하므로 여기 변경은 두 앱에 모두 영향을 준다.

## 엔티티 & DB

### Database Naming Convention

- **코드는 camelCase, DB 컬럼은 snake_case**. `typeorm-naming-strategies`의 `SnakeNamingStrategy`를 `DataSourceOptions.namingStrategy`로 적용 (`libs/shared/src/database/typeorm.config.ts`). 엔티티 프로퍼티가 `createdAt`/`userId`/`hashedRefreshToken`이면 DB 컬럼은 자동으로 `created_at`/`user_id`/`hashed_refresh_token`으로 매핑됨
- 새 엔티티 추가 시 `@Column()`에 별도 옵션 없이 자동 변환됨. `@Column({ name: 'snake_case' })`로 수동 명명하지 않는다 (strategy와 중복)
- `@JoinColumn`에 `name` 인자를 지정하지 않는다 — 하드코딩하면 strategy를 우회하여 camelCase 컬럼이 생성됨. 인자 없이 `@JoinColumn()`만 사용
- **DB 제약은 엔티티에 선언**한다 — raw migration에만 작성하면 다음 번 `migration:generate` 시 누락되어 회귀 발생. partial unique index는 `@Index('UQ_xxx', ['propA', 'propB'], { unique: true, where: '"snake_case_col" IS NULL' })`, FK ON DELETE 동작은 `@ManyToOne(() => X, { onDelete: 'CASCADE' })`로 엔티티가 단일 진실 원천이 되도록 한다 (`libs/shared/src/entities/post.entity.ts` 참고)

### 엔티티 양방향 관계 — SWC 호환 필수 패턴

- 순환 참조 + `decoratorMetadata`가 TDZ를 유발하므로 관계 타입을 `Relation<T>`로 감싸고, `Relation`은 반드시 `import type { Relation } from 'typeorm'`로 들여온다(`isolatedModules` + `emitDecoratorMetadata` 조합에서 TS1272 회피). 새 엔티티가 양방향 관계를 가질 때마다 동일 패턴 강제.

### Soft Delete

- Post 엔티티에 `@DeleteDateColumn()` 적용 — 삭제 시 `deletedAt` 타임스탬프 기록, 실제 행은 유지
- TypeORM의 `softDelete()`/`restore()` 메서드 사용

## Bootstrap 헬퍼

### Security (helmet + CORS)

- `applySecurityMiddleware` 공유 헬퍼 (`libs/shared/src/bootstrap/security.ts`)가 main.ts 2곳 + `createIntegrationApp`에서 동일하게 호출됨. 보안 설정은 반드시 이 헬퍼를 수정하여 한 곳에서 관리한다.
- helmet CSP directive는 Swagger UI 호환을 위해 `styleSrc`/`scriptSrc`에 `'unsafe-inline'`, `imgSrc`에 `data:`/`validator.swagger.io`를 허용한다.
- CORS whitelist 환경변수는 앱별로 분리: `SERVICE_CORS_ORIGINS` (service), `BACK_OFFICE_CORS_ORIGINS` (back-office). 쉼표 구분 origin 목록.
- fallback 정책: `NODE_ENV=local`/`development`에서 env 미설정 시 `origin: true`(모든 origin 허용). `production`에서 env 누락 시 `enableCors`를 호출하지 않음(fail-safe).
- CORS origin 거부는 반드시 `cb(null, false)` 사용 — `cb(new Error(...))`는 500 응답 및 에러 로그 오염을 유발하므로 금지.
- `credentials: true` + `allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key']`. 새 커스텀 헤더 도입 시 이 목록을 업데이트해야 브라우저에서 사용 가능.
- `createIntegrationApp(appModule, { corsOriginEnvKey })`로 테스트별 CORS 키를 명시. 기본값은 `SERVICE_CORS_ORIGINS` — back-office 통합 테스트는 `BACK_OFFICE_CORS_ORIGINS`를 명시적으로 전달.
- 상세 가이드: `docs/helmet-cors-guide.md`

### Compression

- HTTP 응답 본문을 gzip으로 압축하여 전송량/지연을 줄인다. `applyCompressionMiddleware` 공유 헬퍼(`libs/shared/src/bootstrap/compression.ts`)가 service main.ts + back-office main.ts + `createIntegrationApp` 3곳에서 동일하게 호출됨. 압축 설정 변경은 반드시 이 헬퍼 한 곳에서만 한다 (security.ts 선례와 동일).
- threshold 1KB(`compression` 기본값 유지) — 본문이 1KB 미만이면 압축 오버헤드를 피하기 위해 압축하지 않는다.
- 라우트별 opt-out: 응답에 `x-no-compression` 헤더를 설정하면 해당 응답은 압축에서 제외된다 (SSE/스트리밍 등). 기본 filter를 확장하여 이 헤더를 감지하고, 그 외에는 `compression` 기본 filter에 위임한다.
- 미들웨어 순서: `applySecurityMiddleware` 호출 **직후**에 `applyCompressionMiddleware`를 호출하여 보안 → 압축 순서를 모든 진입점에서 일관되게 유지한다.
- **상용은 nginx 위임**: `applyCompressionMiddleware`는 `NODE_ENV === 'production'`이면 미들웨어를 등록하지 않고 early return한다. `compression`은 이벤트 루프에서 동기 gzip을 수행해 고트래픽 시 CPU 병목이 되므로, 상용에서는 nginx 등 리버스 프록시가 압축을 담당하고 앱·프록시 이중 압축을 회피한다. `local`·`development`·`test`에서는 그대로 활성화(통합 테스트는 jest 기본 `NODE_ENV=test`라 압축 검증이 그대로 통과). 환경 분기는 헬퍼 한 곳에서만 수행하므로 호출부는 변경 없음 — `applySecurityMiddleware`의 production fail-safe 분기와 동일 선례.
- `compression`은 Express 미들웨어 패키지로, 양쪽 앱의 Express 어댑터 위에서 `app.use()`로 등록된다. Brotli·env 런타임 튜닝은 범위 외.
- 상세 가이드: `docs/compression-guide.md`

## 인프라 모듈

### Cache Layer

- `CacheService` (`libs/shared/src/cache/`) — 기존 `REDIS_CLIENT`(ioredis)를 재사용한 캐시 유틸리티. 추가 패키지 없음
- **CQRS 정합**: Query Handler에서 캐시 읽기/저장, Command Handler에서 캐시 무효화
- **Fail-Open 패턴**: 모든 Redis 연산을 `CacheService` 내부에서 try/catch로 감싸 Redis 장애 시 DB fallback. 캐시 장애가 서비스 가용성에 영향을 미치지 않음
- **핸들러 레벨 wrap 금지**: `CacheService.{get,set,del,delByPattern}` 호출은 Handler에서 다시 `try/catch`로 감싸지 않는다. `CacheService` 자체가 Redis 에러를 swallow하고 rethrow하지 않으므로 wrap하면 dead catch + 중복 warn 로그가 된다. `await this.cacheService.del(...)` 한 줄로만 호출한다. 동일 영역의 `CreatePostHandler`/`UpdatePostHandler`/`DeletePostHandler`가 기준 패턴.
- **사용자 격리**: 모든 캐시 키에 `userId` 포함 (예: `post:{userId}:{postId}`)
- 캐시 히트/미스/SET/DEL을 `debug` 레벨로 로깅, 장애 시 `warn` 레벨 로깅
- 상세 가이드: `docs/cache-layer-guide.md`

### Logging

- `pino-http` 기반 구조화 로깅 (`libs/shared/src/logging/`)
- `LoggingInterceptor` — HTTP 요청/응답 로깅 (글로벌 적용)
- `HttpExceptionFilter` — 예외 처리 및 에러 로깅 (글로벌 적용)
- correlation ID, 민감 정보 redaction 지원

### Idempotency

- `@Idempotent()` 데코레이터 (`libs/shared/src/idempotency/`) — POST 엔드포인트에 적용하여 중복 요청 방지
- Redis 기반 멱등성 키 저장. `IdempotencyInterceptor`가 요청 헤더의 키로 중복 여부 판단
- `IdempotencyModule`을 import하여 사용

### Health Check & Graceful Shutdown

- `@nestjs/terminus` 기반 `GET /health` 엔드포인트 — DB(TypeORM) + Redis 연결 상태 확인
- `RedisHealthIndicator` — `HealthIndicatorService`를 사용한 커스텀 헬스 인디케이터 (`libs/shared/src/health/redis-health.indicator.ts`)
- `@SkipThrottle({ short: true, long: true })` — Health Check는 Rate Limiting 제외 (K8s probe 보호)
- `app.enableShutdownHooks()` — SIGTERM/SIGINT 시 `OnModuleDestroy` 훅 트리거 (Redis 연결 정리 등)

### OpenTelemetry

- `libs/shared/src/instrumentation.ts` — OTEL SDK 자동 계측 초기화 (양쪽 앱의 `main.ts`에서 import)
- `OTEL_ENABLED` 환경변수로 활성화/비활성화 제어
- `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`으로 trace 수집 대상 설정
- `OTEL_SERVICE_NAME`은 `package.json` start 스크립트에서 앱별로 강제(service / back-office) — 환경변수 미설정 시 두 앱이 같은 식별자로 보고됨

### Slow Query Slack Alert (OTEL 기반)

외부 OTEL 백엔드 없이도 단일 PostgreSQL 쿼리가 임계값을 넘으면 Slack 채널로 알림을 보내는 인앱 후크. 코드는 `libs/shared/src/otel/` + `libs/shared/src/instrumentation.ts` + `libs/shared/src/slack/slack.service.ts`(sendSlowQueryAlert).

- 데이터 흐름: pg 자동 계측 → `SlowQuerySpanProcessor` → 모듈 레벨 callback registry → `SlowQueryAlertHandler` (NestJS DI) → `SlackService.sendSlowQueryAlert` → `#prod-slow-query` / `#dev-slow-query` 채널
- Boot-time SpanProcessor와 NestJS DI 사이 연결: 모듈 레벨 callback + buffer(BUFFER_CAP=100건) 패턴. SpanProcessor는 NestJS DI 컨테이너 부팅 전에 생성되므로 EventBus 등 DI 기반 이벤트 시스템을 사용할 수 없음.
- Dedup: SQL 본문 SHA-1 앞 16자를 키로 60초 TTL Redis 중복 제거 (분산 환경 모든 인스턴스 공유). `CacheService` Fail-Open이라 Redis 장애 시 dedup 효과만 사라지고 알림 자체는 계속 전송
- 환경변수: `SLOW_QUERY_THRESHOLD_MS`(기본 5000, NaN/음수면 폴백), `SLACK_BOT_TOKEN` 미설정 시 silent skip
- 양쪽 앱 활성화: 각 앱의 루트 모듈(`ServiceAppModule`/`BackOfficeAppModule`)이 `OtelAlertingModule` import 필수
- 민감 정보 보호: pg 자동 계측의 `enhancedDatabaseReporting` 기본값 `false` 유지로 SQL 파라미터 값(비밀번호 등) 캡처 안 됨
