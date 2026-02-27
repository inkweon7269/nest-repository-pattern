import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { RefreshTokenCommand } from '@src/auth/command/refresh-token.command';
import { IUserReadRepository } from '@src/auth/interface/user-read-repository.interface';
import { IUserWriteRepository } from '@src/auth/interface/user-write-repository.interface';
import { AuthTokens } from '@src/auth/auth.types';

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler
  implements ICommandHandler<RefreshTokenCommand>
{
  constructor(
    private readonly userReadRepository: IUserReadRepository,
    private readonly userWriteRepository: IUserWriteRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async execute(command: RefreshTokenCommand): Promise<AuthTokens> {
    let payload: { sub: number; email: string; type?: string };
    try {
      payload = this.jwtService.verify(command.refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userReadRepository.findById(payload.sub);
    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      command.refreshToken,
      user.hashedRefreshToken,
    );
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const newPayload = { sub: user.id, email: user.email };

    const accessToken = this.jwtService.sign(newPayload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>(
        'JWT_ACCESS_EXPIRATION',
        '15m',
      ),
    });

    const refreshToken = this.jwtService.sign(
      { ...newPayload, type: 'refresh' },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRATION',
          '7d',
        ),
      },
    );

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.userWriteRepository.update(user.id, { hashedRefreshToken });

    return { accessToken, refreshToken };
  }
}
