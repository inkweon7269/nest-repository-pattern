import { createHash, randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Admin, AuthTokens, BCRYPT_SALT_ROUNDS } from '@app/shared';
import { IAdminWriteRepository } from '@back-office/auth/interface/admin-write-repository.interface';

@Injectable()
export class AdminTokenIssuer {
  constructor(
    private readonly adminWriteRepository: IAdminWriteRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async issueTokens(admin: Admin): Promise<AuthTokens> {
    const accessToken = this.generateAccessToken(admin);
    const refreshToken = this.generateRefreshToken(admin);
    await this.persistRefreshTokenDigest(admin.id, refreshToken);

    return { accessToken, refreshToken };
  }

  private generateAccessToken(admin: Admin): string {
    const payload = { sub: admin.id, email: admin.email, role: admin.role };
    return this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ADMIN_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>(
        'JWT_ADMIN_ACCESS_EXPIRATION',
        '15m',
      ),
    } as JwtSignOptions);
  }

  private generateRefreshToken(admin: Admin): string {
    const payload = { sub: admin.id, email: admin.email, role: admin.role };
    return this.jwtService.sign(
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
  }

  private async persistRefreshTokenDigest(
    adminId: number,
    refreshToken: string,
  ): Promise<void> {
    const tokenDigest = createHash('sha256').update(refreshToken).digest('hex');
    const hashedRefreshToken = await bcrypt.hash(
      tokenDigest,
      BCRYPT_SALT_ROUNDS,
    );
    await this.adminWriteRepository.update(adminId, { hashedRefreshToken });
  }
}
