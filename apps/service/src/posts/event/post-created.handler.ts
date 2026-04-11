import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PostCreatedEvent } from './post-created.event';
import { SlackService } from '@app/shared';

@Injectable()
export class PostCreatedHandler {
  constructor(private readonly slackService: SlackService) {}

  @OnEvent(PostCreatedEvent.event, { async: true })
  async handle(event: PostCreatedEvent): Promise<void> {
    await this.slackService.sendPostCreatedNotification(
      event.postId,
      event.title,
      event.userId,
    );
  }
}
