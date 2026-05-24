import { createHash, randomUUID } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AdminLoginCommand } from './admin-login.command';
import { IAdminReadRepository } from '@back-office/auth/interface/admin-read-repository.interface';
import { IAdminWriteRepository } from '@back-office/auth/interface/admin-write-repository.interface';
import { AuthTokens } from '@app/shared';

@CommandHandler(AdminLoginCommand)
export class AdminLoginHandler implements ICommandHandler<AdminLoginCommand> {
  constructor(
    private readonly adminReadRepository: IAdminReadRepository,
    private readonly adminWriteRepository: IAdminWriteRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async execute(command: AdminLoginCommand): Promise<AuthTokens> {
    const admin = await this.adminReadRepository.findByEmail(command.email);
    if (!admin) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      command.password,
      admin.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = { sub: admin.id, email: admin.email, role: admin.role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ADMIN_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>(
        'JWT_ADMIN_ACCESS_EXPIRATION',
        '15m',
      ),
    } as JwtSignOptions);

    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh', jti: randomUUID() },
      {
        secret: this.configService.getOrThrow<string>(
          'JWT_ADMIN_REFRESH_SECRET',
        ),
        expiresIn: this.configService.get<string>(
          'JWT_ADMIN_REFRESH_EXPIRATION',
          '7d',
        ),
      } as JwtSignOptions,
    );

    const tokenDigest = createHash('sha256').update(refreshToken).digest('hex');
    const hashedRefreshToken = await bcrypt.hash(tokenDigest, 10);
    await this.adminWriteRepository.update(admin.id, { hashedRefreshToken });

    return { accessToken, refreshToken };
  }
}
