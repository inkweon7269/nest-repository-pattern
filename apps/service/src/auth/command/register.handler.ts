import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { BCRYPT_SALT_ROUNDS, isUniqueViolation } from '@app/shared';
import * as bcrypt from 'bcrypt';
import { RegisterCommand } from './register.command';
import { IUserReadRepository } from '@service/auth/interface/user-read-repository.interface';
import {
  CreateUserInput,
  IUserWriteRepository,
} from '@service/auth/interface/user-write-repository.interface';

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  constructor(
    private readonly userReadRepository: IUserReadRepository,
    private readonly userWriteRepository: IUserWriteRepository,
  ) {}

  async execute(command: RegisterCommand): Promise<number> {
    await this.validateEmailNotTaken(command.email);
    const hashedPassword = await bcrypt.hash(
      command.password,
      BCRYPT_SALT_ROUNDS,
    );
    return this.createUserOrConflict({
      email: command.email,
      password: hashedPassword,
      name: command.name,
      marketingConsent: command.marketingConsent,
    });
  }

  private async validateEmailNotTaken(email: string): Promise<void> {
    const existing = await this.userReadRepository.findByEmail(email);
    if (existing) {
      throw new ConflictException(`User with email '${email}' already exists`);
    }
  }

  private async createUserOrConflict(input: CreateUserInput): Promise<number> {
    try {
      const user = await this.userWriteRepository.create(input);
      return user.id;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `User with email '${input.email}' already exists`,
        );
      }
      throw error;
    }
  }
}
