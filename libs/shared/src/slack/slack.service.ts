import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import { SLACK_CHANNELS } from './slack.channels';
import type { SlowQueryInfo } from '../otel/slow-query-span-processor';

const SLOW_QUERY_STATEMENT_MAX_CHARS = 1000;

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private readonly client: WebClient | undefined;

  constructor(configService: ConfigService) {
    const token = configService.get<string>('SLACK_BOT_TOKEN');
    this.client = token ? new WebClient(token) : undefined;
  }

  async sendPostCreatedNotification(
    postId: number,
    title: string,
    userId: number,
  ): Promise<void> {
    const safeTitle = this.escapeSlackText(title);
    await this.send(
      SLACK_CHANNELS.POST_CREATED,
      `New post created!\n*Title:* ${safeTitle}\n*Post ID:* ${postId}\n*User ID:* ${userId}`,
    );
  }

  /**
   * `SLOW_QUERY_THRESHOLD_MS`(기본 5000ms)를 넘긴 PostgreSQL 쿼리 한 건을
   * Slack 채널(`SLOW_QUERY`)에 보고한다.
   *
   * 호출 흐름:
   *   OTEL pg 자동 계측 → SlowQuerySpanProcessor → SlowQueryAlertHandler → 이 메서드
   *
   * SQL 본문이 1000자를 넘으면 뒷부분을 잘라서 표시한다(메시지 길이 제한 + 가독성).
   * 파라미터 값은 OTEL 자동 계측 단계에서 이미 제외되어 있어 비밀번호 같은
   * 민감 정보가 슬랙으로 새어나가지 않는다.
   */
  async sendSlowQueryAlert(info: SlowQueryInfo): Promise<void> {
    const truncated =
      info.statement.length > SLOW_QUERY_STATEMENT_MAX_CHARS
        ? `${info.statement.slice(0, SLOW_QUERY_STATEMENT_MAX_CHARS)}... (truncated)`
        : info.statement;

    const durationSec = (info.durationMs / 1000).toFixed(3);
    const text = [
      `*[${durationSec}s 이상 실행된 쿼리]*`,
      `Time     : ${info.occurredAt.toISOString()}`,
      `Service  : ${info.serviceName}`,
      `Duration : ${durationSec}s`,
      `DB       : ${info.dbName ?? '-'}`,
      `Operation: ${info.operation ?? '-'}`,
      `TraceId  : ${info.traceId}`,
      `SpanId   : ${info.spanId}`,
      '```',
      this.escapeSlackText(truncated),
      '```',
    ].join('\n');

    await this.send(SLACK_CHANNELS.SLOW_QUERY, text);
  }

  private escapeSlackText(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private async send(channel: string, text: string): Promise<void> {
    if (!this.client) {
      this.logger.warn(
        'SLACK_BOT_TOKEN is not configured. Skipping Slack notification.',
      );
      return;
    }

    try {
      await this.client.chat.postMessage({ channel, text });
    } catch (error) {
      this.logger.error(
        `Failed to send Slack notification to ${channel}: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
