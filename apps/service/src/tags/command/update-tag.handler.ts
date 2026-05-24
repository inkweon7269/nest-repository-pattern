import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { UpdateTagCommand } from './update-tag.command';
import { ITagWriteRepository } from '@service/tags/interface/tag-write-repository.interface';
import { CacheService } from '@app/shared';

@CommandHandler(UpdateTagCommand)
export class UpdateTagHandler implements ICommandHandler<UpdateTagCommand> {
  constructor(
    private readonly tagWriteRepository: ITagWriteRepository,
    private readonly cacheService: CacheService,
  ) {}

  async execute(command: UpdateTagCommand): Promise<void> {
    const affected = await this.tagWriteRepository.update(
      command.id,
      command.userId,
      { name: command.name },
    );
    if (affected === 0) {
      throw new NotFoundException(`Tag with ID ${command.id} not found`);
    }

    await this.invalidateCaches(command.userId, command.id);
  }

  private async invalidateCaches(userId: number, id: number): Promise<void> {
    await this.cacheService.del(`tag:${userId}:${id}`);
    await this.cacheService.delByPattern(`tags:${userId}:*`);
    await this.cacheService.delByPattern(`posts:${userId}:*`);
    await this.cacheService.delByPattern(`post:${userId}:*`);
  }
}
