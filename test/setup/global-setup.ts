import { createConnection } from 'net';
import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '../../libs/shared/src/database/typeorm.config';

declare global {
  var __TEST_CONTAINER__: StartedPostgreSqlContainer | undefined;
  var __REDIS_CONTAINER__: StartedTestContainer | undefined;
}

const TEST_ENV_PATH = join(__dirname, '..', '.test-env.json');

function isRedisAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(500);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export default async function globalSetup() {
  // Redis: CI 서비스 컨테이너가 있으면 재사용, 없으면 Testcontainer 기동
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const redisAlreadyRunning = await isRedisAvailable(redisHost, redisPort);

  const startRedisContainer = redisAlreadyRunning
    ? Promise.resolve(null)
    : new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();

  let pgContainer: StartedPostgreSqlContainer | undefined;
  let redisContainer: StartedTestContainer | null = null;

  try {
    [pgContainer, redisContainer] = await Promise.all([
      new PostgreSqlContainer('postgres:17-alpine').start(),
      startRedisContainer,
    ]);

    // 컨테이너 핸들을 즉시 등록 — 이후 실패 시 teardown에서 정리 가능
    globalThis.__TEST_CONTAINER__ = pgContainer;
    globalThis.__REDIS_CONTAINER__ = redisContainer ?? undefined;

    const env = {
      DB_HOST: pgContainer.getHost(),
      DB_PORT: pgContainer.getPort().toString(),
      DB_USERNAME: pgContainer.getUsername(),
      DB_PASSWORD: pgContainer.getPassword(),
      DB_DATABASE: pgContainer.getDatabase(),
      REDIS_HOST: redisContainer ? redisContainer.getHost() : redisHost,
      REDIS_PORT: redisContainer
        ? redisContainer.getMappedPort(6379).toString()
        : redisPort.toString(),
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      JWT_ACCESS_EXPIRATION: '15m',
      JWT_REFRESH_EXPIRATION: '7d',
      JWT_ADMIN_ACCESS_SECRET: 'test-admin-access-secret',
      JWT_ADMIN_REFRESH_SECRET: 'test-admin-refresh-secret',
      JWT_ADMIN_ACCESS_EXPIRATION: '15m',
      JWT_ADMIN_REFRESH_EXPIRATION: '7d',
      THROTTLE_SKIP: 'true',
      OTEL_ENABLED: 'false',
      SERVICE_CORS_ORIGINS: 'http://allowed.test',
      BACK_OFFICE_CORS_ORIGINS: 'http://allowed-admin.test',
      GOOGLE_CLIENT_ID: 'test-google-client-id',
      GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
      GOOGLE_CALLBACK_URL: 'http://localhost/v1/auth/google/callback',
      GOOGLE_LINK_CALLBACK_URL: 'http://localhost/v1/auth/google/link/callback',
      GOOGLE_FRONTEND_REDIRECT_URL: 'http://localhost/oauth/callback',
    };

    writeFileSync(TEST_ENV_PATH, JSON.stringify(env, null, 2));

    const dataSource = new DataSource({
      ...createDataSourceOptions(env),
      synchronize: false,
    });

    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.destroy();
  } catch (error) {
    await Promise.all([pgContainer?.stop(), redisContainer?.stop()]);
    throw error;
  }
}
