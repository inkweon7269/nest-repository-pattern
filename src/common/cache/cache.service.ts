import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const data = await this.redis.get(key);
      if (!data) {
        this.logger.debug(`Cache MISS: ${key}`);
        return undefined;
      }
      this.logger.debug(`Cache HIT: ${key}`);
      return JSON.parse(data) as T;
    } catch (error) {
      this.logger.warn(`Cache GET failed: ${key}`, (error as Error).message);
      try {
        await this.redis.del(key);
      } catch {
        // 키 삭제 실패도 무시
      }
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      this.logger.debug(`Cache SET: ${key} (TTL: ${ttlSeconds}s)`);
    } catch (error) {
      this.logger.warn(`Cache SET failed: ${key}`, (error as Error).message);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      this.logger.debug(`Cache DEL: ${key}`);
    } catch (error) {
      this.logger.warn(`Cache DEL failed: ${key}`, (error as Error).message);
    }
  }

  async delByPattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      let deletedCount = 0;
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.redis.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');
      this.logger.debug(`Cache DEL pattern: ${pattern} (${deletedCount} keys)`);
    } catch (error) {
      this.logger.warn(
        `Cache DEL pattern failed: ${pattern}`,
        (error as Error).message,
      );
    }
  }
}
