import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { SlowQuerySpanProcessor } from './otel/slow-query-span-processor';

const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 5000;

if (process.env.OTEL_ENABLED !== 'false') {
  const serviceName =
    process.env.OTEL_SERVICE_NAME || 'nest-repository-pattern';

  const slowQueryThresholdMs = Number(
    process.env.SLOW_QUERY_THRESHOLD_MS ?? DEFAULT_SLOW_QUERY_THRESHOLD_MS,
  );

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    spanProcessors: [
      // 기존 OTLP 익스포트 흐름 유지: 트레이스를 외부 백엔드(SigNoz, Tempo 등)로 일괄 전송
      new tracing.BatchSpanProcessor(
        new OTLPTraceExporter({
          url:
            process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
            'http://localhost:4318/v1/traces',
        }),
      ),
      // 외부 백엔드 없이도 슬로우 쿼리 알림이 동작하도록 인앱 후크 등록
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
