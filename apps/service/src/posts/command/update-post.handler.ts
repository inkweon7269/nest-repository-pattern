import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { UpdatePostCommand } from './update-post.command';
import { IPostWriteRepository } from '@service/posts/interface/post-write-repository.interface';
import { CacheService } from '@app/shared';

@CommandHandler(UpdatePostCommand)
export class UpdatePostHandler implements ICommandHandler<UpdatePostCommand> {
  constructor(
    private readonly postWriteRepository: IPostWriteRepository,
    private readonly cacheService: CacheService,
  ) {}

  async execute(command: UpdatePostCommand): Promise<void> {
    const affected = await this.postWriteRepository.update(
      command.id,
      command.userId,
      {
        title: command.title,
        content: command.content,
        isPublished: command.isPublished,
      },
    );
    if (affected === 0) {
      throw new NotFoundException(`Post with ID ${command.id} not found`);
    }

    await this.cacheService.del(`post:${command.userId}:${command.id}`);
    await this.cacheService.delByPattern(`posts:${command.userId}:*`);
  }
}
