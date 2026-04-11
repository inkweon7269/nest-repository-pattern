import { createHash, randomUUID } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AdminRefreshTokenCommand } from '@src/admin/auth/command/admin-refresh-token.command';
import { IAdminReadRepository } from '@src/admin/interface/admin-read-repository.interface';
import { IAdminWriteRepository } from '@src/admin/interface/admin-write-repository.interface';
import { AdminRole } from '@src/admin/enum/admin-role.enum';
import { AuthTokens } from '@src/auth/auth.types';

@CommandHandler(AdminRefreshTokenCommand)
export class AdminRefreshTokenHandler implements ICommandHandler<AdminRefreshTokenCommand> {
  constructor(
    private readonly adminReadRepository: IAdminReadRepository,
    private readonly adminWriteRepository: IAdminWriteRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async execute(command: AdminRefreshTokenCommand): Promise<AuthTokens> {
    let payload: {
      sub: number;
      email: string;
      role?: AdminRole;
      type?: string;
    };
    try {
      payload = this.jwtService.verify(command.refreshToken, {
        secret: this.configService.get<string>('JWT_ADMIN_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const admin = await this.adminReadRepository.findById(payload.sub);
    if (!admin || !admin.hashedRefreshToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenDigest = createHash('sha256')
      .update(command.refreshToken)
      .digest('hex');
    const isRefreshTokenValid = await bcrypt.compare(
      tokenDigest,
      admin.hashedRefreshToken,
    );
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const newPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
    };

    const accessToken = this.jwtService.sign(newPayload, {
      secret: this.configService.get<string>('JWT_ADMIN_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>(
        'JWT_ADMIN_ACCESS_EXPIRATION',
        '15m',
      ),
    } as JwtSignOptions);

    const refreshToken = this.jwtService.sign(
      { ...newPayload, type: 'refresh', jti: randomUUID() },
      {
        secret: this.configService.get<string>('JWT_ADMIN_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>(
          'JWT_ADMIN_REFRESH_EXPIRATION',
          '7d',
        ),
      } as JwtSignOptions,
    );

    const newTokenDigest = createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const hashedRefreshToken = await bcrypt.hash(newTokenDigest, 10);
    await this.adminWriteRepository.update(admin.id, { hashedRefreshToken });

    return { accessToken, refreshToken };
  }
}
