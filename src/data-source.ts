import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { createDataSourceOptions } from '@src/database/typeorm.config';

const nodeEnv = process.env.NODE_ENV || 'local';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${nodeEnv}`) });

export default new DataSource({
  ...createDataSourceOptions(process.env),
  synchronize: false,
});
