import { readFileSync } from 'fs';
import { join } from 'path';
import {
  INestApplication,
  Type,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import type Redis from 'ioredis';
import { Logger } from 'nestjs-pino';
import {
  addTransactionalDataSource,
  deleteDataSourceByName,
} from 'typeorm-transactional';
import {
  applyCompressionMiddleware,
  applySecurityMiddleware,
  CorsOriginEnvKey,
  HttpExceptionFilter,
  LoggingInterceptor,
} from '@app/shared';

const TEST_ENV_PATH = join(__dirname, '..', '.test-env.json');

export interface ProviderOverride {
  provide: unknown;
  useClass?: Type;
  useValue?: unknown;
}

export async function createIntegrationApp(
  appModule: Type,
  options: {
    corsOriginEnvKey?: CorsOriginEnvKey;
    overrideProviders?: ProviderOverride[];
  } = {},
): Promise<INestApplication<App>> {
  const { corsOriginEnvKey = 'SERVICE_CORS_ORIGINS', overrideProviders = [] } =
    options;

  const env = JSON.parse(readFileSync(TEST_ENV_PATH, 'utf-8')) as Record<
    string,
    string
  >;

  Object.assign(process.env, env);

  const builder = Test.createTestingModule({ imports: [appModule] });
  for (const override of overrideProviders) {
    const target = builder.overrideProvider(override.provide as Type);
    if (override.useClass) {
      target.useClass(override.useClass);
    } else if (override.useValue !== undefined) {
      target.useValue(override.useValue);
    }
  }
  const module = await builder.compile();

  const app = module.createNestApplication();
  // 통합 테스트는 spec마다 새 DataSource를 생성하므로 기존 등록을 정리 후 재등록
  deleteDataSourceByName('default');
  addTransactionalDataSource(app.get(DataSource));

  applySecurityMiddleware(app, { corsOriginEnvKey });
  applyCompressionMiddleware(app);

  app.useLogger(app.get(Logger));
  app.useGlobalFilters(app.get(HttpExceptionFilter));
  app.useGlobalInterceptors(app.get(LoggingInterceptor));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  await app.init();

  return app;
}

export async function truncateAllTables(dataSource: DataSource): Promise<void> {
  const tableNames = dataSource.entityMetadatas
    .map((entity) => `"${entity.tableName}"`)
    .join(', ');

  if (tableNames.length > 0) {
    await dataSource.query(`TRUNCATE ${tableNames} RESTART IDENTITY CASCADE`);
  }
}

export interface TransactionHelper {
  start(): Promise<void>;
  rollback(): Promise<void>;
}

// `@Transactional()`(typeorm-transactional)은 별도 커넥션으로 새 트랜잭션을
// 열기 때문에 `dataSource.manager` override 방식의 격리는 충돌한다.
// 본 헬퍼는 기존 호출부 호환을 위해 인터페이스만 유지하고,
// 격리는 각 테스트 전 TRUNCATE + Redis FLUSHDB로 보장한다.
// (TRUNCATE RESTART IDENTITY로 ID가 1부터 재시작하므로 캐시 키가 충돌함)
export function useTransactionRollback(
  app: INestApplication<App>,
): TransactionHelper {
  const dataSource = app.get(DataSource);
  const redis = app.get<Redis>('REDIS_CLIENT');

  return {
    async start() {
      await truncateAllTables(dataSource);
      await redis.flushdb();
    },
    async rollback() {
      // 다음 테스트의 start()에서 정리. 명시적 cleanup 없음.
    },
  };
}
