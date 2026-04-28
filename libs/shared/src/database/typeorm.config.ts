import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { User } from '../entities/user.entity';
import { Post } from '../entities/post.entity';
import { Admin } from '../entities/admin.entity';

const entities = [User, Post, Admin];

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
    entities,
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    logging: nodeEnv !== 'production',
    namingStrategy: new SnakeNamingStrategy(),
  };
}
