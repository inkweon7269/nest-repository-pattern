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
   * SLOW_QUERY_THRESHOLD_MS 초과한 PostgreSQL 쿼리 1건에 대해 Slack 알림을 발송한다.
   * SlowQuerySpanProcessor → SlowQueryAlertHandler → 본 메서드로 흐름이 이어진다.
   * SQL 본문은 너무 길 경우 잘라서 표시(파라미터 값은 OTEL 측에서 이미 제외된 상태).
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
