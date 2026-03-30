# Idempotency(멱등성) 가이드: 중복 요청 방지

> 이 문서는 API에서 중복 요청이 발생하는 원인을 설명하고, Idempotency-Key 패턴으로 해결하는 방법을 입문자도 이해할 수 있도록 안내한다.
> [참고 블로그: Implementing Idempotency in NestJS with an Interceptor](https://michaelguay.dev/implementing-idempotency-in-nestjs-with-an-interceptor/)

---

## 목차

### Part I: 개념 이해
- [1. 문제 상황: 왜 중복 요청이 발생하는가?](#1-문제-상황-왜-중복-요청이-발생하는가)
- [2. 멱등성(Idempotency)이란?](#2-멱등성idempotency이란)
- [3. Idempotency-Key 패턴이란?](#3-idempotency-key-패턴이란)

### Part II: 대안 비교
- [4. 해결 대안 비교](#4-해결-대안-비교)
- [5. 왜 Idempotency-Key를 선택했는가?](#5-왜-idempotency-key를-선택했는가)

### Part III: 설계
- [6. 전체 흐름 한눈에 보기](#6-전체-흐름-한눈에-보기)
- [7. 핵심 컴포넌트 설명](#7-핵심-컴포넌트-설명)
- [8. 동시 요청 처리 (Race Condition)](#8-동시-요청-처리-race-condition)

### Part IV: 구현 상세
- [9. 파일 구조](#9-파일-구조)
- [10. Step-by-Step 구현](#10-step-by-step-구현)

### Part V: 사용법
- [11. API 사용 예시](#11-api-사용-예시)
- [12. 에러 케이스 정리](#12-에러-케이스-정리)
- [13. 검증 방법](#13-검증-방법)

---

## Part I: 개념 이해

---

## 1. 문제 상황: 왜 중복 요청이 발생하는가?

사용자가 "게시글 작성" 버튼을 클릭하면 브라우저가 서버에 POST 요청을 보낸다. 이 과정에서 중복 요청이 발생하는 시나리오는 여러 가지가 있다.

### 1.1 시나리오별 분류

| 시나리오 | 원인 | 결과 |
|----------|------|------|
| **더블 클릭** | 사용자가 버튼을 빠르게 2번 클릭 | 동일한 POST 요청 2회 전송 |
| **네트워크 타임아웃** | 첫 요청의 응답이 늦어 사용자가 다시 클릭 | 서버에서는 2건 모두 처리 |
| **브라우저 새로고침** | 결과 페이지에서 F5를 누름 | POST 재전송 (브라우저 경고가 뜨지만 무시 가능) |
| **자동 재시도** | Axios 등 HTTP 클라이언트가 실패 시 자동 재시도 | 서버가 이미 처리한 요청을 다시 받음 |

### 1.2 결제 시나리오에서의 위험

```text
1. 사용자가 "결제하기" 버튼 클릭
2. 요청이 서버로 전송됨 (네트워크 느림)
3. 사용자가 응답이 없다고 생각하여 다시 클릭
4. 서버는 2건의 결제 요청을 각각 처리
5. → 이중 결제 발생!
```

이것이 이 프로젝트에서 해결하려는 핵심 문제다.

---

## 2. 멱등성(Idempotency)이란?

> **멱등성**: 동일한 요청을 여러 번 실행해도 결과가 한 번 실행한 것과 동일한 성질

### 2.1 HTTP 메서드별 멱등성

| HTTP 메서드 | 멱등한가? | 설명 |
|-------------|-----------|------|
| GET | O | 같은 URL을 몇 번 조회해도 결과 동일 |
| PUT | O | 같은 데이터로 몇 번 업데이트해도 결과 동일 |
| DELETE | O | 이미 삭제된 리소스를 다시 삭제해도 결과 동일 |
| **POST** | **X** | 같은 데이터로 2번 호출하면 **2건이 생성됨** |

POST가 원래 멱등하지 않기 때문에, **별도의 메커니즘**이 필요하다. 그것이 Idempotency-Key 패턴이다.

### 2.2 비유로 이해하기

- **멱등하지 않은 것**: ATM에서 "출금" 버튼을 2번 누르면 2번 출금됨
- **멱등한 것**: 엘리베이터 버튼을 여러 번 눌러도 한 번만 호출됨

우리가 원하는 것은 API를 **엘리베이터 버튼처럼** 만드는 것이다.

---

## 3. Idempotency-Key 패턴이란?

Stripe, PayPal 같은 결제 API에서 널리 사용하는 업계 표준 패턴이다.

### 3.1 기본 원리

```text
[클라이언트]                          [서버]
    |                                  |
    |  POST /posts                     |
    |  Idempotency-Key: abc-123        |
    |  Body: {title, content}          |
    |--------------------------------->|
    |                                  |  1. "abc-123" 키가 캐시에 있는지 확인
    |                                  |  2. 없음 → 요청 처리 + 응답을 캐시에 저장
    |  201 Created {id: 1}             |
    |<---------------------------------|
    |                                  |
    |  POST /posts (재시도)             |
    |  Idempotency-Key: abc-123        |  ← 동일한 키
    |  Body: {title, content}          |
    |--------------------------------->|
    |                                  |  1. "abc-123" 키가 캐시에 있는지 확인
    |                                  |  2. 있음 → 캐시된 응답을 그대로 반환
    |  201 Created {id: 1}             |  ← 동일한 응답 (처리 안 함)
    |<---------------------------------|
```

핵심: 서버가 **키를 기준으로 이미 처리한 요청인지 판단**하고, 처리된 요청이면 **저장해둔 응답을 그대로 반환**한다.

### 3.2 구성 요소

| 구성 요소 | 역할 | 비유 |
|-----------|------|------|
| **Idempotency-Key** | 클라이언트가 보내는 고유 식별자 (UUID) | 택배 송장번호 |
| **Redis** | 키 + 응답을 저장하는 인메모리 캐시 | 택배 추적 시스템 |
| **Interceptor** | 요청을 가로채서 캐시를 확인하는 미들웨어 | 택배 분류 센터 |
| **TTL** | 캐시 만료 시간 (예: 24시간) | 송장번호 유효기간 |

### 3.3 블로그의 핵심 코드

[참고 블로그](https://michaelguay.dev/implementing-idempotency-in-nestjs-with-an-interceptor/)에서 제시하는 구현의 핵심이다:

```typescript
// 블로그의 Interceptor (핵심 로직만 발췌)
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['idempotency-key'];

    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    // 캐시 조회
    const cachedResponse = await this.cacheManager.get(idempotencyKey);
    if (cachedResponse) {
      return from([cachedResponse]);  // 캐시된 응답 반환
    }

    // 캐시 없음 → 요청 처리 + 결과 저장
    return next.handle().pipe(
      tap(async (response) => {
        await this.cacheManager.set(idempotencyKey, response, { ttl: 60 * 5 });
      }),
    );
  }
}
```

우리 프로젝트에서는 블로그의 `cache-manager` 대신 **`ioredis`를 직접 사용**하여 `SET NX` 원자적 선점을 구현하고, **사용자별 키 격리**와 **상태코드 보존**을 추가한다.

---

## Part II: 대안 비교

---

## 4. 해결 대안 비교

중복 요청을 방지하는 방법은 여러 가지가 있다. 각각의 장단점을 비교한다.

### 대안 1: 프론트엔드 방어 (버튼 비활성화)

```typescript
// 프론트엔드 코드 예시
const handleClick = async () => {
  setLoading(true);          // 버튼 비활성화
  try {
    await api.createPost(data);
  } finally {
    setLoading(false);        // 버튼 재활성화
  }
};
```

| 장점 | 단점 |
|------|------|
| 구현이 가장 간단 | 서버 측 방어가 아님 — API 직접 호출 시 무방비 |
| UX 개선 효과 (로딩 표시) | 네트워크 타임아웃, 자동 재시도는 방지 불가 |
| 서버 변경 불필요 | 결제 같은 크리티컬 작업에는 단독으로 부족 |

### 대안 2: 서버 측 요청 중복 차단 (Deduplication Guard)

서버가 `hash(userId + path + body)`로 요청의 "지문"을 만들어, 짧은 시간(예: 5초) 내 동일 지문 요청을 차단한다.

| 장점 | 단점 |
|------|------|
| 클라이언트 변경 불필요 | 멱등하지 않음 — 중복 시 에러(409) 반환 |
| 구현이 비교적 단순 | 의도적으로 2번 호출하는 정당한 케이스도 차단할 수 있음 |

### 대안 3: Idempotency-Key 헤더 + Redis (선택)

클라이언트가 UUID를 보내고, 서버가 응답을 Redis에 캐시하여 동일 키 재요청 시 캐시된 응답을 반환한다.

| 장점 | 단점 |
|------|------|
| 완전한 멱등성 보장 | 클라이언트 협력 필요 (UUID 헤더 전송) |
| 업계 표준 (Stripe, PayPal) | Redis 인프라 필요 |
| 재시도 시 동일 성공 응답 반환 | 구현 복잡도 중간 |
| TTL 자동 만료 (Redis 내장) | |
| 다중 인스턴스 환경에서도 동작 | |

### 대안 4: DB Advisory Lock

PostgreSQL의 Advisory Lock으로 동일 리소스에 대한 동시 쓰기를 직렬화한다.

| 장점 | 단점 |
|------|------|
| 추가 인프라 불필요 | 멱등하지 않음 — 두 번째 요청은 에러 반환 |
| Race condition 완벽 방지 | PostgreSQL 종속적 |

---

## 5. 왜 Idempotency-Key + Redis를 선택했는가?

### 5.1 핵심 차별점: "에러 반환" vs "성공 응답 재생"

```text
[Deduplication Guard]
  첫 번째 요청 → 201 Created {id: 1}
  두 번째 요청 → 409 Conflict ❌  ← 클라이언트는 에러 처리 필요

[Idempotency-Key]
  첫 번째 요청 → 201 Created {id: 1}
  두 번째 요청 → 201 Created {id: 1} ✅  ← 동일한 성공 응답
```

Idempotency-Key는 중복 요청 시에도 **성공 응답을 그대로 반환**한다. 클라이언트 입장에서는 재시도가 항상 안전하다. 이것이 결제 API에서 이 패턴을 표준으로 사용하는 이유다.

### 5.2 왜 Redis인가?

블로그와 동일하게 Redis를 캐시 저장소로 사용한다.

| 비교 항목 | Redis | PostgreSQL 테이블 |
|-----------|-------|-------------------|
| **속도** | 인메모리 — 매우 빠름 (< 1ms) | 디스크 I/O — 상대적으로 느림 |
| **TTL** | `SET key value EX 86400` — 내장 지원 | 별도 cleanup cron 필요 |
| **동시성** | 단일 스레드 — 원자적 처리 | Advisory Lock 등 별도 제어 필요 |
| **다중 인스턴스** | 중앙 집중식 캐시 — 자연스럽게 공유 | DB 공유하면 가능하나 무거움 |
| **인프라** | Redis 서버 필요 | 추가 인프라 불필요 |
| **데이터 영속성** | 휘발성 (재시작 시 소실 가능) | 영구 저장 |

Redis를 선택한 이유:
- **블로그에서 권장하는 프로덕션 방식**이며, 분산 환경(Kubernetes, 로드밸런싱)에서도 동작
- TTL이 내장되어 있어 **만료 키 정리 서비스가 불필요** — 코드가 간결해짐
- 단일 스레드 특성으로 **Advisory Lock 없이도 동시성 문제가 완화**됨
- DB 마이그레이션, Entity, Repository 등 **보일러플레이트 코드가 대폭 줄어듦**

### 5.3 블로그 대비 우리 프로젝트의 개선점

블로그의 기본 구현에 다음을 추가한다:

| 항목 | 블로그 | 우리 프로젝트 |
|------|--------|--------------|
| 키 스코핑 | `idempotencyKey`만 사용 | `userId:idempotencyKey` 복합키 (사용자별 격리) |
| 상태코드 보존 | X (응답 본문만 캐시) | O (statusCode + responseBody를 함께 캐시) |
| UUID 검증 | X | O (UUID v4 형식 검증) |
| 인증 검증 | X | O (userId 누락 시 401 반환) |
| 동시성 제어 | `get`/`set` 분리 (비원자적) | `ioredis` `SET NX` (원자적 선점) |
| 적용 방식 | `@UseInterceptors()` 직접 사용 | `@Idempotent()` 커스텀 데코레이터로 래핑 |
| TTL | 5분 | 24시간 (Stripe 기본값과 동일) |
| TTL 단위 | 미명시 | 밀리초 명시 (`_MS` 접미사, ioredis `PX` 옵션 기준) |

---

## Part III: 설계

---

## 6. 전체 흐름 한눈에 보기

### 6.1 정상 흐름 (첫 번째 요청)

```text
클라이언트
  │  POST /posts
  │  Headers: { Idempotency-Key: "550e8400-..." }
  │  Body: { title: "제목", content: "내용" }
  ▼
IdempotencyInterceptor
  │  1. 헤더에서 Idempotency-Key 추출
  │  2. UUID 형식 검증
  │  3. Redis SET NX: redis.set("idempotency:1:550e8400-...", "PROCESSING", NX) → 성공
  │  4. next.handle() → Handler 실행
  ▼
CreatePostHandler
  │  게시글 생성 로직 실행
  │  return post.id
  ▼
IdempotencyInterceptor (응답 후처리 — tap)
  │  5. Redis 저장: redis.set("idempotency:1:550e8400-...", JSON.stringify({statusCode:201, body:{id:1}}), PX, TTL)
  ▼
클라이언트 ← 201 Created { id: 1 }
```

### 6.2 캐시 히트 (동일 키로 재요청)

```text
클라이언트
  │  POST /posts
  │  Headers: { Idempotency-Key: "550e8400-..." }  ← 동일한 키
  ▼
IdempotencyInterceptor
  │  1. 헤더에서 Idempotency-Key 추출
  │  2. UUID 형식 검증
  │  3. Redis SET NX: redis.set(... NX) → 실패 → redis.get → JSON 파싱 → 캐시 히트
  │  4. 저장된 응답 그대로 반환 (Handler 실행 안 함)
  ▼
클라이언트 ← 201 Created { id: 1 }  ← 동일한 응답
```

### 6.3 모듈 구조

```text
AppModule
├── IdempotencyModule (@Global)     ← 신규 — REDIS_CLIENT + IdempotencyInterceptor 제공
├── PostsModule
│   └── PostsController
│       └── @Idempotent()           ← createPost에 적용
└── ...
```

`IdempotencyModule`이 `@Global()`로 등록되어 `REDIS_CLIENT`와 `IdempotencyInterceptor`를 모든 모듈에서 사용할 수 있다. `cache-manager`/`CacheModule`은 사용하지 않는다.

---

## 7. 핵심 컴포넌트 설명

### 7.1 용어 해설

| 용어 | 설명 |
|------|------|
| **Redis** | 인메모리 데이터 저장소. 키-값 쌍을 매우 빠르게 읽고 쓸 수 있다. TTL(Time-To-Live)을 지원하여 설정한 시간이 지나면 자동으로 데이터가 삭제된다. |
| **ioredis** | Node.js에서 가장 널리 사용되는 Redis 클라이언트. `SET`, `GET`, `DEL` 등 Redis 명령을 직접 실행할 수 있으며, `SET NX` 같은 원자적 연산도 지원한다. 이 프로젝트에서 Redis와의 모든 통신에 사용한다. |
| **SET NX** | Redis의 `SET key value NX EX ttl` 명령. `NX` = "Not eXists" — 키가 없을 때만 설정하는 것을 하나의 원자적 연산으로 보장한다. 동시 요청에서 하나만 선점하도록 할 때 사용한다. |
| **NestJS Interceptor** | Controller 메서드 실행 전후를 감싸는 미들웨어. `intercept(context, next)` 메서드에서 요청을 가로채고, `next.handle()`로 Controller를 실행하며, `pipe(tap(...))`으로 응답을 후처리한다. |
| **TTL (Time-To-Live)** | 캐시 항목의 유효 시간. TTL이 지나면 Redis가 자동으로 해당 키를 삭제한다. 별도 cleanup 로직이 불필요하다. |

### 7.2 `@Idempotent()` 데코레이터

```typescript
// 사용 예시
@Post()
@Idempotent()
async createPost(@Body() dto: CreatePostRequestDto) { ... }
```

`@Idempotent()`는 두 가지 일을 한꺼번에 한다:

1. **메타데이터 설정**: 이 메서드가 멱등성 처리 대상임을 표시
2. **인터셉터 연결**: `IdempotencyInterceptor`를 이 메서드에만 적용

내부적으로 NestJS의 `applyDecorators`를 사용한다:

```typescript
export function Idempotent(): MethodDecorator {
  return applyDecorators(
    SetMetadata(IDEMPOTENT_KEY, true),            // 메타데이터 설정
    UseInterceptors(IdempotencyInterceptor),       // 인터셉터 연결
  );
}
```

**왜 글로벌 인터셉터가 아닌가?**
GET 요청은 이미 멱등하므로 불필요하다. `@Idempotent()`를 메서드 단위로 적용하면 필요한 엔드포인트에만 선택적으로 멱등성을 부여할 수 있다.

### 7.3 `IdempotencyInterceptor`

블로그 코드를 기반으로, 사용자별 키 격리와 상태코드 보존을 추가한 인터셉터다.

NestJS의 Interceptor는 Controller 메서드 실행 **전후**를 감싸는 미들웨어다:

```text
요청 → [Interceptor 전처리] → [Controller] → [Interceptor 후처리] → 응답
```

블로그 대비 주요 변경점:

| 영역 | 블로그 | 우리 프로젝트 |
|------|--------|--------------|
| 캐시 키 | `idempotencyKey` | `idempotency:${userId}:${idempotencyKey}` |
| 캐시 값 | `response` (본문만) | `{ statusCode, body }` (객체) |
| 선점 방식 | `get` → `set` (비원자적) | `ioredis` `SET NX` (원자적) |
| 에러 처리 | 없음 | `catchError`에서 마커 삭제 + Observable 반환 |
| 인증 검증 | 없음 | `userId` 누락 시 `401 Unauthorized` |

전체 코드는 [Step 5: Interceptor 생성](#step-5-interceptor-생성-핵심)을 참고한다.

### 7.4 Redis 캐시에 저장되는 데이터 구조

```typescript
// Redis에 저장되는 값의 타입
interface CachedResponse {
  statusCode: number;         // HTTP 상태코드 (201, 204 등)
  body: Record<string, unknown> | null;  // 응답 본문 (void면 null)
}
```

Redis 키 형식: `idempotency:{userId}:{uuid}`

예시:
```text
키:   "idempotency:1:550e8400-e29b-41d4-a716-446655440000"
값:   { "statusCode": 201, "body": { "id": 1 } }
TTL:  86400000ms (24시간)
```

---

## 8. 동시 요청 처리 (Race Condition)

### 8.1 문제: `get`/`set` 분리의 비원자성

Redis는 단일 스레드로 **개별 명령**을 순서대로 처리하지만, NestJS 서버에서 `GET` → `SET` 두 명령을 **분리하여** 실행하면 그 사이에 다른 요청이 끼어들 수 있다.

```text
시간 →
요청 A: GET(없음) ─────────────────── SET("PROCESSING") → Handler 실행
요청 B:           GET(없음) ────────── SET("PROCESSING") → Handler 실행  ← 중복!
                  ↑ 이 시점에 A의 SET이 아직 완료되지 않음
```

블로그에서 사용하는 `cache-manager`의 `get`/`set`은 별도의 Redis 명령이므로 원자적이지 않다. 블로그 원본의 댓글에서도 정확히 이 문제가 지적되었다. 이 프로젝트에서는 `ioredis`의 `SET NX`로 해결한다.

### 8.2 해결: Redis `SET NX` 원자적 선점

Redis의 `SET key value NX EX ttl` 명령은 **키가 없을 때만 설정**하는 것을 **하나의 원자적 연산**으로 보장한다. `NX` = "Not eXists".

```text
시간 →
요청 A: SET NX(성공, "PROCESSING") → Handler 실행 → SET(응답) → 반환
요청 B: SET NX(실패) → GET → 마커 발견 → 409 반환
```

`ioredis` 클라이언트를 직접 사용한다:

```typescript
// ioredis의 SET NX로 원자적 선점
const acquired = await this.redis.set(
  cacheKey,
  PROCESSING_MARKER,
  'EX', PROCESSING_TTL_SEC,
  'NX',                         // 키가 없을 때만 설정
);

if (!acquired) {
  // 이미 키가 존재 → 캐시 히트이거나 다른 요청이 처리 중
  const raw = await this.redis.get(cacheKey);
  if (raw === PROCESSING_MARKER) {
    throw new ConflictException(
      'A request with this Idempotency-Key is currently being processed',
    );
  }
  if (raw) {
    const existing = JSON.parse(raw) as CachedResponse;
    response.status(existing.statusCode);
    return of(existing.body);
  }
}
```

`ioredis` 인스턴스는 별도 DI 토큰(`REDIS_CLIENT`)으로 주입한다. 자세한 코드는 [Step 5](#step-5-interceptor-생성-핵심)를 참고한다.

---

## Part IV: 구현 상세

---

## 9. 파일 구조

### 9.1 신규 파일

```text
src/common/idempotency/
├── decorator/
│   └── idempotent.decorator.ts        # @Idempotent() 메서드 데코레이터
├── idempotency.interceptor.ts         # 핵심 Interceptor (Redis 캐시 사용)
└── idempotency.module.ts              # NestJS 모듈
```

PostgreSQL 방식과 비교하면 **Entity, Repository, Provider, Cleanup Service, Migration이 모두 불필요**하다. `ioredis`로 Redis에 직접 접근하며, Redis의 TTL이 만료 처리를 자동으로 수행한다.

### 9.2 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `package.json` | `ioredis` 의존성 추가 |
| `src/app.module.ts` | `IdempotencyModule` import 추가 |
| `src/posts/posts.controller.ts` | `createPost`에 `@Idempotent()` + `@ApiHeader` 추가 |
| `.env.example` | `REDIS_HOST`, `REDIS_PORT` 추가 |

---

## 10. Step-by-Step 구현

### Step 1: 의존성 설치

```bash
pnpm add ioredis
```

| 패키지 | 설치 버전 | 역할 |
|--------|-----------|------|
| `ioredis` | `^5.10.1` | Node.js Redis 클라이언트. `SET NX` 원자적 선점, `GET`, `DEL` 등 모든 Redis 통신에 직접 사용 |

> **블로그와의 차이:** 블로그는 `cache-manager` + `@nestjs/cache-manager` + `cache-manager-redis-store`를 사용하지만, 이 프로젝트에서는 `ioredis`만 사용한다. `cache-manager`의 `get`/`set`이 `SET NX` 원자적 선점을 지원하지 않고, `ioredis`와 키 직렬화 방식이 달라 데이터 불일치가 발생할 수 있기 때문이다.

### Step 2: 환경 변수 추가

**파일:** `.env.example`

```env
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

`.env.local`, `.env.development`, `.env.production`에도 동일하게 추가한다.

### Step 3: AppModule에 IdempotencyModule 등록

**파일:** `src/app.module.ts`

```typescript
import { IdempotencyModule } from '@src/common/idempotency/idempotency.module';

@Module({
  imports: [
    // ...기존 imports
    IdempotencyModule,    // ← 추가
  ],
})
export class AppModule {}
```

`IdempotencyModule`은 `@Global()`로 선언되어 있으므로, `AppModule`에 한 번만 import하면 모든 모듈에서 `@Idempotent()` 데코레이터를 사용할 수 있다. Redis 연결(`REDIS_CLIENT`)은 `IdempotencyModule` 내부에서 관리한다.

### Step 4: `@Idempotent()` 데코레이터 생성

**파일:** `src/common/idempotency/decorator/idempotent.decorator.ts`

```typescript
import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';
import { IdempotencyInterceptor } from '../idempotency.interceptor';

export const IDEMPOTENT_KEY = 'isIdempotent';

export function Idempotent(): MethodDecorator {
  return applyDecorators(
    SetMetadata(IDEMPOTENT_KEY, true),
    UseInterceptors(IdempotencyInterceptor),
  );
}
```

### Step 5: Interceptor 생성 (핵심)

**파일:** `src/common/idempotency/idempotency.interceptor.ts`

`ioredis`를 직접 사용하여 모든 Redis 통신을 통일한다. 블로그의 `cache-manager` 패턴 대신 `ioredis`의 `SET NX`로 원자적 선점을 구현하고, `GET`/`SET`/`DEL`도 모두 `ioredis`로 처리한다.

```typescript
import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { isUUID } from 'class-validator';
import type Redis from 'ioredis';                  // type import — emitDecoratorMetadata 호환
import { PinoLogger } from 'nestjs-pino';

interface CachedResponse {
  statusCode: number;
  body: Record<string, unknown> | null;
}

const PROCESSING_MARKER = '__PROCESSING__';
const IDEMPOTENCY_TTL_MS = 1000 * 60 * 60 * 24;  // 24시간 (밀리초, ioredis PX 옵션 기준)
const PROCESSING_TTL_SEC = 60;                     // ioredis SET NX의 EX 옵션은 초 단위

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(IdempotencyInterceptor.name);
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();
    const idempotencyKey = request.headers['idempotency-key'] as string;

    // 1. 헤더 검증
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    if (!isUUID(idempotencyKey, '4')) {
      throw new BadRequestException('Idempotency-Key must be a valid UUID');
    }

    const userId = (request as Request & { user?: { id?: number } }).user?.id;
    if (!userId) {
      throw new UnauthorizedException(
        'Idempotent endpoints require authentication',
      );
    }
    const cacheKey = `idempotency:${userId}:${idempotencyKey}`;

    // 2. 원자적 선점: SET NX (ioredis 직접 사용)
    const acquired = await this.redis.set(
      cacheKey,
      PROCESSING_MARKER,
      'EX', PROCESSING_TTL_SEC,
      'NX',                         // 키가 없을 때만 설정 — 원자적
    );

    if (!acquired) {
      // 이미 키가 존재 → 캐시 히트이거나 다른 요청이 처리 중
      const raw = await this.redis.get(cacheKey);
      if (raw === PROCESSING_MARKER) {
        throw new ConflictException(
          'A request with this Idempotency-Key is currently being processed',
        );
      }
      if (raw) {
        const existing = JSON.parse(raw) as CachedResponse;
        this.logger.info({ cacheKey }, 'Idempotency cache hit — returning cached response');
        response.status(existing.statusCode);
        return of(existing.body);
      }
    }

    // 3. Handler 실행 + 응답 저장 (ioredis로 통일)
    return next.handle().pipe(
      tap((responseBody: unknown) => {
        const cachedValue: CachedResponse = {
          statusCode: response.statusCode,
          body: (responseBody as Record<string, unknown>) ?? null,
        };
        void this.redis.set(
          cacheKey,
          JSON.stringify(cachedValue),
          'PX', IDEMPOTENCY_TTL_MS,
        );
        this.logger.info({ cacheKey, statusCode: response.statusCode }, 'Idempotency response cached');
      }),
      catchError((error: Error) => {
        return from(this.redis.del(cacheKey)).pipe(
          switchMap(() => throwError(() => error)),
        );
      }),
    );
  }
}
```

**블로그 코드와의 차이점 해설:**

| 영역 | 블로그 | 우리 프로젝트 | 이유 |
|------|--------|--------------|------|
| 캐시 키 | `idempotencyKey` | `idempotency:${userId}:${idempotencyKey}` | 사용자 A와 B가 같은 UUID를 쓸 경우 충돌 방지 |
| 캐시 값 | `response` (본문만) | `{ statusCode, body }` (객체) | 201, 204 등 원래 상태코드를 정확히 재현 |
| TTL | `60 * 5` (5분, 초) | `IDEMPOTENCY_TTL_MS = 86400000` (24시간, 밀리초) | Stripe 기본값과 동일. 상수명에 단위(`_MS`) 명시 |
| Redis 클라이언트 | `cache-manager` (추상화) | `ioredis` (직접 사용) | `SET NX` 원자적 선점 + 키 직렬화 일관성 |
| 선점 | `get` → `set` (비원자적) | `ioredis` `SET NX` (원자적) | `get`/`set` 사이 race condition 방지 |
| 인증 | 없음 | `userId` 누락 시 `401` | 캐시 키에 `undefined` 삽입 방지 |
| 에러 처리 | 없음 | `catchError` → `from()` + `throwError()` | RxJS에서 올바르게 Observable 반환 |

### Step 6: Module 생성

**파일:** `src/common/idempotency/idempotency.module.ts`

```typescript
import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { IdempotencyInterceptor } from './idempotency.interceptor';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () =>
        new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
        }),
    },
    IdempotencyInterceptor,
  ],
  exports: ['REDIS_CLIENT', IdempotencyInterceptor],
})
export class IdempotencyModule {}
```

- `@Global()` — 다른 모듈에서 별도 import 없이 `REDIS_CLIENT`와 `IdempotencyInterceptor`를 주입받을 수 있다. `@UseInterceptors()`는 Controller가 속한 모듈의 DI 컨텍스트에서 의존성을 해결하므로, 글로벌 등록이 필수다.
- `exports: ['REDIS_CLIENT', ...]` — `REDIS_CLIENT`를 export해야 `IdempotencyInterceptor`가 다른 모듈에서 인스턴스화될 때 주입받을 수 있다.
- `REDIS_CLIENT`는 `IdempotencyModule` 내부에서 `ioredis` 인스턴스로 생성되며, `@Global()`로 모든 모듈에서 접근 가능하다.

### Step 7: Controller에 적용

**파일:** `src/posts/posts.controller.ts`

```typescript
import { Idempotent } from '@src/common/idempotency/decorator/idempotent.decorator';
import { ApiHeader } from '@nestjs/swagger';

// createPost에 적용
@Post()
@Idempotent()
@ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID v4 형식의 멱등성 키' })
@ApiOperation({ summary: '게시글 생성' })
async createPost(...) { ... }
```

**PATCH 적용 판단 기준:**
PATCH는 같은 데이터로 같은 리소스를 수정하면 결과가 동일하므로, 단순 필드 업데이트라면 `@Idempotent()`가 불필요하다. 다만 PATCH 내부에 비멱등 부수 효과(예: 조회수 +1, 포인트 차감, 외부 결제 API 호출)가 있는 경우에는 적용해야 한다. 현재 `updatePost`는 단순 필드 업데이트이므로 **선택적 적용**이다.

> **주의:** `@Idempotent()`를 사용하는 Controller가 속한 Module에서 `IdempotencyModule`을 import하거나, `AppModule`에서 `IdempotencyModule`을 import해야 한다. 이 프로젝트에서는 `AppModule`에서 import하므로 별도 작업이 불필요하다.

**적용하지 않는 엔드포인트:**
- `GET /posts`, `GET /posts/:id` — 조회는 이미 멱등
- `DELETE /posts/:id` — soft delete는 이미 멱등 (같은 ID를 2번 삭제해도 결과 동일)

---

## Part V: 사용법

---

## 11. API 사용 예시

### 11.1 프론트엔드에서 사용하는 방법

```typescript
import { v4 as uuidv4 } from 'uuid';

// 게시글 생성 요청
const createPost = async (title: string, content: string) => {
  const idempotencyKey = uuidv4();  // 요청마다 새 UUID 생성

  const response = await fetch('/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Idempotency-Key': idempotencyKey,    // ← 핵심
    },
    body: JSON.stringify({ title, content }),
  });

  return response.json();
};
```

**주의사항:**
- 새로운 요청마다 **새 UUID**를 생성해야 한다
- **재시도** 시에는 **동일한 UUID**를 사용해야 한다
- UUID는 프론트엔드의 `crypto.randomUUID()` 또는 `uuid` 라이브러리로 생성

### 11.2 cURL로 테스트

```bash
# UUID 생성
KEY=$(uuidgen)

# 첫 번째 요청
curl -X POST http://localhost:3000/posts \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"테스트 게시글","content":"내용"}'
# → 201 Created { "id": 1 }

# 동일 키로 재요청 (재시도 시뮬레이션)
curl -X POST http://localhost:3000/posts \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"테스트 게시글","content":"내용"}'
# → 201 Created { "id": 1 }  ← 동일한 응답, 게시글은 1건만 생성됨
```

### 11.3 Swagger에서 테스트

Swagger UI(`/api`)에서 `@Idempotent()`가 적용된 엔드포인트에는 `Idempotency-Key` 헤더 입력란이 표시된다. UUID v4 형식의 값을 입력하면 된다.

---

## 12. 에러 케이스 정리

| 상황 | 응답 | 설명 |
|------|------|------|
| `Idempotency-Key` 헤더 누락 | `400 Bad Request` | "Idempotency-Key header is required" |
| 잘못된 UUID 형식 | `400 Bad Request` | "Idempotency-Key must be a valid UUID" |
| 인증 없이 멱등 엔드포인트 호출 | `401 Unauthorized` | "Idempotent endpoints require authentication" |
| 동일 키로 동시 요청 (`SET NX` 선점 실패) | `409 Conflict` | "A request with this Idempotency-Key is currently being processed" |
| 동일 키로 재요청 (캐시 히트) | 원본과 동일한 상태코드 + 본문 | Handler를 실행하지 않고 캐시된 응답 반환 |
| Handler에서 에러 발생 | 원본 에러 그대로 전달 | 에러 응답은 캐시하지 않음 → 동일 키로 재시도 가능 |
| TTL 만료 후 동일 키 | 새 요청으로 처리 | 24시간 경과 시 Redis가 자동 삭제하여 새로 실행 |
| Redis 연결 실패 | `500 Internal Server Error` | Redis가 다운되면 캐시 조회가 실패하며, 이 경우 요청이 통과하지 않음 |

---

## 13. 검증 방법

### 13.1 사전 준비: Redis 실행

```bash
# Docker로 Redis 실행
docker run -d --name redis -p 6379:6379 redis:7-alpine

# 또는 Homebrew (macOS)
brew install redis && brew services start redis

# 연결 확인
redis-cli ping
# → PONG
```

### 13.2 자동화 검증

```bash
# 1. 빌드 확인
pnpm build:local

# 2. 단위 테스트
pnpm test

# 3. 통합 테스트 (Docker 필수)
pnpm test:e2e
```

마이그레이션은 불필요하다 — Redis는 스키마 없이 키-값을 즉시 저장한다.

### 13.3 수동 검증 시나리오

| # | 시나리오 | 기대 결과 |
|---|----------|-----------|
| 1 | 새 UUID로 POST /posts | 201 Created, 게시글 1건 생성 |
| 2 | 동일 UUID로 POST /posts 재요청 | 201 Created, 동일 응답, 게시글 여전히 1건 |
| 3 | Idempotency-Key 헤더 없이 POST /posts | 400 Bad Request |
| 4 | 잘못된 형식의 키로 POST /posts | 400 Bad Request |
| 5 | GET /posts (Idempotent 미적용) | Idempotency-Key 헤더 무관하게 정상 동작 |
| 6 | PATCH /posts/:id (Idempotent 미적용) | Idempotency-Key 헤더 무관하게 정상 동작 |

### 13.4 Redis에서 캐시 확인

```bash
# Redis CLI로 저장된 캐시 확인
redis-cli
> KEYS idempotency:*
# → "idempotency:1:550e8400-e29b-41d4-a716-446655440000"

> GET "idempotency:1:550e8400-e29b-41d4-a716-446655440000"
# → {"statusCode":201,"body":{"id":1}}

> TTL "idempotency:1:550e8400-e29b-41d4-a716-446655440000"
# → 86350  (남은 초)
```
