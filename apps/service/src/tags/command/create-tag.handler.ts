import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CreateTagCommand } from './create-tag.command';
import { ITagReadRepository } from '@service/tags/interface/tag-read-repository.interface';
import {
  CreateTagInput,
  ITagWriteRepository,
} from '@service/tags/interface/tag-write-repository.interface';
import { CacheService, Tag, isUniqueViolation } from '@app/shared';

@CommandHandler(CreateTagCommand)
export class CreateTagHandler implements ICommandHandler<CreateTagCommand> {
  constructor(
    private readonly tagReadRepository: ITagReadRepository,
    private readonly tagWriteRepository: ITagWriteRepository,
    private readonly cacheService: CacheService,
  ) {}

  async execute(command: CreateTagCommand): Promise<number> {
    await this.validateNameNotDuplicated(command.userId, command.name);
    const tag = await this.persistTagOrConflict({
      userId: command.userId,
      name: command.name,
    });
    await this.invalidateUserCache(command.userId);
    return tag.id;
  }

  private async validateNameNotDuplicated(
    userId: number,
    name: string,
  ): Promise<void> {
    const existing = await this.tagReadRepository.findByUserIdAndName(
      userId,
      name,
    );
    if (existing) {
      throw new ConflictException(`Tag with name '${name}' already exists`);
    }
  }

  private async persistTagOrConflict(input: CreateTagInput): Promise<Tag> {
    try {
      return await this.tagWriteRepository.create(input);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `Tag with name '${input.name}' already exists`,
        );
      }
      throw error;
    }
  }

  private async invalidateUserCache(userId: number): Promise<void> {
    await this.cacheService.delByPattern(`tags:${userId}:*`);
  }
}
