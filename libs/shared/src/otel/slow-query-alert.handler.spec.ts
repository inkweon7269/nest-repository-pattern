import { createHash } from 'crypto';
import { TestBed, type Mocked } from '@suites/unit';
import { SlackService } from '../slack/slack.service';
import { CacheService } from '../cache/cache.service';
import { SlowQueryAlertHandler } from './slow-query-alert.handler';
import {
  registerSlowQueryHandler,
  SlowQueryInfo,
} from './slow-query-span-processor';

// 모듈 레벨 함수라 NestJS DI로 주입할 수 없어 module mock으로 대체한다.
jest.mock('./slow-query-span-processor', () => ({
  registerSlowQueryHandler: jest.fn(),
}));

const mockRegister = registerSlowQueryHandler as jest.MockedFunction<
  typeof registerSlowQueryHandler
>;

const flushMicrotasks = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

const sha1Prefix = (statement: string) =>
  createHash('sha1').update(statement).digest('hex').slice(0, 16);

describe('SlowQueryAlertHandler', () => {
  let handler: SlowQueryAlertHandler;
  let slackService: Mocked<SlackService>;
  let cacheService: Mocked<CacheService>;

  const mockInfo: SlowQueryInfo = {
    durationMs: 5723,
    dbSystem: 'postgresql',
    dbName: 'nest_repository',
    operation: 'SELECT',
    statement: 'SELECT * FROM posts WHERE user_id = $1',
    traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
    spanId: '00f067aa0ba902b7',
    serviceName: 'service',
    occurredAt: new Date('2026-05-10T01:30:42.123Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const { unit, unitRef } = await TestBed.solitary(
      SlowQueryAlertHandler,
    ).compile();

    handler = unit;
    slackService = unitRef.get(SlackService);
    cacheService = unitRef.get(CacheService);
  });

  describe('onModuleInit', () => {
    it('SpanProcessor 측 registerSlowQueryHandler에 콜백을 한 번 등록한다', () => {
      handler.onModuleInit();

      expect(mockRegister).toHaveBeenCalledTimes(1);
      expect(mockRegister).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('등록된 콜백 동작', () => {
    let registeredCallback: (info: SlowQueryInfo) => void;

    beforeEach(() => {
      handler.onModuleInit();
      registeredCallback = mockRegister.mock.calls[0][0];
    });

    it('새 SQL이면 dedup 키를 set하고 Slack 알림을 보낸다', async () => {
      cacheService.get.mockResolvedValue(undefined);

      registeredCallback(mockInfo);
      await flushMicrotasks();

      const expectedKey = `slow-query:${sha1Prefix(mockInfo.statement)}`;
      expect(cacheService.get).toHaveBeenCalledWith(expectedKey);
      expect(cacheService.set).toHaveBeenCalledWith(expectedKey, '1', 60);
      expect(slackService.sendSlowQueryAlert).toHaveBeenCalledWith(mockInfo);
    });

    it('동일 SQL이 dedup 키로 이미 존재하면 cache.set과 Slack 알림을 호출하지 않는다', async () => {
      cacheService.get.mockResolvedValue('1');

      registeredCallback(mockInfo);
      await flushMicrotasks();

      expect(cacheService.set).not.toHaveBeenCalled();
      expect(slackService.sendSlowQueryAlert).not.toHaveBeenCalled();
    });

    it('서로 다른 SQL은 dedup 키가 달라 각각 알림을 보낸다', async () => {
      cacheService.get.mockResolvedValue(undefined);

      const otherInfo: SlowQueryInfo = {
        ...mockInfo,
        statement: 'SELECT * FROM users WHERE id = $1',
      };

      registeredCallback(mockInfo);
      registeredCallback(otherInfo);
      await flushMicrotasks();

      expect(slackService.sendSlowQueryAlert).toHaveBeenCalledTimes(2);
      expect(cacheService.get).toHaveBeenNthCalledWith(
        1,
        `slow-query:${sha1Prefix(mockInfo.statement)}`,
      );
      expect(cacheService.get).toHaveBeenNthCalledWith(
        2,
        `slow-query:${sha1Prefix(otherInfo.statement)}`,
      );
    });
  });
});
