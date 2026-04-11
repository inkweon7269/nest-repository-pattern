import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AdminLogoutCommand } from './admin-logout.command';
import { IAdminWriteRepository } from '@back-office/auth/interface/admin-write-repository.interface';

@CommandHandler(AdminLogoutCommand)
export class AdminLogoutHandler implements ICommandHandler<AdminLogoutCommand> {
  constructor(private readonly adminWriteRepository: IAdminWriteRepository) {}

  async execute(command: AdminLogoutCommand): Promise<void> {
    const affected = await this.adminWriteRepository.update(command.adminId, {
      hashedRefreshToken: null,
    });

    if (affected === 0) {
      throw new NotFoundException(`Admin with id ${command.adminId} not found`);
    }
  }
}
