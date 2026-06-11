import { createHash, randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthTokens, BCRYPT_SALT_ROUNDS, User } from '@app/shared';
import { IUserWriteRepository } from '@service/auth/interface/user-write-repository.interface';

@Injectable()
export class AuthTokenIssuer {
  constructor(
    private readonly userWriteRepository: IUserWriteRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async issueTokens(user: User): Promise<AuthTokens> {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);
    await this.persistRefreshTokenDigest(user.id, refreshToken);

    return { accessToken, refreshToken };
  }

  private generateAccessToken(user: User): string {
    const payload = { sub: user.id, email: user.email };
    return this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRATION', '15m'),
    } as JwtSignOptions);
  }

  private generateRefreshToken(user: User): string {
    const payload = { sub: user.id, email: user.email };
    return this.jwtService.sign(
      { ...payload, type: 'refresh', jti: randomUUID() },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRATION',
          '7d',
        ),
      } as JwtSignOptions,
    );
  }

  private async persistRefreshTokenDigest(
    userId: number,
    refreshToken: string,
  ): Promise<void> {
    const tokenDigest = createHash('sha256').update(refreshToken).digest('hex');
    const hashedRefreshToken = await bcrypt.hash(
      tokenDigest,
      BCRYPT_SALT_ROUNDS,
    );
    await this.userWriteRepository.update(userId, { hashedRefreshToken });
  }
}
