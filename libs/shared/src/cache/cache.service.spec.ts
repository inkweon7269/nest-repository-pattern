import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { CacheService } from './cache.service';

type MockRedis = {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  scan: jest.Mock;
};

describe('CacheService', () => {
  let redis: MockRedis;
  let service: CacheService;

  beforeAll(() => {
    // Fail-Open 경로가 warn을 남기므로 테스트 출력 오염을 막는다.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      scan: jest.fn(),
    };
    service = new CacheService(redis as unknown as Redis);
  });

  describe('get', () => {
    it('키가 존재하면 JSON 파싱된 값을 반환한다', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ id: 1, title: 'Post' }));

      await expect(service.get('post:1:1')).resolves.toEqual({
        id: 1,
        title: 'Post',
      });
    });

    it('키가 없으면 undefined를 반환한다', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.get('post:1:1')).resolves.toBeUndefined();
    });

    it('Redis GET이 실패해도 예외를 전파하지 않고 undefined를 반환한다 (Fail-Open)', async () => {
      redis.get.mockRejectedValue(new Error('connection refused'));

      await expect(service.get('post:1:1')).resolves.toBeUndefined();
    });

    it('손상된 JSON이면 undefined를 반환하고 해당 키를 삭제한다 (self-healing)', async () => {
      redis.get.mockResolvedValue('{not-json');
      redis.del.mockResolvedValue(1);

      await expect(service.get('post:1:1')).resolves.toBeUndefined();
      expect(redis.del).toHaveBeenCalledWith('post:1:1');
    });

    it('손상된 JSON 삭제까지 실패해도 undefined를 반환한다 (이중 swallow)', async () => {
      redis.get.mockResolvedValue('{not-json');
      redis.del.mockRejectedValue(new Error('connection refused'));

      await expect(service.get('post:1:1')).resolves.toBeUndefined();
    });
  });

  describe('set', () => {
    it('값을 JSON 직렬화하여 EX TTL과 함께 저장한다', async () => {
      redis.set.mockResolvedValue('OK');

      await service.set('post:1:1', { id: 1 }, 300);

      expect(redis.set).toHaveBeenCalledWith(
        'post:1:1',
        JSON.stringify({ id: 1 }),
        'EX',
        300,
      );
    });

    it('Redis SET이 실패해도 예외를 전파하지 않는다 (Fail-Open)', async () => {
      redis.set.mockRejectedValue(new Error('connection refused'));

      await expect(
        service.set('post:1:1', { id: 1 }, 300),
      ).resolves.toBeUndefined();
    });
  });

  describe('del', () => {
    it('키를 삭제한다', async () => {
      redis.del.mockResolvedValue(1);

      await service.del('post:1:1');

      expect(redis.del).toHaveBeenCalledWith('post:1:1');
    });

    it('Redis DEL이 실패해도 예외를 전파하지 않는다 (Fail-Open)', async () => {
      redis.del.mockRejectedValue(new Error('connection refused'));

      await expect(service.del('post:1:1')).resolves.toBeUndefined();
    });
  });

  describe('delByPattern', () => {
    it('SCAN 커서를 0이 될 때까지 순회하며 발견한 키를 모두 삭제한다', async () => {
      redis.scan
        .mockResolvedValueOnce(['42', ['posts:1:a', 'posts:1:b']])
        .mockResolvedValueOnce(['0', ['posts:1:c']]);
      redis.del.mockResolvedValue(1);

      await service.delByPattern('posts:1:*');

      expect(redis.scan).toHaveBeenCalledTimes(2);
      expect(redis.scan).toHaveBeenNthCalledWith(
        1,
        '0',
        'MATCH',
        'posts:1:*',
        'COUNT',
        100,
      );
      expect(redis.scan).toHaveBeenNthCalledWith(
        2,
        '42',
        'MATCH',
        'posts:1:*',
        'COUNT',
        100,
      );
      expect(redis.del).toHaveBeenNthCalledWith(1, 'posts:1:a', 'posts:1:b');
      expect(redis.del).toHaveBeenNthCalledWith(2, 'posts:1:c');
    });

    it('매칭되는 키가 없으면 DEL을 호출하지 않는다', async () => {
      redis.scan.mockResolvedValue(['0', []]);

      await service.delByPattern('posts:1:*');

      expect(redis.del).not.toHaveBeenCalled();
    });

    it('Redis SCAN이 실패해도 예외를 전파하지 않는다 (Fail-Open)', async () => {
      redis.scan.mockRejectedValue(new Error('connection refused'));

      await expect(service.delByPattern('posts:1:*')).resolves.toBeUndefined();
    });
  });
});
