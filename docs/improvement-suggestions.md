# NestJS 프로젝트 개선 제안

현재 프로젝트 분석 결과를 기반으로, 서버 개발 역량을 더 키울 수 있는 기술/패턴들을 난이도와 학습 가치 기준으로 정리한 문서입니다.

## 현재 프로젝트 현황

이미 적용된 패턴 및 기능:

- Repository Pattern (ISP 적용, Read/Write 분리)
- CQRS Pattern (Command/Query Bus)
- JWT 인증 (Access + Refresh Token)
- 이벤트 기반 Slack 알림 (EventEmitter)
- 멱등성 처리 (Redis 기반)
- 구조화 로깅 (pino-http)
- Soft Delete
- 페이지네이션
- 통합 테스트 (Testcontainers)
- Swagger API 문서화
- TypeORM Migration 관리

---

## 제안 목록

### 1. Health Check & Graceful Shutdown

**난이도**: 낮음

**개요**

- `@nestjs/terminus`로 `/health` 엔드포인트 추가 (DB, Redis 연결 상태 확인)
- `app.enableShutdownHooks()`로 SIGTERM/SIGINT 시 진행 중인 요청 완료 후 종료

**학습 포인트**

- 프로덕션 배포의 기본 -- K8s liveness/readiness probe, 무중단 배포의 기초

**관련 패키지**

- `@nestjs/terminus`
- `@godaddy/terminus` (내부 의존)

---

### 2. Rate Limiting

**난이도**: 낮음

**개요**

- `@nestjs/throttler`로 API 요청 제한 (예: 로그인 시도 분당 5회)
- Redis 기반 분산 rate limiting으로 확장 가능

**학습 포인트**

- 서비스 보호, DDoS 방어의 첫 단계

**관련 패키지**

- `@nestjs/throttler`

---

### 3. Cache Layer

**난이도**: 중간

**개요**

- 이미 Redis(ioredis)가 있으니 `@nestjs/cache-manager`로 읽기 캐싱 적용
- CQRS와 자연스럽게 맞물림 -- Query에 캐시 적용, Command 실행 시 캐시 무효화

**학습 포인트**

- Cache-Aside, Write-Through 패턴
- 캐시 일관성 전략 (TTL, 무효화 시점)

**관련 패키지**

- `@nestjs/cache-manager`
- `cache-manager-ioredis-yet`

---

### 4. Bull/BullMQ 기반 비동기 Job Queue

**난이도**: 중간

**개요**

- 현재 Slack 알림이 EventEmitter(in-process)로 동작 -- 서버 재시작 시 유실됨
- `@nestjs/bullmq` + Redis로 영속적 비동기 작업 큐 전환
- 재시도, 지연 실행, 우선순위 큐, Dead Letter Queue 구현

**학습 포인트**

- 메시지 큐 패턴, 장애 복구, 백그라운드 처리
- 실무에서 가장 많이 쓰는 비동기 처리 패턴 중 하나

**관련 패키지**

- `@nestjs/bullmq`
- `bullmq`

---

### 5. Role-Based Access Control (RBAC)

**난이도**: 중간

**개요**

- 현재 인증(Authentication)만 있고 인가(Authorization)가 없음
- Custom `@Roles()` 데코레이터 + `RolesGuard` 구현
- 예: 작성자만 자기 게시물 수정/삭제 가능 (현재는 userId 체크 없음)

**학습 포인트**

- Guard 체이닝, 메타데이터 리플렉션
- 도메인 수준 권한 설계

**구현 방향**

- User 엔티티에 `role` 필드 추가 (enum: USER, ADMIN)
- `@Roles('ADMIN')` 데코레이터 + `RolesGuard`
- 리소스 소유권 검증: 게시물 수정/삭제 시 `post.userId === currentUser.id` 확인

---

### 6. OpenTelemetry 분산 추적

**난이도**: 중간~높음

**개요**

- `@opentelemetry/sdk-node` + NestJS 통합
- 요청 -> Handler -> Repository -> DB 전체 trace 추적
- Jaeger 또는 Zipkin으로 시각화

**학습 포인트**

- Observability 3대 축(Logs, Metrics, Traces) 완성
- 로깅은 이미 있으니 트레이싱을 추가하여 요청 전체 흐름 파악

**관련 패키지**

- `@opentelemetry/sdk-node`
- `@opentelemetry/auto-instrumentations-node`
- `@opentelemetry/exporter-jaeger`

---

### 7. API Versioning

**난이도**: 낮음

**개요**

- NestJS 내장 `app.enableVersioning()` 활용 (URI, Header, Media Type 방식)
- 예: `/v1/posts`, `/v2/posts`

**학습 포인트**

- 하위 호환성 유지 전략
- API 진화 관리

**구현 방향**

```typescript
// main.ts
app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',
});
```

---

### 8. Custom Exception Hierarchy

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

### 9. Docker Compose + CI/CD 파이프라인 강화

**난이도**: 중간

**개요**

- `docker-compose.yml`로 App + PostgreSQL + Redis 통합 실행 환경
- GitHub Actions에 빌드 -> 린트 -> 테스트 -> Docker 이미지 빌드 파이프라인

**학습 포인트**

- 컨테이너화, 인프라 코드화
- 서버 개발자 필수 역량

**구현 방향**

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports: ['3000:3000']
    depends_on: [postgres, redis]
  postgres:
    image: postgres:17-alpine
  redis:
    image: redis:7-alpine
```

---

### 10. Outbox Pattern + Event 신뢰성

**난이도**: 높음

**개요**

- 현재 이벤트가 트랜잭션과 분리되어 있어 DB 커밋 후 이벤트 유실 가능
- Outbox 테이블에 이벤트를 함께 커밋 -> 별도 프로세스가 발행

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

| 순서 | 항목                             | 이유                                  |
| ---- | -------------------------------- | ------------------------------------- |
| 1    | Health Check + Graceful Shutdown | 바로 적용 가능, 프로덕션 기본기       |
| 2    | Rate Limiting                    | 간단하지만 보안 필수                  |
| 3    | RBAC                             | 현재 프로젝트에 가장 자연스러운 확장  |
| 4    | BullMQ Job Queue                 | 비동기 처리 패턴 학습 가치 높음       |
| 5    | Cache Layer                      | CQRS와의 시너지 체험                  |
| 6    | Custom Exception Hierarchy       | 코드 품질 향상                        |
| 7    | API Versioning                   | API 설계 성숙도 향상                  |
| 8    | Docker Compose + CI/CD           | 인프라 역량 확장                      |
| 9    | OpenTelemetry                    | Observability 완성                    |
| 10   | Outbox Pattern                   | 분산 시스템 심화                      |
