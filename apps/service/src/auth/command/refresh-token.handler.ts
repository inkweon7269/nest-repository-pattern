import { createHash } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { RefreshTokenCommand } from './refresh-token.command';
import { IUserReadRepository } from '@service/auth/interface/user-read-repository.interface';
import { AuthTokenIssuer } from '@service/auth/auth-token-issuer.service';
import { AuthTokens } from '@app/shared';

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler implements ICommandHandler<RefreshTokenCommand> {
  constructor(
    private readonly userReadRepository: IUserReadRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenIssuer: AuthTokenIssuer,
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

    const tokenDigest = createHash('sha256')
      .update(command.refreshToken)
      .digest('hex');
    const isRefreshTokenValid = await bcrypt.compare(
      tokenDigest,
      user.hashedRefreshToken,
    );
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return this.tokenIssuer.issueTokens(user);
  }
}
