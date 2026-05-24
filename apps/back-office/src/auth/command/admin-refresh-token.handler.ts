import { createHash } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AdminRefreshTokenCommand } from './admin-refresh-token.command';
import { IAdminReadRepository } from '@back-office/auth/interface/admin-read-repository.interface';
import { AdminTokenIssuer } from '@back-office/auth/admin-token-issuer.service';
import { Admin, AdminRole, AuthTokens } from '@app/shared';

interface AdminRefreshTokenPayload {
  sub: number;
  email: string;
  role?: AdminRole;
  type?: string;
}

@CommandHandler(AdminRefreshTokenCommand)
export class AdminRefreshTokenHandler implements ICommandHandler<AdminRefreshTokenCommand> {
  constructor(
    private readonly adminReadRepository: IAdminReadRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenIssuer: AdminTokenIssuer,
  ) {}

  async execute(command: AdminRefreshTokenCommand): Promise<AuthTokens> {
    const payload = this.decodeRefreshPayloadOrUnauthorized(
      command.refreshToken,
    );
    const admin = await this.loadAdminByIdOrUnauthorized(payload.sub);
    await this.validateRefreshTokenMatches(command.refreshToken, admin);
    return this.tokenIssuer.issueTokens(admin);
  }

  private decodeRefreshPayloadOrUnauthorized(
    refreshToken: string,
  ): AdminRefreshTokenPayload {
    let payload: AdminRefreshTokenPayload;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.getOrThrow<string>(
          'JWT_ADMIN_REFRESH_SECRET',
        ),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return payload;
  }

  private async loadAdminByIdOrUnauthorized(adminId: number): Promise<Admin> {
    const admin = await this.adminReadRepository.findById(adminId);
    if (!admin) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return admin;
  }

  private async validateRefreshTokenMatches(
    refreshToken: string,
    admin: Admin,
  ): Promise<void> {
    if (!admin.hashedRefreshToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenDigest = createHash('sha256').update(refreshToken).digest('hex');
    const isRefreshTokenValid = await bcrypt.compare(
      tokenDigest,
      admin.hashedRefreshToken,
    );
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
