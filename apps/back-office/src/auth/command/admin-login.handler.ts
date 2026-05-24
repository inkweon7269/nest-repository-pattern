import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import * as bcrypt from 'bcrypt';
import { AdminLoginCommand } from './admin-login.command';
import { IAdminReadRepository } from '@back-office/auth/interface/admin-read-repository.interface';
import { AdminTokenIssuer } from '@back-office/auth/admin-token-issuer.service';
import { Admin, AuthTokens } from '@app/shared';

@CommandHandler(AdminLoginCommand)
export class AdminLoginHandler implements ICommandHandler<AdminLoginCommand> {
  constructor(
    private readonly adminReadRepository: IAdminReadRepository,
    private readonly tokenIssuer: AdminTokenIssuer,
  ) {}

  async execute(command: AdminLoginCommand): Promise<AuthTokens> {
    const admin = await this.loadAdminByEmail(command.email);
    await this.validatePasswordMatches(command.password, admin.password);
    return this.tokenIssuer.issueTokens(admin);
  }

  private async loadAdminByEmail(email: string): Promise<Admin> {
    const admin = await this.adminReadRepository.findByEmail(email);
    if (!admin) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return admin;
  }

  private async validatePasswordMatches(
    raw: string,
    hashed: string,
  ): Promise<void> {
    const isPasswordValid = await bcrypt.compare(raw, hashed);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }
  }
}
