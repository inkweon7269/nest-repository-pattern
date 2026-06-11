import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import { SlackService } from './slack.service';
import { SLACK_CHANNELS } from './slack.channels';
import type { SlowQueryInfo } from '../otel/slow-query-span-processor';

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn(),
}));

const WebClientMock = WebClient as unknown as jest.Mock;

function createService(token: string | undefined): SlackService {
  const configService = {
    get: jest.fn().mockReturnValue(token),
  } as unknown as ConfigService;
  return new SlackService(configService);
}

function createSlowQueryInfo(
  overrides: Partial<SlowQueryInfo> = {},
): SlowQueryInfo {
  return {
    durationMs: 6500,
    dbSystem: 'postgresql',
    dbName: 'nest_repository',
    operation: 'SELECT',
    statement: 'SELECT * FROM posts WHERE user_id = $1',
    traceId: 'trace-1',
    spanId: 'span-1',
    serviceName: 'service',
    occurredAt: new Date('2026-06-11T00:00:00.000Z'),
    ...overrides,
  };
}

describe('SlackService', () => {
  let postMessage: jest.Mock;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    postMessage = jest.fn().mockResolvedValue({ ok: true });
    WebClientMock.mockReset();
    WebClientMock.mockImplementation(() => ({ chat: { postMessage } }));
  });

  it('SLACK_BOT_TOKEN이 없으면 WebClient를 생성하지 않고 전송을 건너뛴다 (silent skip)', async () => {
    const service = createService(undefined);

    await service.sendPostCreatedNotification(1, 'Title', 1);

    expect(WebClientMock).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('게시글 생성 알림은 제목의 & < > 를 escape하여 POST_CREATED 채널로 전송한다', async () => {
    const service = createService('xoxb-token');

    await service.sendPostCreatedNotification(10, 'A & B <script>', 1);

    expect(postMessage).toHaveBeenCalledWith({
      channel: SLACK_CHANNELS.POST_CREATED,
      text: expect.stringContaining('A &amp; B &lt;script&gt;') as string,
    });
    const { text } = postMessage.mock.calls[0][0] as { text: string };
    expect(text).toContain('*Post ID:* 10');
    expect(text).toContain('*User ID:* 1');
  });

  it('슬로우 쿼리 SQL이 1000자를 넘으면 잘라내고 truncated 표시를 붙인다', async () => {
    const service = createService('xoxb-token');
    const longStatement = 'S'.repeat(1500);

    await service.sendSlowQueryAlert(
      createSlowQueryInfo({ statement: longStatement }),
    );

    const { channel, text } = postMessage.mock.calls[0][0] as {
      channel: string;
      text: string;
    };
    expect(channel).toBe(SLACK_CHANNELS.SLOW_QUERY);
    expect(text).toContain(`${'S'.repeat(1000)}... (truncated)`);
    expect(text).not.toContain('S'.repeat(1001));
  });

  it('SQL에 트리플 백틱이 있으면 zero-width space로 무력화하여 코드 블록 깨짐을 막는다', async () => {
    const service = createService('xoxb-token');

    await service.sendSlowQueryAlert(
      createSlowQueryInfo({ statement: 'SELECT ``` FROM x' }),
    );

    const { text } = postMessage.mock.calls[0][0] as { text: string };
    expect(text).toContain('`​`​`');
    expect(text).not.toContain('SELECT ``` FROM x');
  });

  it('HTTP 컨텍스트와 userId가 있으면 해당 라인을 포함한다', async () => {
    const service = createService('xoxb-token');

    await service.sendSlowQueryAlert(
      createSlowQueryInfo({
        httpMethod: 'GET',
        httpRoute: '/v1/posts/:id',
        userId: 7,
      }),
    );

    const { text } = postMessage.mock.calls[0][0] as { text: string };
    expect(text).toContain('HTTP     : GET /v1/posts/:id');
    expect(text).toContain('UserId   : 7');
  });

  it('비-HTTP 컨텍스트면 HTTP/UserId 라인을 생략한다', async () => {
    const service = createService('xoxb-token');

    await service.sendSlowQueryAlert(createSlowQueryInfo());

    const { text } = postMessage.mock.calls[0][0] as { text: string };
    expect(text).not.toContain('HTTP     :');
    expect(text).not.toContain('UserId   :');
  });

  it('postMessage가 실패해도 호출자에게 예외를 전파하지 않는다 (Fail-Open)', async () => {
    const service = createService('xoxb-token');
    postMessage.mockRejectedValue(new Error('slack api error'));

    await expect(
      service.sendPostCreatedNotification(1, 'Title', 1),
    ).resolves.toBeUndefined();
  });
});
