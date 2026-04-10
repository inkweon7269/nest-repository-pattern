import { unlinkSync } from 'fs';
import { join } from 'path';

const TEST_ENV_PATH = join(__dirname, '..', '.test-env.json');

export default async function globalTeardown() {
  const pgContainer = globalThis.__TEST_CONTAINER__;
  const redisContainer = globalThis.__REDIS_CONTAINER__;

  await Promise.all([pgContainer?.stop(), redisContainer?.stop()]);

  try {
    unlinkSync(TEST_ENV_PATH);
  } catch {
    // ignore if file doesn't exist
  }
}
