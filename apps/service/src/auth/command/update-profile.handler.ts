import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UpdateProfileCommand } from './update-profile.command';
import { IUserWriteRepository } from '@service/auth/interface/user-write-repository.interface';
import { CacheService } from '@app/shared';

@CommandHandler(UpdateProfileCommand)
export class UpdateProfileHandler implements ICommandHandler<UpdateProfileCommand> {
  constructor(
    private readonly userWriteRepository: IUserWriteRepository,
    private readonly cacheService: CacheService,
  ) {}

  async execute(command: UpdateProfileCommand): Promise<void> {
    await this.updateNameOrThrow(command.userId, command.name);
    await this.cacheService.del(`profile:${command.userId}`);
  }

  private async updateNameOrThrow(id: number, name: string): Promise<void> {
    const affected = await this.userWriteRepository.update(id, { name });
    if (affected === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
  }
}
