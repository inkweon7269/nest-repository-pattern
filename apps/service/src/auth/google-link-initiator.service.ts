import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { GOOGLE_LINK_STATE_TYPE } from '@service/auth/strategy/google-link.strategy';

/**
 * Google 계정 link 시작 시 다음을 수행한다.
 *  1) 사용자 ID를 인코딩한 signed state JWT 발행 (5분 만료)
 *  2) Google OAuth 2.0 authorization endpoint URL 빌드 (state 포함)
 *
 * 컨트롤러는 이 URL을 JSON으로 반환하고, 프론트는 window.location.href로 이동시킨다.
 *
 * 콜백 라우트는 GoogleLinkStrategy.validate()에서 동일 secret으로 state를 검증해
 * userId를 복원한다.
 */
@Injectable()
export class GoogleLinkInitiator {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  buildAuthorizationUrl(userId: number): string {
    const stateToken = this.jwtService.sign(
      { sub: userId, type: GOOGLE_LINK_STATE_TYPE, jti: randomUUID() },
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '5m',
      },
    );

    const params = new URLSearchParams({
      client_id: this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      redirect_uri: this.configService.getOrThrow<string>(
        'GOOGLE_LINK_CALLBACK_URL',
      ),
      response_type: 'code',
      scope: 'openid email profile',
      state: stateToken,
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
}
