# NestJS 프로젝트 개선 제안

현재 프로젝트 분석 결과를 기반으로, 서버 개발 역량을 더 키울 수 있는 기술/패턴 중 **아직 적용되지 않았거나 부분 구현 상태인 항목**만 정리한 문서입니다. 이미 완료된 항목은 본 문서에서 제거되었습니다.

## 현재 프로젝트 현황

이미 적용된 패턴 및 기능:

- Repository Pattern (ISP 적용, Read/Write 분리)
- CQRS Pattern (Command/Query Bus)
- JWT 인증 (Access + Refresh Token, OAuth 연동 포함)
- 이벤트 기반 Slack 알림 (EventEmitter)
- 멱등성 처리 (Redis 기반)
- 구조화 로깅 (pino-http)
- Soft Delete
- 페이지네이션
- 통합 테스트 (Testcontainers)
- Swagger API 문서화
- TypeORM Migration 관리
- Health Check + Graceful Shutdown (`@nestjs/terminus` + `enableShutdownHooks()`)
- Rate Limiting (`@nestjs/throttler`, named throttlers)
- Cache Layer (`CacheService` + Redis Fail-Open)
- OpenTelemetry (auto-instrumentation + Slow Query Slack Alert)
- API Versioning (URI, `defaultVersion: '1'`)
- CI/CD 파이프라인 (`.github/workflows/`에 ci, coverage, dependency-audit, migration-safety, pr-auto-label, typescript-strict)

---

## 제안 목록

### 1. Custom Exception Hierarchy

**난이도**: 낮음~중간

**개요**

- 도메인별 예외 클래스 생성 (`PostNotFoundException`, `DuplicateEmailException` 등)
- `HttpExceptionFilter`에서 도메인 예외 -> HTTP 상태 코드 매핑

**학습 포인트**

- 도메인 로직과 HTTP 레이어 분리
- 에러 핸들링 체계화

**구현 방향**

```typescript
// 도메인 예외 (HTTP 의존 없음)
export class PostNotFoundException extends DomainException {
  constructor(id: number) {
    super(`Post with id ${id} not found`);
  }
}

// Filter에서 매핑
const EXCEPTION_STATUS_MAP = {
  PostNotFoundException: HttpStatus.NOT_FOUND,
  DuplicateEmailException: HttpStatus.CONFLICT,
};
```

---

### 2. RBAC 보강 (Role-Based Access Control)

**난이도**: 중간

**현재 상태**

- Back-office: `Admin.role` 컬럼(AdminRole enum) 존재 — 부분 인가 기반 마련됨
- Service 앱: `User`에 `role` 컬럼 없음
- `@Roles()` 데코레이터 / `RolesGuard` / 리소스 소유권 가드 모두 미구현
- 현재는 핸들러에서 `userId === currentUser.id` 검증으로 소유권 처리 중

**잔여 작업**

- `User.role` 컬럼 추가 + 마이그레이션 (`USER` / `ADMIN`)
- `@Roles()` 커스텀 데코레이터 + `RolesGuard` 구현 (메타데이터 리플렉션)
- 리소스 소유권 검증을 가드 또는 공통 유틸로 일원화 (게시물 수정/삭제 시 `post.userId === currentUser.id`)

**학습 포인트**

- Guard 체이닝, 메타데이터 리플렉션
- 도메인 수준 권한 설계 (역할 기반 + 리소스 소유권 분리)

---

### 3. BullMQ 기반 비동기 Job Queue

**난이도**: 중간

**개요**

- 현재 Slack 알림이 EventEmitter(in-process)로 동작 -- 서버 재시작 시 유실됨
- `@nestjs/bullmq` + Redis로 영속적 비동기 작업 큐 전환
- 재시도, 지연 실행, 우선순위 큐, Dead Letter Queue 구현
- 이미 `ioredis`가 있으니 동일 Redis 인스턴스 재사용 가능

**학습 포인트**

- 메시지 큐 패턴, 장애 복구, 백그라운드 처리
- 실무에서 가장 많이 쓰는 비동기 처리 패턴 중 하나

**관련 패키지**

- `@nestjs/bullmq`
- `bullmq`

---

### 4. Docker Compose 보강

**난이도**: 낮음~중간

**현재 상태**

- `docker-compose.yml`에 postgres / redis / jaeger만 정의
- 각 서비스에 healthcheck 블록 없음
- 앱(`service`, `back-office`) 자체는 compose에 포함되지 않음 (로컬에서 `pnpm start:local`로 실행)
- CI/CD 파이프라인은 `.github/workflows/`에 6개 워크플로로 충분히 구성됨

**잔여 작업**

- `postgres` healthcheck 추가 (`pg_isready -U $POSTGRES_USER`)
- `redis` healthcheck 추가 (`redis-cli ping`)
- (선택) `service` / `back-office` 앱 서비스를 compose에 추가하고 `depends_on: condition: service_healthy`로 단일 명령 기동 지원

**학습 포인트**

- 컨테이너 의존성 관리 (start-up race 회피)
- 인프라 코드화

**구현 방향**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U local_user -d nest_repository']
      interval: 5s
      timeout: 3s
      retries: 5
  redis:
    image: redis:7-alpine
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5
```

---

### 5. Outbox Pattern + Event 신뢰성

**난이도**: 높음

**개요**

- 현재 EventEmitter 이벤트가 DB 트랜잭션과 분리되어 있어 DB 커밋 후 이벤트 유실 가능
- Outbox 테이블에 이벤트를 함께 커밋 -> 별도 프로세스가 발행
- 이미 `typeorm-transactional` 인프라가 있어 트랜잭션 통합 비용 낮음
- BullMQ(#3)와 자연스럽게 시너지 (Outbox publisher를 BullMQ scheduler로 구성 가능)

**학습 포인트**

- 분산 시스템의 핵심 -- Eventual Consistency, At-Least-Once Delivery
- Transactional Outbox Pattern

**구현 방향**

1. `outbox_events` 테이블 생성 (event_type, payload, published_at)
2. Command Handler에서 비즈니스 로직과 Outbox INSERT를 같은 트랜잭션으로 실행
3. Polling Publisher 또는 CDC(Change Data Capture)로 이벤트 발행
4. 발행 완료 시 `published_at` 업데이트

---

## 추천 학습 순서

실무 영향도와 학습 곡선을 고려한 순서:

| 순서 | 항목                       | 이유                                                       |
| ---- | -------------------------- | ---------------------------------------------------------- |
| 1    | Custom Exception Hierarchy | 작은 변경량, 즉시 코드 품질 향상                           |
| 2    | RBAC 보강                  | 현재 프로젝트의 자연스런 확장 (마이그레이션 1개)           |
| 3    | BullMQ Job Queue           | 실무 가치 높음. Outbox publisher로 재사용 가능             |
| 4    | Docker Compose 보강        | 빠르게 끝남. 인프라 안정성 향상                            |
| 5    | Outbox Pattern             | BullMQ 인프라 위에서 구현. 분산 시스템 심화 학습 마무리    |
