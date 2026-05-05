import { createHash } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { RefreshTokenCommand } from './refresh-token.command';
import { IUserReadRepository } from '@service/auth/interface/user-read-repository.interface';
import { AuthTokenIssuer } from '@service/auth/auth-token-issuer.service';
import { AuthTokens, User } from '@app/shared';

interface RefreshTokenPayload {
  sub: number;
  email: string;
  type?: string;
}

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler implements ICommandHandler<RefreshTokenCommand> {
  constructor(
    private readonly userReadRepository: IUserReadRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenIssuer: AuthTokenIssuer,
  ) {}

  async execute(command: RefreshTokenCommand): Promise<AuthTokens> {
    const payload = this.decodeRefreshPayloadOrUnauthorized(
      command.refreshToken,
    );
    const user = await this.loadUserByIdOrUnauthorized(payload.sub);
    await this.validateRefreshTokenMatches(command.refreshToken, user);
    return this.tokenIssuer.issueTokens(user);
  }

  private decodeRefreshPayloadOrUnauthorized(
    refreshToken: string,
  ): RefreshTokenPayload {
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return payload;
  }

  private async loadUserByIdOrUnauthorized(userId: number): Promise<User> {
    const user = await this.userReadRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return user;
  }

  private async validateRefreshTokenMatches(
    refreshToken: string,
    user: User,
  ): Promise<void> {
    if (!user.hashedRefreshToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenDigest = createHash('sha256').update(refreshToken).digest('hex');
    const isRefreshTokenValid = await bcrypt.compare(
      tokenDigest,
      user.hashedRefreshToken,
    );
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
