import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

export type CorsOriginEnvKey =
  | 'SERVICE_CORS_ORIGINS'
  | 'BACK_OFFICE_CORS_ORIGINS';

export interface SecurityOptions {
  corsOriginEnvKey: CorsOriginEnvKey;
}

export function applySecurityMiddleware(
  app: INestApplication,
  options: SecurityOptions,
): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: [`'self'`],
          styleSrc: [`'self'`, `'unsafe-inline'`],
          imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
          scriptSrc: [`'self'`, `'unsafe-inline'`],
        },
      },
    }),
  );

  const nodeEnv = process.env.NODE_ENV ?? 'local';
  const raw = process.env[options.corsOriginEnvKey];
  const allowedOrigins = raw
    ? raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const isDev = nodeEnv === 'local' || nodeEnv === 'development';

  // production에서 whitelist 누락 시 CORS 미활성화 (fail-safe)
  if (allowedOrigins.length === 0 && !isDev) return;

  app.enableCors({
    origin:
      allowedOrigins.length === 0
        ? true
        : (
            origin: string | undefined,
            cb: (err: Error | null, allow?: boolean) => void,
          ) => {
            if (!origin || allowedOrigins.includes(origin)) cb(null, true);
            else cb(new Error('Not allowed by CORS'));
          },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    maxAge: 3600,
  });
}
