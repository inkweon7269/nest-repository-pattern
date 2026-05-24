import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UpdateTagCommand } from './update-tag.command';
import { ITagWriteRepository } from '@service/tags/interface/tag-write-repository.interface';
import { CacheService, isUniqueViolation } from '@app/shared';

@CommandHandler(UpdateTagCommand)
export class UpdateTagHandler implements ICommandHandler<UpdateTagCommand> {
  constructor(
    private readonly tagWriteRepository: ITagWriteRepository,
    private readonly cacheService: CacheService,
  ) {}

  async execute(command: UpdateTagCommand): Promise<void> {
    const affected = await this.updateNameOrConflict(command);
    if (affected === 0) {
      throw new NotFoundException(`Tag with ID ${command.id} not found`);
    }

    await this.invalidateTagCaches(command.userId, command.id);
  }

  private async updateNameOrConflict(
    command: UpdateTagCommand,
  ): Promise<number> {
    try {
      return await this.tagWriteRepository.update(command.id, command.userId, {
        name: command.name,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `Tag with name '${command.name}' already exists`,
        );
      }
      throw error;
    }
  }

  private async invalidateTagCaches(userId: number, id: number): Promise<void> {
    await this.cacheService.del(`tag:${userId}:${id}`);
    await this.cacheService.delByPattern(`tags:${userId}:*`);
    await this.cacheService.delByPattern(`posts:${userId}:*`);
    await this.cacheService.delByPattern(`post:${userId}:*`);
  }
}
