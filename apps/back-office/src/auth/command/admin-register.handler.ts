import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { isUniqueViolation } from '@app/shared';
import * as bcrypt from 'bcrypt';
import { AdminRegisterCommand } from './admin-register.command';
import { IAdminReadRepository } from '@back-office/auth/interface/admin-read-repository.interface';
import { IAdminWriteRepository } from '@back-office/auth/interface/admin-write-repository.interface';

@CommandHandler(AdminRegisterCommand)
export class AdminRegisterHandler implements ICommandHandler<AdminRegisterCommand> {
  constructor(
    private readonly adminReadRepository: IAdminReadRepository,
    private readonly adminWriteRepository: IAdminWriteRepository,
  ) {}

  async execute(command: AdminRegisterCommand): Promise<number> {
    const existing = await this.adminReadRepository.findByEmail(command.email);
    if (existing) {
      throw new ConflictException(
        `Admin with email '${command.email}' already exists`,
      );
    }

    const hashedPassword = await bcrypt.hash(command.password, 10);

    try {
      const admin = await this.adminWriteRepository.create({
        email: command.email,
        password: hashedPassword,
        name: command.name,
        role: command.role,
      });
      return admin.id;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `Admin with email '${command.email}' already exists`,
        );
      }
      throw error;
    }
  }
}
