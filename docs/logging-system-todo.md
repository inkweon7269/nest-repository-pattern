# 로그 시스템 구현 체크리스트

> 구조화 로깅 도입 및 CloudWatch 확장 기반 마련 작업의 단계별 체크리스트.
> 각 단계는 의존성 순서로 정렬되어 있으며, 순서대로 진행해야 한다.
>
> 용어가 낯설다면 [logging-system-prd.md](./logging-system-prd.md)의 **0. 용어 해설** 섹션을 먼저 읽어보자.

---

## 용어 빠른 참조

체크리스트에서 자주 등장하는 용어만 간추린 요약이다. 자세한 설명은 PRD 문서의 용어 해설을 참고한다.

| 용어 | 한줄 요약 |
|------|-----------|
| **구조화 로깅** | 로그를 JSON 형식으로 출력하여 기계가 파싱/검색할 수 있게 하는 방식 |
| **Correlation ID (reqId)** | 하나의 요청에서 발생한 모든 로그를 묶어주는 고유 식별자 |
| **Transport** | 로그를 보낼 출력 대상 (stdout, 파일, CloudWatch 등). 플러그인처럼 추가/제거 가능 |
| **Redact (마스킹)** | Authorization 같은 민감 헤더를 `[REDACTED]`로 대체하여 로그 노출 방지 |
| **Serializer** | 로그에 기록할 객체에서 필요한 필드만 추출하는 변환 함수 |
| **ExceptionFilter** | NestJS에서 예외를 가로채 에러 로깅 + 응답 형식 처리를 하는 클래스 |
| **Interceptor** | 컨트롤러 메서드 실행 전후를 감싸서 로깅/측정 등 공통 기능을 추가하는 클래스 |
| **bufferLogs** | 앱 부트스트랩 중 로그를 버퍼에 쌓아두었다가 pino 준비 후 일괄 출력하는 옵션 |
| **forRootAsync** | 환경변수 등 런타임 값에 의존하는 모듈 설정을 위한 NestJS 비동기 설정 메서드 |
| **pino-pretty** | pino의 JSON 출력을 개발 환경에서 읽기 쉽게 변환하는 도구 (운영 환경에서는 미사용) |
| **JEST_WORKER_ID** | Jest 실행 시 자동 설정되는 환경변수. 이를 감지하여 테스트 중 로그를 `silent`로 설정 |
| **tap (RxJS)** | 스트림 데이터를 변경하지 않고 부수 효과(로깅 등)만 수행하는 연산자 |
| **stdout** | 표준 출력. 운영 환경에서 로그를 stdout으로 출력하면 AWS 인프라가 자동 수집 |

---

## Phase 1: 환경 준비

- [ ] 패키지 설치
  ```bash
  pnpm add nestjs-pino pino-http
  pnpm add -D pino-pretty
  ```

---

## Phase 2: 로깅 설정 팩토리 생성

> **이 단계에서 하는 일:** pino-http의 동작 방식을 환경(local/dev/production/test)에 따라 다르게 설정하는 팩토리 함수를 만든다. "로그를 얼마나 상세히, 어떤 형식으로, 어디로 출력할지"를 결정하는 중앙 설정 파일이다.

- [ ] `src/common/logging/logging.config.ts` 생성
  - 환경별 **로그 레벨** 설정 (로그 레벨 = 이 레벨 이상의 로그만 출력):
    - local/dev → `debug` (가장 상세)
    - production → `info` (정상 동작 + 에러만)
    - test (JEST_WORKER_ID 감지) → `silent` (아무것도 출력하지 않음)
  - `LOG_LEVEL` 환경변수로 오버라이드 지원
  - `genReqId` — **Correlation ID 생성 함수**: `X-Correlation-ID` 헤더가 있으면 그 값을 사용, 없으면 `randomUUID()`로 새로 생성. 이 ID가 요청의 모든 로그에 `reqId`로 포함된다.
  - `redact` — **민감 정보 마스킹**: `req.headers.authorization`(JWT 토큰), `req.headers.cookie`를 `[REDACTED]`로 대체하여 로그에 노출 방지
  - `serializers` — **출력 필드 제한**: HTTP 요청/응답 객체에서 필요한 필드(method, url, statusCode)만 추출. 불필요한 헤더 전체가 로그에 출력되는 것을 방지
  - `transport` — **로그 출력 대상 설정**: local/dev → `pino-pretty`(사람이 읽기 쉬운 형식), production → undefined(JSON 원본을 stdout으로 출력하여 CloudWatch가 수집)

---

## Phase 3: 글로벌 예외 필터 생성

> **이 단계에서 하는 일:** 애플리케이션에서 예외가 발생했을 때 이를 가로채서 구조화된 에러 로그를 남기는 **ExceptionFilter**를 만든다. NestJS 기본 예외 처리는 콘솔에 텍스트만 출력하지만, 이 필터는 JSON 형식으로 상태 코드, 에러 메시지, 스택 트레이스를 기록하고 Correlation ID도 포함한다.

- [ ] `src/common/logging/http-exception.filter.ts` 생성
  - `@Catch()` 데코레이터로 모든 예외 캐치 (인자 없이 사용하면 모든 종류의 예외를 잡는다)
  - `PinoLogger` 주입 — nestjs-pino가 제공하는 로거. AsyncLocalStorage를 통해 현재 요청의 Correlation ID를 자동으로 로그에 포함
  - `HttpAdapterHost` 주입 — Express에 직접 의존하지 않고 응답을 보내기 위한 NestJS 추상화 레이어
  - 5xx → `logger.error({ err, statusCode }, msg)` — `err` 객체를 전달하면 pino가 자동으로 스택 트레이스를 JSON에 포함
  - 4xx → `logger.warn({ statusCode, message }, msg)` — 클라이언트 실수이므로 warn 레벨로 기록
  - `HttpException`이면 `getResponse()` 반환 (NestJS가 만든 에러 응답 그대로), 아니면 `{ statusCode: 500, message: 'Internal server error' }` 반환

---

## Phase 4: 글로벌 로깅 인터셉터 생성

> **이 단계에서 하는 일:** 모든 컨트롤러 메서드의 실행을 감싸서 "어떤 컨트롤러의 어떤 메서드가 몇 ms 걸렸는지"를 자동으로 로깅하는 **Interceptor**를 만든다. 각 컨트롤러 메서드가 CQRS의 Command/Query와 1:1 대응하므로, 이 인터셉터만으로 어떤 Command/Query가 실행되었는지도 추적할 수 있다.

- [ ] `src/common/logging/logging.interceptor.ts` 생성
  - `PinoLogger` 주입
  - `context.getClass().name` → `controller` 필드 (예: `"PostsController"`)
  - `context.getHandler().name` → `handler` 필드 (예: `"createPost"`)
  - `Date.now()` 기반 실행 시간 측정 — 메서드 실행 전 시작 시간 기록, 완료 후 차이 계산
  - RxJS `tap` 연산자 사용 — 응답 데이터를 변경하지 않고 로깅만 수행:
    - `tap({ next })` → 성공 시 `info` 레벨로 완료 로깅 (controller, handler, durationMs)
    - `tap({ error })` → 실패 시 `error` 레벨로 실패 로깅 (controller, handler, durationMs, err)

---

## Phase 5: 로깅 모듈 생성

> **이 단계에서 하는 일:** Phase 2~4에서 만든 설정, 필터, 인터셉터를 NestJS 모듈로 묶는다. 이 모듈을 `AppModule`에 import하면 로깅 시스템 전체가 활성화된다.

- [ ] `src/common/logging/logging.module.ts` 생성
  - `LoggerModule.forRootAsync()` import — `forRootAsync`를 사용하여 `createPinoHttpOptions(process.env)` 팩토리 함수로 런타임에 설정 생성. nestjs-pino의 `LoggerModule`은 글로벌 모듈이므로 다른 모듈에서 별도 import 불필요
  - `providers`에 `HttpExceptionFilter`, `LoggingInterceptor` 등록 — `main.ts`에서 `app.get()`으로 DI 컨테이너에서 인스턴스를 꺼내 글로벌 등록하려면 providers에 미리 등록되어 있어야 한다

---

## Phase 6: 기존 파일 수정

> **이 단계에서 하는 일:** 새로 만든 로깅 모듈을 기존 앱에 연결한다. 모듈 등록, 로거 교체, 글로벌 필터/인터셉터 등록을 수행한다.

### 6.1 AppModule 수정

- [ ] `src/app.module.ts` 수정
  - `LoggingModule` import 추가 — `ConfigModule` 다음에 위치시켜야 환경변수가 이미 로드된 상태에서 로깅 설정을 읽을 수 있다

### 6.2 main.ts 수정

- [ ] `src/main.ts` 수정
  - `NestFactory.create(AppModule, { bufferLogs: true })` — `bufferLogs`는 NestJS 초기화 중 로그를 버퍼에 모았다가 pino가 준비되면 출력하는 옵션
  - `app.useLogger(app.get(Logger))` — NestJS 내부에서 사용하는 기본 ConsoleLogger를 pino 로거로 교체. 이후 NestJS가 출력하는 모든 로그(모듈 초기화, 라우트 매핑 등)가 pino를 통해 JSON으로 출력
  - `app.useGlobalFilters(app.get(HttpExceptionFilter))` — 모든 라우트에 예외 필터 적용. `app.get()`은 DI 컨테이너에서 인스턴스를 가져오는 메서드
  - `app.useGlobalInterceptors(app.get(LoggingInterceptor))` — 모든 라우트에 로깅 인터셉터 적용
  - import 추가: `Logger` from `nestjs-pino`, `HttpExceptionFilter`, `LoggingInterceptor`

### 6.3 환경변수 템플릿 수정

- [ ] `.env.example` 수정
  - `LOG_LEVEL=debug` 추가 — 이 값을 설정하면 환경별 기본 레벨을 무시하고 지정한 레벨로 오버라이드

---

## Phase 7: 통합 테스트 인프라 수정

> **이 단계에서 하는 일:** 통합 테스트에서도 `main.ts`와 동일한 글로벌 설정(로거, 필터, 인터셉터)을 적용하여 운영 환경과 동일한 동작을 보장한다. `JEST_WORKER_ID` 감지로 로그 레벨이 자동으로 `silent`가 되므로 테스트 출력에 로그가 섞이지 않는다.

- [ ] `test/setup/integration-helper.ts` 수정
  - `app.useLogger(app.get(Logger))` 추가 (JEST_WORKER_ID 감지로 silent 레벨 자동 적용)
  - `app.useGlobalFilters(app.get(HttpExceptionFilter))` 추가
  - `app.useGlobalInterceptors(app.get(LoggingInterceptor))` 추가
  - import 추가: `Logger` from `nestjs-pino`, `HttpExceptionFilter`, `LoggingInterceptor`

---

## Phase 8: 검증

### 8.1 포맷 및 린트

- [ ] `pnpm format` 실행 — 포맷 자동 수정
- [ ] `pnpm lint:check` 실행 — 린트 검사 통과 확인

### 8.2 빌드

- [ ] `pnpm build:local` 실행 — 빌드 성공 확인

### 8.3 단위 테스트

- [ ] `pnpm test` 실행 — 모든 단위 테스트 통과 확인
  - 기존 Handler 단위 테스트 (변경 없어야 함)
  - 기존 DTO 단위 테스트 (변경 없어야 함)

### 8.4 통합 테스트

- [ ] `pnpm test:e2e` 실행 — 통합 테스트 통과 확인 (Docker 필요)
  - `test/posts.integration-spec.ts`
  - `test/auth.integration-spec.ts`

### 8.5 수동 검증 (선택)

- [ ] `pnpm start:local` — 로컬 서버 기동
- [ ] 로그 출력 확인:
  - [ ] 서버 기동 시 NestJS 부트스트랩 로그가 pino-pretty 포맷으로 출력되는지 확인
  - [ ] `POST /posts` 요청 시 요청/응답 로그 + 인터셉터 로그 출력 확인
  - [ ] `GET /posts/999` (없는 ID) 요청 시 4xx warn 로그 출력 확인
  - [ ] 로그에 `reqId` 필드가 포함되는지 확인
  - [ ] `X-Correlation-ID` 헤더를 보내면 해당 값이 `reqId`로 사용되는지 확인
  - [ ] `Authorization` 헤더가 `[REDACTED]`로 마스킹되는지 확인

---

## 파일 변경 요약

### 신규 생성 (4개)

| 파일 | 유형 |
|------|------|
| `src/common/logging/logging.config.ts` | 설정 팩토리 |
| `src/common/logging/logging.module.ts` | NestJS 모듈 |
| `src/common/logging/http-exception.filter.ts` | 글로벌 예외 필터 |
| `src/common/logging/logging.interceptor.ts` | 글로벌 인터셉터 |

### 수정 (4개)

| 파일 | 변경 내용 |
|------|-----------|
| `src/app.module.ts` | `LoggingModule` import 추가 |
| `src/main.ts` | 로거 교체, 글로벌 필터/인터셉터 등록 |
| `.env.example` | `LOG_LEVEL` 추가 |
| `test/setup/integration-helper.ts` | 글로벌 필터/인터셉터 등록 추가 |

### 변경 없음

| 파일 | 이유 |
|------|------|
| `src/posts/**` (Controller, Handler, Repository) | 인프라 레벨 로깅 — 비즈니스 코드 수정 불필요 |
| `src/auth/**` | 동일 |
| `src/common/base.repository.ts` | 동일 |
| `src/**/*.spec.ts` | Handler 단위 테스트는 LoggingModule과 무관 |
