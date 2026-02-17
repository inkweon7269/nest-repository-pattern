import { writeFileSync } from 'fs';
import { join } from 'path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '@src/database/typeorm.config';

const TEST_ENV_PATH = join(__dirname, '..', '.test-env.json');

export default async function globalSetup() {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();

  const env = {
    DB_HOST: container.getHost(),
    DB_PORT: container.getPort().toString(),
    DB_USERNAME: container.getUsername(),
    DB_PASSWORD: container.getPassword(),
    DB_DATABASE: container.getDatabase(),
  };

  writeFileSync(TEST_ENV_PATH, JSON.stringify(env, null, 2));

  const dataSource = new DataSource({
    ...createDataSourceOptions(env),
    synchronize: false,
  });

  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();

  (globalThis as any).__TEST_CONTAINER__ = container;
}
