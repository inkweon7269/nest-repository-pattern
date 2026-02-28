import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { RegisterCommand } from '@src/auth/command/register.command';
import { IUserReadRepository } from '@src/auth/interface/user-read-repository.interface';
import { IUserWriteRepository } from '@src/auth/interface/user-write-repository.interface';

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  constructor(
    private readonly userReadRepository: IUserReadRepository,
    private readonly userWriteRepository: IUserWriteRepository,
  ) {}

  async execute(command: RegisterCommand): Promise<number> {
    const existing = await this.userReadRepository.findByEmail(command.email);
    if (existing) {
      throw new ConflictException(
        `User with email '${command.email}' already exists`,
      );
    }

    const hashedPassword = await bcrypt.hash(command.password, 10);

    try {
      const user = await this.userWriteRepository.create({
        email: command.email,
        password: hashedPassword,
        name: command.name,
      });
      return user.id;
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === '23505'
      ) {
        throw new ConflictException(
          `User with email '${command.email}' already exists`,
        );
      }
      throw error;
    }
  }
}
