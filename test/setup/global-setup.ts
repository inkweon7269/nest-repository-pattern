import { createConnection } from 'net';
import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '@src/database/typeorm.config';

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

  const [pgContainer, redisContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine').start(),
    startRedisContainer,
  ]);

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
  };

  writeFileSync(TEST_ENV_PATH, JSON.stringify(env, null, 2));

  const dataSource = new DataSource({
    ...createDataSourceOptions(env),
    synchronize: false,
  });

  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();

  globalThis.__TEST_CONTAINER__ = pgContainer;
  globalThis.__REDIS_CONTAINER__ = redisContainer ?? undefined;
}
