import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { LogoutCommand } from '@src/auth/command/logout.command';
import { IUserWriteRepository } from '@src/auth/interface/user-write-repository.interface';

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand> {
  constructor(private readonly userWriteRepository: IUserWriteRepository) {}

  async execute(command: LogoutCommand): Promise<void> {
    const affected = await this.userWriteRepository.update(command.userId, {
      hashedRefreshToken: null,
    });

    if (affected === 0) {
      throw new NotFoundException(`User with id ${command.userId} not found`);
    }
  }
}
