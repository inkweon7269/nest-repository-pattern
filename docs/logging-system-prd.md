# 로그 시스템 PRD: 구조화 로깅 도입 및 CloudWatch 확장 기반 마련

## 0. 용어 해설

이 문서에서 사용하는 주요 용어를 정리한다. 로깅 시스템을 처음 접하는 개발자를 위한 참고 자료이다.

### 0.1 로깅 기본 개념

| 용어 | 설명 |
|------|------|
| **로그 (Log)** | 애플리케이션이 실행 중에 기록하는 메시지. "누가, 언제, 무엇을 했고, 결과가 어땠는지"를 남기는 기록이다. `console.log()`도 로그의 일종이지만, 운영 환경에서는 구조화된 로깅 시스템을 사용한다. |
| **로그 레벨 (Log Level)** | 로그의 중요도를 나타내는 등급. 레벨을 설정하면 해당 레벨 이상의 로그만 출력된다. 예를 들어 `info`로 설정하면 `debug` 로그는 무시된다. |
| | `fatal` > `error` > `warn` > `info` > `debug` > `trace` > `silent` |
| | - `debug`: 개발 시 상세 디버깅 정보 (변수 값, 분기 진입 등) |
| | - `info`: 정상 동작 확인용 (요청 처리 완료, 서버 기동 등) |
| | - `warn`: 문제는 아니지만 주의가 필요한 상황 (잘못된 요청, 인증 실패 등) |
| | - `error`: 처리하지 못한 오류 (DB 연결 실패, 예상치 못한 예외 등) |
| | - `silent`: 아무것도 출력하지 않음 (테스트 환경에서 사용) |
| **구조화 로깅 (Structured Logging)** | 로그를 사람이 읽는 텍스트가 아닌, 기계가 파싱할 수 있는 JSON 형식으로 출력하는 방식. 텍스트 로그는 `"POST /posts 완료 42ms"`처럼 나오지만, 구조화 로그는 `{"method":"POST","url":"/posts","durationMs":42}`처럼 나와서 필드별 검색/필터링이 가능하다. |
| **스택 트레이스 (Stack Trace)** | 에러가 발생했을 때 "어떤 함수가 어떤 함수를 호출하다가 에러가 났는지" 호출 경로를 보여주는 정보. 예: `Error: Connection refused → at PostRepository.findById → at GetPostByIdHandler.execute → ...` 에러의 원인을 추적하는 데 필수적이다. |

### 0.2 로깅 인프라 개념

| 용어 | 설명 |
|------|------|
| **stdout (Standard Output)** | 프로그램의 표준 출력 스트림. `console.log()`로 출력하면 stdout으로 나간다. 운영 환경에서는 애플리케이션이 stdout으로 로그를 출력하면, 외부 시스템(CloudWatch Agent, Docker 등)이 이를 수집한다. 파일에 직접 쓰는 것보다 유연하고 AWS가 권장하는 방식이다. |
| **NDJSON (Newline Delimited JSON)** | JSON 객체를 한 줄에 하나씩 출력하는 형식. pino의 기본 출력 방식이다. 각 줄이 독립적인 JSON이라 스트림 처리와 파싱이 쉽다. |
| | `{"level":30,"msg":"request received"}` ← 1줄 = 1개 로그 |
| | `{"level":30,"msg":"request completed"}` ← 다음 로그 |
| **Transport** | 로그를 "어디로 보낼 것인가"를 결정하는 출력 대상. stdout(콘솔), 파일, CloudWatch, Datadog 등이 될 수 있다. pino에서는 `transport` 설정으로 여러 대상에 동시에 보낼 수 있다. 플러그인처럼 추가/제거가 가능하다. |
| **직렬화 (Serialization)** | JavaScript 객체를 문자열(JSON)로 변환하는 과정. 로그를 찍을 때마다 발생한다. pino가 빠른 이유는 이 직렬화를 최소한으로 수행하고, 나머지를 별도 worker thread에 위임하기 때문이다. |
| **Redact (마스킹)** | 민감한 정보(비밀번호, 토큰 등)를 로그에 기록하지 않도록 `[REDACTED]`로 대체하는 기능. Authorization 헤더에 JWT 토큰이 포함되어 있는데, 이것이 로그에 그대로 노출되면 보안 사고가 될 수 있다. |
| **Serializer** | 로그에 기록할 객체의 "어떤 필드만 출력할지" 결정하는 변환 함수. 예를 들어 HTTP 요청 객체에는 수십 개의 헤더가 있지만, serializer로 `method`, `url`만 추출하면 로그가 깔끔해진다. |
| **pino-pretty** | pino의 JSON 출력을 사람이 읽기 쉬운 형식으로 변환하는 도구. 개발 환경에서만 사용하고, 운영 환경에서는 JSON 원본을 그대로 출력한다. |

### 0.3 요청 추적 개념

| 용어 | 설명 |
|------|------|
| **Correlation ID** | 하나의 HTTP 요청이 시스템 내부에서 여러 단계를 거칠 때 (Controller → Handler → Repository), 모든 단계의 로그에 동일한 ID를 부여하여 "이 로그들은 같은 요청에서 발생한 것"이라고 묶어주는 식별자. 예를 들어 `reqId: "abc-123"`이 붙은 로그만 필터링하면 하나의 요청이 처리되는 전체 과정을 추적할 수 있다. |
| **AsyncLocalStorage** | Node.js가 제공하는 API로, 비동기 함수 체인 전체에서 데이터를 공유할 수 있게 해준다. Java의 ThreadLocal과 유사한 개념이다. 요청이 들어올 때 Correlation ID를 저장하면, 그 요청이 호출하는 모든 async 함수에서 별도 전달 없이 자동으로 접근할 수 있다. nestjs-pino가 이것을 내부적으로 사용하여 모든 로그에 `reqId`를 자동 포함시킨다. |
| **X-Correlation-ID 헤더** | HTTP 요청 헤더 중 하나. API Gateway나 프록시 서버 같은 상위 시스템이 요청에 추적 ID를 미리 부여하여 전달할 때 사용한다. 이 헤더가 있으면 그 값을 사용하고, 없으면 서버가 새로 생성한다. |

### 0.4 NestJS 개념

| 용어 | 설명 |
|------|------|
| **Interceptor (인터셉터)** | NestJS에서 컨트롤러 메서드의 실행 "전후"를 감싸는 클래스. AOP(관점 지향 프로그래밍)의 구현이다. 메서드 실행 전에 시작 시간을 기록하고, 실행 후에 소요 시간을 로깅하는 식으로 사용한다. 비즈니스 로직을 수정하지 않고도 공통 기능(로깅, 캐싱, 변환 등)을 추가할 수 있다. |
| **ExceptionFilter (예외 필터)** | NestJS에서 예외가 발생했을 때 이를 가로채서 처리하는 클래스. 기본적으로 NestJS가 `HttpException`을 처리하지만, 커스텀 필터를 만들면 에러 로깅, 응답 형식 변경 등을 할 수 있다. `@Catch()` 데코레이터로 어떤 예외를 처리할지 지정한다. |
| **Middleware (미들웨어)** | HTTP 요청이 컨트롤러에 도달하기 전에 실행되는 함수. Express의 미들웨어와 동일한 개념이다. pino-http는 미들웨어로 동작하여 요청 수신/응답 전송을 자동 로깅한다. nestjs-pino를 사용하면 이 미들웨어가 자동 등록되므로 직접 작성할 필요가 없다. |
| **HttpAdapterHost** | NestJS가 내부적으로 사용하는 HTTP 서버(Express 또는 Fastify)에 대한 래퍼. 예외 필터에서 `HttpAdapterHost`를 사용하면 Express에 종속되지 않고 응답을 보낼 수 있다. |
| **bufferLogs** | `NestFactory.create(AppModule, { bufferLogs: true })` 옵션. NestJS가 부트스트랩되는 동안 (모듈 초기화, DI 구성 등) 발생하는 로그를 임시 버퍼에 쌓아두었다가, 커스텀 로거(pino)가 준비되면 한꺼번에 출력한다. 이 옵션 없이는 부트스트랩 초기 로그가 기본 ConsoleLogger로 출력된다. |
| **forRootAsync** | NestJS 모듈의 비동기 설정 메서드. `forRoot`은 설정 값을 즉시 평가하지만, `forRootAsync`는 팩토리 함수를 통해 런타임에 설정을 생성한다. 환경변수나 ConfigService처럼 앱이 초기화된 후에야 사용 가능한 값에 의존할 때 필수적이다. |
| **DI (Dependency Injection)** | 의존성 주입. 클래스가 필요한 객체를 직접 생성하지 않고, NestJS의 IoC 컨테이너가 생성하여 주입해주는 패턴. `app.get(HttpExceptionFilter)`처럼 컨테이너에서 인스턴스를 가져올 수 있다. |
| **Global 등록 (app.useGlobal*)** | `app.useGlobalFilters()`, `app.useGlobalInterceptors()` 등으로 등록하면 모든 라우트에 자동 적용된다. 각 컨트롤러마다 `@UseFilters()`, `@UseInterceptors()`를 붙일 필요가 없다. |

### 0.5 AWS / CloudWatch 개념

| 용어 | 설명 |
|------|------|
| **CloudWatch** | AWS의 모니터링 및 관찰 서비스. 로그 수집(CloudWatch Logs), 지표 모니터링(Metrics), 알림(Alarms) 등을 제공한다. 애플리케이션 로그를 CloudWatch Logs에 보내면 웹 콘솔에서 검색/분석할 수 있다. |
| **CloudWatch Log Insights** | CloudWatch Logs에 저장된 로그를 SQL과 유사한 문법으로 검색/분석하는 기능. JSON 형식의 로그를 자동으로 파싱하여 필드별 필터링이 가능하다. 예: `filter durationMs > 1000`으로 1초 넘는 요청만 조회. |
| **CloudWatch Agent** | EC2 인스턴스에 설치하여 로그 파일이나 stdout을 CloudWatch Logs로 전송하는 에이전트 프로그램. |
| **awslogs 드라이버** | Docker/ECS 컨테이너의 stdout을 자동으로 CloudWatch Logs로 전송하는 로그 드라이버. 컨테이너 설정에서 로그 드라이버를 `awslogs`로 지정하면 된다. |
| **Fluent Bit** | 경량 로그 수집기. Kubernetes(EKS) 환경에서 각 노드의 Pod 로그를 수집하여 CloudWatch 등으로 전송한다. |

### 0.6 테스트 관련 개념

| 용어 | 설명 |
|------|------|
| **JEST_WORKER_ID** | Jest가 테스트를 실행할 때 자동으로 설정하는 환경변수. 이 값이 존재하면 "현재 Jest 테스트 환경에서 실행 중"이라는 뜻이다. 로깅 설정에서 이를 감지하여 로그 레벨을 `silent`로 설정하면, 테스트 실행 시 로그가 출력되지 않아 테스트 결과가 깔끔해진다. |

### 0.7 RxJS 관련 개념

| 용어 | 설명 |
|------|------|
| **tap** | RxJS 연산자. Observable 스트림의 데이터를 변경하지 않고 "부수 효과(side effect)"만 수행한다. 인터셉터에서 `next.handle().pipe(tap(...))` 형태로 사용하여, 컨트롤러의 응답 값은 그대로 두고 로깅만 추가한다. `tap({ next: 성공콜백, error: 실패콜백 })` 형태로 성공/실패 각각에 대한 처리를 정의할 수 있다. |

---

## 1. 배경

### 1.1 현재 상태

프로젝트에 로깅 인프라가 **전혀 없다.** 유일한 로깅은 TypeORM의 SQL 쿼리 로깅(`logging: nodeEnv !== 'production'`)뿐이다.

**현재 문제점:**

| 문제 | 영향 |
|------|------|
| HTTP 요청/응답 로깅 없음 | 어떤 요청이 들어왔는지 추적 불가 |
| 에러 로깅 없음 | 500 에러 발생 시 스택 트레이스 확인 불가 |
| 요청 간 연관 추적 불가 | 하나의 요청이 만든 여러 로그를 묶어볼 수 없음 |
| 구조화된 로그 없음 | 운영 환경에서 로그 검색/필터링 불가 |
| 실행 시간 측정 없음 | 느린 요청 식별 불가 |

### 1.2 개선 동기

운영 가시성을 확보하고, 추후 AWS CloudWatch 연동을 위한 확장 기반을 마련한다. NestJS의 기존 CQRS + Repository 패턴 아키텍처에 자연스럽게 통합되는 인프라 레벨 로깅을 도입한다.

---

## 2. 로깅 라이브러리 선택: nestjs-pino

### 2.1 후보 비교

| 기준 | nestjs-pino (pino) | winston | NestJS 내장 Logger |
|------|-------------------|---------|-------------------|
| **NestJS 통합** | `LoggerModule.forRootAsync()` 제공 | 직접 어댑터 구현 필요 | 기본 내장 |
| **HTTP 요청 로깅** | pino-http 내장 (미들웨어 불필요) | 미들웨어 직접 작성 | 없음 |
| **Correlation ID** | `genReqId` + AsyncLocalStorage 자동 전파 | AsyncLocalStorage 직접 구현 | 없음 |
| **출력 포맷** | JSON 기본값 | 설정 필요 (`format.json()`) | 텍스트 (`[Nest] PID - LOG [Context] msg`) |
| **성능** | 최고 (비동기 직렬화, worker thread 위임) | 보통 (동기 직렬화, transport 체인 오버헤드) | 보통 |
| **CloudWatch 호환** | JSON stdout → 네이티브 파싱 | JSON 가능하나 기본값 아님 | 텍스트 → 구조화 쿼리 불가 |
| **Transport 확장** | `transport.targets` 배열로 플러그인 추가 | transport 체인으로 확장 | 확장 불가 |
| **민감 정보 마스킹** | `redact` 옵션 내장 | 직접 구현 | 없음 |

### 2.2 선택 근거: nestjs-pino

**1) 성능**

pino는 Node.js 로깅 라이브러리 중 가장 빠르다. 로그를 동기적으로 JSON 직렬화하는 대신, 최소한의 연산만 수행하고 나머지는 별도 worker thread나 stdout 파이프라인에 위임한다. 운영 환경에서 요청마다 여러 줄의 로그가 쌓이면 이 성능 차이가 누적된다.

**2) CloudWatch 호환성**

pino의 기본 출력은 JSON 한 줄(NDJSON)이다. CloudWatch Logs는 JSON 형식을 네이티브로 파싱하므로, 별도 변환 없이 Log Insights에서 필드 기반 쿼리가 바로 가능하다.

```json
{"level":30,"time":1709312400000,"reqId":"abc-123","controller":"PostsController","handler":"createPost","durationMs":42}
```

winston도 JSON 출력이 가능하지만 기본값이 아니라 `format.json()` 설정이 필요하다. NestJS 내장 Logger는 텍스트 포맷이라 CloudWatch에서 구조화 쿼리가 불가능하다.

**3) NestJS 통합 수준**

nestjs-pino는 `LoggerModule` import + `app.useLogger()` 호출만으로 HTTP 로깅, Correlation ID, NestJS 내부 로그 교체가 모두 완료된다. winston으로 같은 수준을 달성하려면 미들웨어, AsyncLocalStorage 설정, LoggerService 어댑터를 직접 작성해야 한다.

**4) Correlation ID 자동 전파**

이 프로젝트의 요청 흐름이 `Controller → CommandBus/QueryBus → Handler → Repository`로 깊기 때문에, 하나의 요청에 속한 로그를 묶어 추적하는 Correlation ID가 중요하다.

- nestjs-pino: pino-http가 AsyncLocalStorage로 reqId를 자동 전파한다. Handler나 Repository에서 `PinoLogger`를 주입받으면 별도 코드 없이 동일한 reqId가 로그에 포함된다.
- winston/내장 Logger: AsyncLocalStorage를 직접 셋업하고, 매 로그 호출마다 context를 수동으로 전달해야 한다.

**5) NestJS 내장 Logger를 쓰지 않는 이유**

NestJS의 `ConsoleLogger`는 개발 편의용이지 운영용이 아니다:
- 텍스트 기반 출력 → 파싱/검색 불가
- 로그 레벨 필터링이 제한적
- JSON 구조화, 헤더 마스킹, transport 확장 등 불가
- 요청별 컨텍스트(Correlation ID) 전파 메커니즘 없음

### 2.3 설치 패키지

```bash
pnpm add nestjs-pino pino-http
pnpm add -D pino-pretty
```

| 패키지 | 용도 | 환경 |
|--------|------|------|
| `nestjs-pino` | NestJS LoggerModule 통합, PinoLogger 서비스 제공 | runtime |
| `pino-http` | HTTP 요청/응답 자동 로깅, Correlation ID 생성 | runtime |
| `pino-pretty` | 로컬/개발 환경에서 사람이 읽기 쉬운 로그 출력 | devDependency |

---

## 3. 목표

### 3.1 범위

- 구조화된 JSON 로깅 시스템 도입
- HTTP 요청/응답 자동 로깅
- Correlation ID 기반 요청 추적
- 글로벌 예외 필터를 통한 에러 로깅
- 컨트롤러 실행 시간 측정 인터셉터
- 환경별 로그 레벨 및 포맷 자동 설정
- CloudWatch 연동을 위한 확장 기반 마련

### 3.2 범위 외 (향후 고려)

| 항목 | 이유 |
|------|------|
| CloudWatch 직접 SDK 전송 | JSON stdout 수집이 AWS 권장 방식. 직접 전송은 필요 시 transport 추가로 해결 |
| 감사 로그 (Audit Log) | 비즈니스 요구사항 확정 후 별도 설계 필요 |
| 분산 트레이싱 (OpenTelemetry) | 마이크로서비스 전환 시 도입 |
| 로그 기반 알림 (CloudWatch Alarm) | 인프라 레벨 설정. 애플리케이션 로깅 구현 후 별도 진행 |

### 3.3 변경 후 요청 흐름

```text
HTTP Request (X-Correlation-ID 헤더 선택적)
    ↓
pino-http 미들웨어 (reqId 생성/추출, 요청 로깅)
    ↓
LoggingInterceptor (컨트롤러 메서드 실행 시간 측정 시작)
    ↓
Controller → CommandBus/QueryBus → Handler → Repository → TypeORM → PostgreSQL
    ↓
LoggingInterceptor (실행 완료/실패 로깅 with durationMs)
    ↓
HttpExceptionFilter (예외 발생 시 구조화 에러 로깅)
    ↓
pino-http 미들웨어 (응답 로깅 with statusCode, responseTime)
```

모든 로그에 `reqId`(Correlation ID)가 자동 포함된다.

---

## 4. 기술 설계

### 4.1 디렉토리 구조

```text
src/common/logging/
├── logging.config.ts         # 환경별 pino-http 설정 팩토리
├── logging.module.ts         # 글로벌 LoggerModule 래퍼
├── http-exception.filter.ts  # 글로벌 예외 필터
└── logging.interceptor.ts    # 글로벌 실행 로깅 인터셉터
```

### 4.2 `logging.config.ts` — 환경별 설정 팩토리

`createPinoHttpOptions()` 함수가 `NODE_ENV`와 `LOG_LEVEL`을 읽어 pino-http 설정을 반환한다.

**로그 레벨 전략:**

| 환경 | 기본 레벨 | 포맷 | 이유 |
|------|-----------|------|------|
| local | `debug` | pino-pretty (색상, 멀티라인) | 개발 편의 |
| development | `debug` | pino-pretty | 개발 편의 |
| production | `info` | JSON (stdout) | CloudWatch 수집용 |
| test (Jest) | `silent` | 없음 | 테스트 출력 간섭 방지 |

`LOG_LEVEL` 환경변수로 어떤 환경에서든 로그 레벨을 명시적으로 오버라이드할 수 있다.

**Correlation ID 생성:**

```typescript
genReqId: (req: IncomingMessage) => {
  const existing = req.headers['x-correlation-id'];
  if (typeof existing === 'string' && existing.length > 0) {
    return existing;
  }
  return randomUUID();
}
```

- 상위 시스템(API Gateway, 프록시 등)이 `X-Correlation-ID` 헤더를 전달하면 그대로 사용
- 없으면 UUID를 생성하여 이 요청의 모든 로그에 부여

**민감 정보 마스킹:**

```typescript
redact: {
  paths: ['req.headers.authorization', 'req.headers.cookie'],
  censor: '[REDACTED]',
}
```

Authorization, Cookie 헤더가 로그에 노출되지 않도록 마스킹한다.

**응답 직렬화 최소화:**

```typescript
serializers: {
  req: (req) => ({ id: req.id, method: req.method, url: req.url }),
  res: (res) => ({ statusCode: res.statusCode }),
}
```

불필요한 헤더 전체 출력을 방지하고, 필수 정보만 기록한다.

### 4.3 `logging.module.ts` — 글로벌 모듈

```typescript
@Module({
  imports: [
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: createPinoHttpOptions(process.env),
      }),
    }),
  ],
  providers: [HttpExceptionFilter, LoggingInterceptor],
})
export class LoggingModule {}
```

- `forRootAsync` 사용 (CLAUDE.md 규칙 준수)
- nestjs-pino의 `LoggerModule`은 글로벌 모듈로 동작 — 다른 모듈에서 별도 import 불필요
- `HttpExceptionFilter`와 `LoggingInterceptor`를 providers로 등록하여 `main.ts`에서 `app.get()`으로 DI 해결

### 4.4 `http-exception.filter.ts` — 글로벌 예외 필터

`@Catch()` 데코레이터로 모든 예외를 캐치하며, `PinoLogger`를 주입받아 구조화 로깅을 수행한다.

**로깅 레벨 전략:**

| 상태 코드 | 로그 레벨 | 포함 정보 | 이유 |
|-----------|-----------|-----------|------|
| 5xx | `error` | statusCode, message, 스택 트레이스 (`err` 객체) | 서버 에러는 즉시 조사 필요 |
| 4xx | `warn` | statusCode, message | 클라이언트 에러는 참고용 |

- `HttpAdapterHost` 사용으로 Express/Fastify 플랫폼 독립적
- `PinoLogger`가 AsyncLocalStorage에서 reqId를 자동 상속 — Correlation ID 포함

### 4.5 `logging.interceptor.ts` — 글로벌 실행 로깅 인터셉터

컨트롤러 메서드의 실행을 감싸서 진입/완료/실패를 로깅한다.

**기록 필드:**

| 필드 | 설명 | 예시 |
|------|------|------|
| `controller` | 컨트롤러 클래스명 | `PostsController` |
| `handler` | 메서드명 | `createPost` |
| `durationMs` | 실행 시간 (ms) | `42` |

**CQRS 연동 방식:**

이 프로젝트에서 각 컨트롤러 메서드는 Command/Query에 1:1 대응한다:

| Controller Method | CQRS Dispatch |
|---|---|
| `PostsController.createPost` | `CreatePostCommand` |
| `PostsController.updatePost` | `UpdatePostCommand` |
| `PostsController.deletePost` | `DeletePostCommand` |
| `PostsController.getPostById` | `GetPostByIdQuery` |
| `PostsController.findAllPaginated` | `FindAllPostsPaginatedQuery` |

따라서 인터셉터가 `controller.method`를 기록하면 어떤 Command/Query가 실행되었는지 자동으로 추적된다. CommandBus/QueryBus를 오버라이드하는 것보다 단순하고 NestJS-idiomatic하다.

### 4.6 `main.ts` 수정

```typescript
// 변경 전
const app = await NestFactory.create(AppModule);

// 변경 후
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
app.useGlobalFilters(app.get(HttpExceptionFilter));
app.useGlobalInterceptors(app.get(LoggingInterceptor));
```

- `bufferLogs: true` — NestJS 부트스트랩 중 발생하는 로그를 버퍼링했다가 pino가 준비되면 일괄 출력
- `app.useLogger()` — NestJS 내부 로거(모듈 초기화, 라우트 매핑 등)를 pino로 교체
- 글로벌 필터/인터셉터를 `app.get()`으로 등록 — DI 컨테이너에서 해결된 인스턴스 사용

### 4.7 `app.module.ts` 수정

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: `.env.${nodeEnv}` }),
    LoggingModule,  // ConfigModule 다음에 위치
    TypeOrmModule.forRootAsync({ ... }),
    PostsModule,
    AuthModule,
  ],
})
export class AppModule {}
```

`LoggingModule`은 `ConfigModule` 이후에 import하여 환경변수가 이미 로드된 상태에서 설정을 읽는다.

---

## 5. Correlation ID 흐름

```text
Client (X-Correlation-ID: abc-123)
  → pino-http 미들웨어 (genReqId: 헤더에서 읽거나 UUID 생성)
    → LoggingInterceptor (PinoLogger가 reqId 자동 상속)
      → Controller → CommandBus/QueryBus → Handler → Repository
    → HttpExceptionFilter (PinoLogger가 reqId 자동 상속)
  → pino-http (응답 자동 로깅 with reqId)
```

nestjs-pino의 AsyncLocalStorage 통합으로, 요청 컨텍스트 내에서 `PinoLogger`를 사용하는 모든 곳에 `reqId`가 자동 포함된다. Handler나 Repository 코드 수정이 필요 없다.

---

## 6. 로그 출력 예시

### 6.1 Production (JSON)

```json
{"level":30,"time":1709312400000,"reqId":"abc-123","req":{"method":"POST","url":"/posts"},"msg":"request received"}
{"level":30,"time":1709312400042,"reqId":"abc-123","controller":"PostsController","handler":"createPost","durationMs":42,"msg":"PostsController.createPost completed in 42ms"}
{"level":30,"time":1709312400042,"reqId":"abc-123","req":{"method":"POST","url":"/posts"},"res":{"statusCode":201},"responseTime":42,"msg":"request completed"}
```

### 6.2 Local/Development (pino-pretty)

```
[14:00:00.000] INFO: request received
    reqId: "abc-123"
    req: {"method":"POST","url":"/posts"}
[14:00:00.042] INFO (PostsController.createPost): PostsController.createPost completed in 42ms
    reqId: "abc-123"
    controller: "PostsController"
    handler: "createPost"
    durationMs: 42
[14:00:00.042] INFO: request completed
    reqId: "abc-123"
    res: {"statusCode":201}
    responseTime: 42
```

### 6.3 에러 발생 시 (5xx)

```json
{"level":50,"time":1709312400000,"reqId":"abc-123","err":{"type":"Error","message":"Connection refused","stack":"Error: Connection refused\n    at ..."},"statusCode":500,"msg":"Unhandled exception: Connection refused"}
```

### 6.4 클라이언트 에러 시 (4xx)

```json
{"level":40,"time":1709312400000,"reqId":"abc-123","statusCode":404,"message":"Post not found","msg":"Client error: Post not found"}
```

---

## 7. CloudWatch 연동 전략

### 7.1 Phase 1 — JSON stdout 수집 (이번 구현)

pino가 JSON을 stdout으로 출력하면, AWS 인프라 레벨에서 수집한다.

| 배포 환경 | 수집 방식 |
|-----------|-----------|
| EC2 | CloudWatch Agent가 stdout/log 파일 수집 |
| ECS (Fargate/EC2) | awslogs 로그 드라이버가 컨테이너 stdout 자동 수집 |
| EKS | Fluent Bit DaemonSet이 Pod stdout 수집 |
| Lambda | 자동 수집 (stdout → CloudWatch Logs) |

이것이 **AWS 권장 방식**이며, 애플리케이션에 AWS SDK 의존성이 불필요하다. CloudWatch Log Insights에서 JSON 필드 기반 쿼리가 바로 가능하다:

```sql
-- CloudWatch Log Insights 쿼리 예시
fields @timestamp, reqId, controller, handler, durationMs
| filter controller = "PostsController"
| filter durationMs > 1000
| sort @timestamp desc
| limit 20
```

### 7.2 Phase 2 — 직접 SDK Transport (필요 시)

stdout 수집이 어려운 환경이거나, 실시간 전송이 필요한 경우 pino transport를 추가한다.

**변경 지점: `logging.config.ts`의 `transport` 설정만 수정**

```typescript
// 현재 (Phase 1)
transport: isProduction ? undefined : { target: 'pino-pretty', ... }

// 향후 (Phase 2) — transport.targets 배열에 CloudWatch transport 추가
transport: isProduction
  ? {
      targets: [
        { target: 'pino/file', options: { destination: 1 } },  // stdout 유지
        {
          target: 'pino-cloudwatch-transport',
          options: {
            logGroupName: env.CLOUDWATCH_LOG_GROUP,
            logStreamName: env.CLOUDWATCH_LOG_STREAM,
            region: env.AWS_REGION,
          },
        },
      ],
    }
  : { target: 'pino-pretty', ... }
```

다른 파일은 변경 불필요. `logging.config.ts`가 transport 설정의 단일 진입점이다.

**Phase 2에서 추가될 환경변수:**

| 변수 | 설명 |
|------|------|
| `CLOUDWATCH_LOG_GROUP` | CloudWatch 로그 그룹명 |
| `CLOUDWATCH_LOG_STREAM` | CloudWatch 로그 스트림명 |
| `AWS_REGION` | AWS 리전 |

---

## 8. 환경변수

### 8.1 이번 구현에서 추가

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `LOG_LEVEL` | 환경별 자동 (`debug`/`info`/`silent`) | 로그 레벨 명시적 오버라이드 |

### 8.2 기존 환경변수 (변경 없음)

| 변수 | 로깅에서의 역할 |
|------|----------------|
| `NODE_ENV` | 로그 포맷(pretty vs JSON) 및 기본 레벨 결정 |

---

## 9. 자동 로깅 범위 요약

| 레이어 | 로깅 내용 | 담당 | Correlation ID |
|--------|-----------|------|----------------|
| HTTP 요청 수신 | method, url | pino-http (자동) | O |
| HTTP 응답 전송 | statusCode, responseTime | pino-http (자동) | O |
| 컨트롤러 실행 | controller, handler, durationMs | LoggingInterceptor | O |
| 4xx 클라이언트 에러 | statusCode, message | HttpExceptionFilter (warn) | O |
| 5xx 서버 에러 | statusCode, message, stack trace | HttpExceptionFilter (error) | O |
| NestJS 부트스트랩 | 모듈 초기화, 포트 | NestJS Logger → pino | - |
| TypeORM SQL 쿼리 | SQL 문 | TypeORM 자체 로깅 (기존 설정 유지) | X |

---

## 10. 테스트 영향

### 10.1 단위 테스트 (`src/**/*.spec.ts`)

**변경 없음.** Handler 단위 테스트는 모킹된 Repository만 사용하며 `LoggingModule`과 무관하다.

### 10.2 통합 테스트 (`test/**/*.integration-spec.ts`)

`createIntegrationApp()`이 `AppModule`을 import하므로 `LoggingModule`이 자동으로 포함된다.

- `JEST_WORKER_ID` 감지로 로그 레벨 `silent` 자동 적용 → 테스트 출력 간섭 없음
- `integration-helper.ts`에 글로벌 필터/인터셉터 등록 추가 → `main.ts`와 동일한 동작 보장

---

## 11. 변경 전후 아키텍처 비교

### Before

```text
HTTP Request
    ↓
Controller (라우팅)
    ↓
CommandBus / QueryBus
    ↓
Handler (검증 + 로직)
    ↓
Repository → TypeORM → PostgreSQL

※ 로깅 없음. 에러 추적 불가. 요청 흐름 추적 불가.
```

### After

```text
HTTP Request
    ↓
pino-http (요청 로깅 + Correlation ID 부여)  ← 자동
    ↓
LoggingInterceptor (실행 시간 측정 시작)      ← 자동
    ↓
Controller (라우팅)
    ↓
CommandBus / QueryBus
    ↓
Handler (검증 + 로직)
    ↓
Repository → TypeORM → PostgreSQL
    ↓
LoggingInterceptor (실행 완료/실패 로깅)      ← 자동
    ↓
HttpExceptionFilter (예외 시 에러 로깅)       ← 자동
    ↓
pino-http (응답 로깅)                        ← 자동

※ 모든 로그에 reqId 포함. Handler/Repository 코드 수정 없음.
```
