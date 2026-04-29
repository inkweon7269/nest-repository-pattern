import { createHash, randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthTokens, User } from '@app/shared';
import { IUserWriteRepository } from '@service/auth/interface/user-write-repository.interface';

@Injectable()
export class AuthTokenIssuer {
  constructor(
    private readonly userWriteRepository: IUserWriteRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async issueTokens(user: User): Promise<AuthTokens> {
    const payload = { sub: user.id, email: user.email };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRATION', '15m'),
    } as JwtSignOptions);

    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh', jti: randomUUID() },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRATION',
          '7d',
        ),
      } as JwtSignOptions,
    );

    const tokenDigest = createHash('sha256').update(refreshToken).digest('hex');
    const hashedRefreshToken = await bcrypt.hash(tokenDigest, 10);
    await this.userWriteRepository.update(user.id, { hashedRefreshToken });

    return { accessToken, refreshToken };
  }
}
