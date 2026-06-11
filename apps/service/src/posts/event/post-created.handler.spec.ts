import { TestBed, type Mocked } from '@suites/unit';
import { PostCreatedHandler } from './post-created.handler';
import { PostCreatedEvent } from './post-created.event';
import { SlackService } from '@app/shared';

describe('PostCreatedHandler', () => {
  let handler: PostCreatedHandler;
  let slackService: Mocked<SlackService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(PostCreatedHandler).compile();

    handler = unit;
    slackService = unitRef.get(SlackService);
  });

  it('이벤트의 postId, title, userId를 그대로 Slack 알림으로 전달한다', async () => {
    await handler.handle(new PostCreatedEvent(10, 'New Post', 1));

    expect(slackService.sendPostCreatedNotification).toHaveBeenCalledWith(
      10,
      'New Post',
      1,
    );
  });
});
