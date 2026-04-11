import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QueryFailedError } from 'typeorm';
import { CreatePostCommand } from './create-post.command';
import { PostCreatedEvent } from '@service/posts/event/post-created.event';
import { IPostReadRepository } from '@service/posts/interface/post-read-repository.interface';
import { IPostWriteRepository } from '@service/posts/interface/post-write-repository.interface';
import { CacheService } from '@app/shared';

@CommandHandler(CreatePostCommand)
export class CreatePostHandler implements ICommandHandler<CreatePostCommand> {
  constructor(
    private readonly postReadRepository: IPostReadRepository,
    private readonly postWriteRepository: IPostWriteRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: CacheService,
  ) {}

  async execute(command: CreatePostCommand): Promise<number> {
    const existing = await this.postReadRepository.findByUserIdAndTitle(
      command.userId,
      command.title,
    );
    if (existing) {
      throw new ConflictException(
        `Post with title '${command.title}' already exists`,
      );
    }

    try {
      const post = await this.postWriteRepository.create({
        userId: command.userId,
        title: command.title,
        content: command.content,
        isPublished: command.isPublished,
      });
      this.eventEmitter.emit(
        PostCreatedEvent.event,
        new PostCreatedEvent(post.id, command.title, command.userId),
      );
      await this.cacheService.delByPattern(`posts:${command.userId}:*`);
      return post.id;
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === '23505'
      ) {
        throw new ConflictException(
          `Post with title '${command.title}' already exists`,
        );
      }
      throw error;
    }
  }
}
