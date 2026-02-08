import { unlinkSync } from 'fs';
import { join } from 'path';

const TEST_ENV_PATH = join(__dirname, '..', '.test-env.json');

export default async function globalTeardown() {
  const container = (globalThis as any).__TEST_CONTAINER__;
  if (container) {
    await container.stop();
  }

  try {
    unlinkSync(TEST_ENV_PATH);
  } catch {
    // ignore if file doesn't exist
  }
}
