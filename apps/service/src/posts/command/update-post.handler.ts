import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UpdatePostCommand } from './update-post.command';
import { IPostWriteRepository } from '@service/posts/interface/post-write-repository.interface';
import { ITagReadRepository } from '@service/tags/interface/tag-read-repository.interface';
import { CacheService } from '@app/shared';

@CommandHandler(UpdatePostCommand)
export class UpdatePostHandler implements ICommandHandler<UpdatePostCommand> {
  constructor(
    private readonly postWriteRepository: IPostWriteRepository,
    private readonly tagReadRepository: ITagReadRepository,
    private readonly cacheService: CacheService,
  ) {}

  async execute(command: UpdatePostCommand): Promise<void> {
    await this.validateTagsOwnedByUser(command.userId, command.tagIds);
    await this.updatePostOrThrow(command);
    await this.invalidatePostCache(command.userId, command.id);
  }

  private async validateTagsOwnedByUser(
    userId: number,
    tagIds?: number[],
  ): Promise<void> {
    if (!tagIds?.length) {
      return;
    }

    const uniqueIds = [...new Set(tagIds)];
    const tags = await this.tagReadRepository.findByIdsAndUserId(
      uniqueIds,
      userId,
    );
    if (tags.length !== uniqueIds.length) {
      throw new BadRequestException(
        'One or more tags do not exist or are not owned by the user',
      );
    }
  }

  private async updatePostOrThrow(command: UpdatePostCommand): Promise<void> {
    const affected = await this.postWriteRepository.update(
      command.id,
      command.userId,
      {
        title: command.title,
        content: command.content,
        isPublished: command.isPublished,
        tagIds: command.tagIds,
      },
    );
    if (affected === 0) {
      throw new NotFoundException(`Post with ID ${command.id} not found`);
    }
  }

  private async invalidatePostCache(
    userId: number,
    postId: number,
  ): Promise<void> {
    await this.cacheService.del(`post:${userId}:${postId}`);
    await this.cacheService.delByPattern(`posts:${userId}:*`);
  }
}
