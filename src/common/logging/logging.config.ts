import { randomUUID } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';
import type { Options } from 'pino-http';
import { trace, context } from '@opentelemetry/api';

export function createPinoHttpOptions(
  env: Record<string, string | undefined>,
): Options {
  const nodeEnv = env.NODE_ENV || 'local';
  const isProduction = nodeEnv === 'production';
  const isTest = !!env.JEST_WORKER_ID;

  const level =
    env.LOG_LEVEL || (isTest ? 'silent' : isProduction ? 'info' : 'debug');

  return {
    level,

    customLogLevel: (
      _req: IncomingMessage,
      res: ServerResponse,
      err: Error | undefined,
    ) => {
      if (res.statusCode >= 500 || err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },

    genReqId: (req: IncomingMessage) => {
      const headerValue = req.headers['x-correlation-id'];
      const existing = Array.isArray(headerValue)
        ? headerValue[0]
        : headerValue;
      if (typeof existing === 'string' && /^[\w-]{1,128}$/.test(existing)) {
        return existing;
      }
      return randomUUID();
    },

    mixin: () => {
      const span = trace.getSpan(context.active());
      if (!span) return {};
      const { traceId, spanId } = span.spanContext();
      return { traceId, spanId };
    },

    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '[REDACTED]',
    },

    transport:
      !isProduction && !isTest
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,

    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: { statusCode: number }) => ({
        statusCode: res.statusCode,
      }),
    },
  };
}
