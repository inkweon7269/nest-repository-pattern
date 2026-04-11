import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { DeletePostCommand } from './delete-post.command';
import { IPostWriteRepository } from '../interface/post-write-repository.interface';
import { CacheService } from '@app/shared';

@CommandHandler(DeletePostCommand)
export class DeletePostHandler implements ICommandHandler<DeletePostCommand> {
  constructor(
    private readonly postWriteRepository: IPostWriteRepository,
    private readonly cacheService: CacheService,
  ) {}

  async execute(command: DeletePostCommand): Promise<void> {
    const affected = await this.postWriteRepository.delete(
      command.id,
      command.userId,
    );
    if (affected === 0) {
      throw new NotFoundException(`Post with ID ${command.id} not found`);
    }

    await this.cacheService.del(`post:${command.userId}:${command.id}`);
    await this.cacheService.delByPattern(`posts:${command.userId}:*`);
  }
}
