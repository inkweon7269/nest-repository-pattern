import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import { SLACK_CHANNELS } from '@src/slack/slack.channels';

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
