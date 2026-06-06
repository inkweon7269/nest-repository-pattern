import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { PostCreatedEvent } from './post-created.event';
import { SlackService } from '@app/shared';

@EventsHandler(PostCreatedEvent)
export class PostCreatedHandler implements IEventHandler<PostCreatedEvent> {
  constructor(private readonly slackService: SlackService) {}

  async handle(event: PostCreatedEvent): Promise<void> {
    await this.slackService.sendPostCreatedNotification(
      event.postId,
      event.title,
      event.userId,
    );
  }
}
