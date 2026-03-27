import { Module } from '@nestjs/common';
import { SlackService } from '@src/slack/slack.service';

@Module({
  providers: [SlackService],
  exports: [SlackService],
})
export class SlackModule {}
