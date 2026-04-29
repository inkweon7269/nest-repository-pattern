import { randomUUID } from 'crypto';
import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard, IAuthModuleOptions } from '@nestjs/passport';
import type { Request } from 'express';
import type { AuthUser } from '@service/auth/decorator/auth-user.type';
import { GOOGLE_LINK_STATE_TYPE } from '@service/auth/strategy/google-link.strategy';

/**
 * Google 계정 link 시작 라우트(`GET /v1/auth/google/link`)에 적용한다.
 * JwtAuthGuard로 인증된 사용자의 ID를 signed JWT(state)로 인코딩하여
 * passport-google-oauth20의 `state` 파라미터로 전달한다.
 *
 * 콜백 라우트는 GoogleLinkStrategy.validate()에서 동일 secret으로 state를 검증하여
 * userId를 복원한다.
 */
@Injectable()
export class GoogleLinkInitGuard extends AuthGuard('google-link') {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext): IAuthModuleOptions {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as AuthUser | undefined;
    if (!user?.id) {
      throw new UnauthorizedException('인증되지 않은 요청');
    }

    const stateToken = this.jwtService.sign(
      { sub: user.id, type: GOOGLE_LINK_STATE_TYPE, jti: randomUUID() },
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '5m',
      },
    );

    return { state: stateToken } as IAuthModuleOptions;
  }
}
