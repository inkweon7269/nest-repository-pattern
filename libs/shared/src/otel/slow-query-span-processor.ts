/**
 * OTEL SDK는 NestJS DI 컨테이너 부팅 전에 시작되므로 SpanProcessor는 SlackService를
 * 직접 주입받을 수 없다. 본 파일은 boot-time SpanProcessor와 NestJS 측 핸들러를
 * 잇는 모듈 레벨 callback registry + buffer를 제공한다.
 *
 * - 부팅 흐름: instrumentation.ts → NodeSDK 생성 시 SlowQuerySpanProcessor 등록
 * - 핸들러 등록 흐름: NestJS OnModuleInit 시점에 registerSlowQueryHandler() 호출
 * - 등록 이전에 발생한 슬로우 쿼리는 BUFFER_CAP 한도에서 임시 보관 후 등록 시점에 drain
 */

import { tracing, core } from '@opentelemetry/sdk-node';

/**
 * 슬로우 쿼리 1건에 대한 알림 페이로드. SpanProcessor가 OTEL span 속성에서
 * 발췌해 채우고, NestJS 핸들러(SlackService 등)가 메시지 포맷에 사용한다.
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
}

export type SlowQueryHandler = (info: SlowQueryInfo) => void;

const buffer: SlowQueryInfo[] = [];
const BUFFER_CAP = 100;
let registered: SlowQueryHandler | null = null;

/**
 * NestJS OnModuleInit 시점에 호출된다. 핸들러를 모듈 레벨에 등록하고,
 * 등록 전 SpanProcessor가 buffer에 쌓아둔 이벤트를 즉시 drain한다.
 *
 * 동일 핸들러는 마지막 호출이 우선한다(과거 핸들러는 자동 폐기).
 */
export function registerSlowQueryHandler(handler: SlowQueryHandler): void {
  registered = handler;
  while (buffer.length > 0) {
    const item = buffer.shift();
    if (item) handler(item);
  }
}

/**
 * 단위 테스트 전용 reset. 이전 테스트가 등록한 핸들러와 buffer 잔존 이벤트를 비워
 * 테스트 간 격리를 보장한다. 프로덕션 코드에서 호출하지 않는다.
 */
export function resetSlowQueryHandlerForTest(): void {
  registered = null;
  buffer.length = 0;
}

/**
 * OTEL SpanProcessor 구현. 모든 span 종료 시점(onEnd)에서 PostgreSQL DB span 중
 * thresholdMs 이상 걸린 것만 골라 SlowQueryInfo로 변환한 뒤 모듈 레벨 콜백
 * (또는 미등록 시 buffer)으로 전달한다.
 *
 * 외부 OTEL 백엔드(SigNoz, Tempo 등) 없이도 슬로우 쿼리 알림을 발사하기 위한 후크.
 */
export class SlowQuerySpanProcessor implements tracing.SpanProcessor {
  constructor(
    private readonly thresholdMs: number,
    private readonly serviceName: string,
  ) {}

  /**
   * 본 프로세서는 종료 시점만 사용하므로 시작 후크는 비워둔다(SpanProcessor 인터페이스 충족용).
   */
  onStart(): void {
    // no-op
  }

  /**
   * span 종료 시 호출된다. PostgreSQL이 아닌 span(예: Redis, HTTP outgoing)과
   * 임계값 미만 span을 빠르게 필터링한 뒤, 임계값 초과 시에만 SlowQueryInfo를
   * 구성해 등록 핸들러로 전달하거나 buffer에 적재한다.
   *
   * pg 자동 계측 attribute는 신구 semconv를 모두 다룬다(`db.system` 또는 `db.system.name`).
   * SQL 본문은 `enhancedDatabaseReporting` 기본값(false)에 따라 파라미터 값이 제외된 형태다.
   */
  onEnd(span: tracing.ReadableSpan): void {
    const attrs = span.attributes;
    const dbSystem = (attrs['db.system'] ?? attrs['db.system.name']) as
      | string
      | undefined;
    if (dbSystem !== 'postgresql') return;

    const durationMs = core.hrTimeToMilliseconds(span.duration);
    if (durationMs < this.thresholdMs) return;

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
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      serviceName: this.serviceName,
      occurredAt: new Date(),
    };

    if (registered) {
      registered(info);
    } else if (buffer.length < BUFFER_CAP) {
      buffer.push(info);
    }
  }

  /**
   * 본 프로세서는 자체 비동기 큐가 없으므로 flush 대상이 없다(SpanProcessor 인터페이스 충족용).
   */
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * 본 프로세서는 외부 리소스(소켓·파일 등)를 보유하지 않아 정리할 대상이 없다(SpanProcessor 인터페이스 충족용).
   */
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
