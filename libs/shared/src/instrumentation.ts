import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { SlowQuerySpanProcessor } from './otel/slow-query-span-processor';

const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 5000;

/**
 * 환경변수 `SLOW_QUERY_THRESHOLD_MS`를 안전하게 정수로 읽는다.
 * 값이 없거나(undefined) 숫자가 아닌 문자열(예: "abc")이면 5000ms로 폴백한다.
 *
 * 이 가드가 없으면 잘못된 값이 들어왔을 때 `Number("abc") === NaN`이 되고,
 * `durationMs < NaN`은 항상 false가 되어 *모든* 슬로우 쿼리가 알림으로 발사된다(폭주).
 */
function readSlowQueryThresholdMs(): number {
  const raw = process.env.SLOW_QUERY_THRESHOLD_MS;
  if (raw === undefined || raw === '') return DEFAULT_SLOW_QUERY_THRESHOLD_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0)
    return DEFAULT_SLOW_QUERY_THRESHOLD_MS;
  return parsed;
}

if (process.env.OTEL_ENABLED !== 'false') {
  const serviceName =
    process.env.OTEL_SERVICE_NAME || 'nest-repository-pattern';

  const slowQueryThresholdMs = readSlowQueryThresholdMs();

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    spanProcessors: [
      // 기존 동작 유지: 수집한 trace를 OTLP 형식으로 외부 OTEL 백엔드(SigNoz·Grafana Tempo 등)에 묶어서 전송
      new tracing.BatchSpanProcessor(
        new OTLPTraceExporter({
          url:
            process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
            'http://localhost:4318/v1/traces',
        }),
      ),
      // 외부 OTEL 백엔드를 연결하지 않아도 슬로우 쿼리가 발생하면 즉시 Slack 알림이 가도록 앱 내부에 후크 추가
      new SlowQuerySpanProcessor(slowQueryThresholdMs, serviceName),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  const shutdown = () => {
    void sdk.shutdown().finally(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
