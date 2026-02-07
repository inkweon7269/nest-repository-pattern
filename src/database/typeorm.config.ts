import { DataSourceOptions } from 'typeorm';

export function createDataSourceOptions(
  env: Record<string, string | undefined>,
): DataSourceOptions {
  const nodeEnv = env.NODE_ENV || 'local';

  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: parseInt(env.DB_PORT || '5432', 10),
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    logging: nodeEnv !== 'production',
  };
}
