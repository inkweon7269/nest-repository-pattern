/**
 * 슬로우 쿼리 알림의 핵심 부품 두 가지를 한 파일에 모아둔다.
 *
 * 1. `SlowQuerySpanProcessor` — OpenTelemetry가 만드는 모든 trace span 중에서
 *    PostgreSQL 쿼리 span만 골라, 실행 시간이 임계값(예: 5초)을 넘으면
 *    알림 정보(SlowQueryInfo)를 만들어 전달한다.
 * 2. `registerSlowQueryHandler` — 위 알림 정보를 실제로 받아 처리할 함수를
 *    등록하는 통로(슬랙 발송 같은 후속 처리는 NestJS 측 핸들러가 담당).
 *
 * --- 왜 이런 구조인가? ---
 *
 * OpenTelemetry SDK는 NestJS 앱이 시작되기 *전에* 동작을 시작해야
 * pg/HTTP/Redis 같은 라이브러리에 자동 후크를 걸 수 있다. 이 시점에는 아직
 * NestJS DI 컨테이너가 만들어지지 않아 SpanProcessor가 SlackService를
 * 바로 주입받을 수 없다. 그래서 부팅 흐름이 두 단계로 나뉜다.
 *
 *   [ 1단계 — NestJS 부팅 전 ]
 *   instrumentation.ts
 *     └─ new SlowQuerySpanProcessor(...) 등록
 *           이 시점부터 슬로우 쿼리 감지가 시작된다.
 *           아직 핸들러가 없으면 알림 정보를 buffer에 임시 보관한다.
 *
 *   [ 2단계 — NestJS 부팅 후 ]
 *   AppModule이 OtelAlertingModule을 import
 *     └─ SlowQueryAlertHandler.onModuleInit()
 *           └─ registerSlowQueryHandler(콜백) 호출
 *                 buffer에 쌓여 있던 알림을 즉시 꺼내서 처리하고,
 *                 이후 발생하는 모든 알림은 콜백으로 바로 전달된다.
 *
 * BUFFER_CAP은 핸들러 등록 이전에 비정상적으로 많은 슬로우 쿼리가 발생해도
 * 메모리가 무한정 늘어나지 않도록 100건으로 상한을 둔 것이다(초과분은 버린다).
 */

import { tracing, core } from '@opentelemetry/sdk-node';
import { getHttpContext } from './http-context-registry';

/**
 * 슬로우 쿼리 한 건을 알림으로 보낼 때 필요한 모든 정보를 담는 객체.
 * SpanProcessor가 OTEL trace span의 속성에서 값을 꺼내 채우고,
 * 이후 SlackService 같은 핸들러가 이 객체를 읽어 메시지를 만든다.
 */
export interface SlowQueryInfo {
  durationMs: number;
  dbSystem: string;
  dbName?: string;
  operation?: string;
  statement: string;
  traceId: string;
  spanId: string;
  serviceName: string;
  occurredAt: Date;
  /** HTTP 메서드(예: POST). 비-HTTP 컨텍스트(cron 등)에선 undefined. */
  httpMethod?: string;
  /** 파라미터화된 라우트 경로(예: `/v1/posts/:id`). 컨트롤러 매칭 전이거나 비-HTTP면 undefined. */
  httpRoute?: string;
  /** 인증된 사용자 ID. 비인증 endpoint거나 비-HTTP면 undefined. */
  userId?: number;
}

export type SlowQueryHandler = (info: SlowQueryInfo) => void;

const buffer: SlowQueryInfo[] = [];
const BUFFER_CAP = 100;
let registered: SlowQueryHandler | null = null;

/**
 * 슬로우 쿼리 알림을 처리할 함수를 한 개 등록한다.
 * NestJS 부팅이 끝난 시점(OnModuleInit)에서 호출하는 것을 전제로 한다.
 *
 * 등록 이전에 SpanProcessor가 buffer에 쌓아둔 알림이 있다면 곧바로 꺼내
 * 새 핸들러로 전달한다(즉, 핸들러가 없을 때 발생한 슬로우 쿼리도 누락되지 않는다).
 *
 * 같은 함수가 두 번 등록되면 마지막 호출된 것만 남고 이전 것은 무시된다.
 */
export function registerSlowQueryHandler(handler: SlowQueryHandler): void {
  registered = handler;
  while (buffer.length > 0) {
    const item = buffer.shift();
    if (item) handler(item);
  }
}

/**
 * 단위 테스트 사이에 모듈 상태를 깨끗이 비우는 헬퍼.
 * 이전 테스트가 등록한 핸들러나 아직 처리 안 된 알림이 다음 테스트로
 * 새어나가지 않도록 모두 초기화한다. 프로덕션 코드에서 호출하면 안 된다.
 */
export function resetSlowQueryHandlerForTest(): void {
  registered = null;
  buffer.length = 0;
}

/**
 * OpenTelemetry SDK가 노출하는 `SpanProcessor` 인터페이스를 구현해,
 * 매 span이 끝날 때마다 `onEnd` 후크가 호출된다. 우리는 PostgreSQL 쿼리 span 중
 * 실행 시간이 `thresholdMs` 이상인 것만 골라 `SlowQueryInfo`로 만들어 전달한다.
 *
 * SigNoz/Grafana Tempo 같은 외부 OTEL 백엔드를 연결하지 않아도 슬로우 쿼리
 * 알림이 동작하도록 만들어주는 핵심 컴포넌트다.
 */
export class SlowQuerySpanProcessor implements tracing.SpanProcessor {
  constructor(
    private readonly thresholdMs: number,
    private readonly serviceName: string,
  ) {}

  /**
   * 이 프로세서는 span '종료' 시점만 사용하므로 '시작' 후크는 빈 함수로 둔다.
   * SpanProcessor 인터페이스가 onStart 구현을 요구하기 때문에 형식만 맞춘 것.
   */
  onStart(): void {
    // 아무 동작도 하지 않음
  }

  /**
   * span 하나가 종료될 때마다 OTEL이 호출한다. 다음 순서로 빠르게 걸러낸다.
   *
   *   (1) PostgreSQL 쿼리가 아니면 무시 (예: Redis, 외부 HTTP 호출)
   *   (2) 실행 시간이 임계값보다 짧으면 무시
   *   (3) 둘 다 통과하면 SlowQueryInfo를 만들어
   *        - 등록된 핸들러가 있으면 그 함수에 전달하고
   *        - 핸들러가 아직 없으면 buffer에 임시 보관한다(BUFFER_CAP 초과 시 드랍)
   *
   * pg 자동 계측은 OTEL 표준 속성 이름이 버전에 따라 두 가지로 갈린다
   * (`db.system` 구버전, `db.system.name` 신버전). 양쪽 모두 확인해 호환한다.
   *
   * SQL 문장(db.statement)에는 파라미터 값이 포함되지 않아 비밀번호 같은
   * 민감 정보가 노출되지 않는다(`enhancedDatabaseReporting` 옵션을 켜지 않은 기본 동작).
   */
  onEnd(span: tracing.ReadableSpan): void {
    const attrs = span.attributes;
    const dbSystem = (attrs['db.system'] ?? attrs['db.system.name']) as
      | string
      | undefined;
    if (dbSystem !== 'postgresql') return;

    const durationMs = core.hrTimeToMilliseconds(span.duration);
    if (durationMs < this.thresholdMs) return;

    const traceId = span.spanContext().traceId;
    // 같은 traceId로 LoggingInterceptor가 push해둔 HTTP 컨텍스트를 합친다.
    // 비-HTTP 컨텍스트(cron, 마이그레이션)에선 entry가 없어 undefined이며,
    // SlowQueryInfo의 httpMethod/httpRoute/userId가 undefined로 유지된다.
    const httpCtx = getHttpContext(traceId);

    const info: SlowQueryInfo = {
      durationMs,
      dbSystem,
      dbName: (attrs['db.name'] ?? attrs['db.namespace']) as string | undefined,
      operation: (attrs['db.operation'] ?? attrs['db.operation.name']) as
        | string
        | undefined,
      statement:
        ((attrs['db.statement'] ?? attrs['db.query.text']) as
          | string
          | undefined) ?? '',
      traceId,
      spanId: span.spanContext().spanId,
      serviceName: this.serviceName,
      occurredAt: new Date(),
      httpMethod: httpCtx?.method,
      httpRoute: httpCtx?.route,
      userId: httpCtx?.userId,
    };

    if (registered) {
      registered(info);
    } else if (buffer.length < BUFFER_CAP) {
      buffer.push(info);
    }
  }

  /**
   * 이 프로세서는 자체 비동기 큐를 갖지 않아 강제로 비울 대상이 없다.
   * SpanProcessor 인터페이스 형식만 맞춘 빈 메서드.
   */
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * 이 프로세서는 외부 리소스(네트워크 소켓·파일 핸들 등)를 갖고 있지 않아
   * 종료 시 정리할 대상이 없다. SpanProcessor 인터페이스 형식만 맞춘 빈 메서드.
   */
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
