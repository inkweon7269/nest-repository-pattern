import { ConflictException } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from 'typeorm-transactional';
import { CreatePostCommand } from './create-post.command';
import { PostCreatedEvent } from '@service/posts/event/post-created.event';
import { IPostReadRepository } from '@service/posts/interface/post-read-repository.interface';
import { IPostWriteRepository } from '@service/posts/interface/post-write-repository.interface';
import type { CreatePostInput } from '@service/posts/interface/post-write-repository.interface';
import { TagOwnershipValidator } from '@service/tags/tag-ownership.validator';
import { CacheService, Post, isUniqueViolation } from '@app/shared';

@CommandHandler(CreatePostCommand)
export class CreatePostHandler implements ICommandHandler<CreatePostCommand> {
  constructor(
    private readonly postReadRepository: IPostReadRepository,
    private readonly postWriteRepository: IPostWriteRepository,
    private readonly tagOwnershipValidator: TagOwnershipValidator,
    private readonly eventBus: EventBus,
    private readonly cacheService: CacheService,
  ) {}

  async execute(command: CreatePostCommand): Promise<number> {
    await this.validateTitleNotDuplicated(command.userId, command.title);
    await this.tagOwnershipValidator.validateOwnedByUser(
      command.userId,
      command.tagIds,
    );
    const post = await this.persistPostOrConflict({
      userId: command.userId,
      title: command.title,
      content: command.content,
      isPublished: command.isPublished,
      tagIds: command.tagIds,
    });
    this.emitCreatedEvent(post.id, command.title, command.userId);
    await this.invalidateUserCache(command.userId);
    return post.id;
  }

  private async validateTitleNotDuplicated(
    userId: number,
    title: string,
  ): Promise<void> {
    const existing = await this.postReadRepository.findByUserIdAndTitle(
      userId,
      title,
    );
    if (existing) {
      throw new ConflictException(`Post with title '${title}' already exists`);
    }
  }

  @Transactional()
  private async persistPostOrConflict(input: CreatePostInput): Promise<Post> {
    try {
      return await this.postWriteRepository.create(input);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `Post with title '${input.title}' already exists`,
        );
      }
      throw error;
    }
  }

  private emitCreatedEvent(
    postId: number,
    title: string,
    userId: number,
  ): void {
    this.eventBus.publish(new PostCreatedEvent(postId, title, userId));
  }

  private async invalidateUserCache(userId: number): Promise<void> {
    await this.cacheService.delByPattern(`posts:${userId}:*`);
  }
}
