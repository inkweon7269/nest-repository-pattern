import { readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { AppModule } from '../../src/app.module';

const TEST_ENV_PATH = join(__dirname, '..', '.test-env.json');

export async function createIntegrationApp(): Promise<INestApplication<App>> {
  const env = JSON.parse(readFileSync(TEST_ENV_PATH, 'utf-8'));

  Object.assign(process.env, env);

  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
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

export function useTransactionRollback(
  app: INestApplication<App>,
): TransactionHelper {
  const dataSource = app.get(DataSource);
  let queryRunner: QueryRunner;
  let originalManager: EntityManager;

  return {
    async start() {
      originalManager = dataSource.manager;
      queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      Object.defineProperty(dataSource, 'manager', {
        value: queryRunner.manager,
        writable: true,
        configurable: true,
      });
    },
    async rollback() {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      Object.defineProperty(dataSource, 'manager', {
        value: originalManager,
        writable: true,
        configurable: true,
      });
    },
  };
}
