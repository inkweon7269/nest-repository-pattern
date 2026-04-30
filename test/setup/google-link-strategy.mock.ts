import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions } from 'passport-google-oauth20';
import type { Request } from 'express';
import type { GoogleProfilePayload } from '@service/auth/strategy/google-profile.type';
import {
  GOOGLE_LINK_STATE_TYPE,
  GoogleLinkValidatePayload,
} from '@service/auth/strategy/google-link.strategy';

interface StateClaims {
  sub: number;
  type: string;
}

/**
 * Google Link 통합 테스트용 Mock Strategy.
 *
 * 시작 라우트(POST /v1/auth/google/link)는 GoogleLinkInitiator 서비스가 백엔드에서
 * authorizationUrl만 만들어 JSON으로 반환하므로 passport authenticate가 호출되지 않는다.
 * 따라서 본 mock은 콜백 라우트(/link/callback) 한 가지만 시뮬레이션한다:
 *   - MockGoogleLinkStrategy.profile + req.query.state 토큰을
 *     JwtService로 직접 검증하여 success({ userId, profile }) 호출.
 *
 * 실제 Google API 호출만 끊고, JWT 검증/state 흐름은 운영 코드와 동일하게 동작.
 */
@Injectable()
export class MockGoogleLinkStrategy extends PassportStrategy(
  Strategy,
  'google-link',
) {
  static profile: GoogleProfilePayload | null = null;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    super({
      clientID: 'mock-link-client-id',
      clientSecret: 'mock-link-client-secret',
      callbackURL: 'http://localhost/link-callback',
      state: false,
    } as StrategyOptions);
  }

  validate(): GoogleLinkValidatePayload {
    // authenticate()를 직접 오버라이드하여 success를 호출하므로 호출되지 않음.
    throw new Error('MockGoogleLinkStrategy.validate should not be invoked');
  }

  authenticate(req: Request): void {
    if (!MockGoogleLinkStrategy.profile) {
      this.fail({ message: 'No profile injected' }, 401);
      return;
    }

    const stateToken = req.query?.state;
    if (typeof stateToken !== 'string' || !stateToken) {
      this.fail({ message: 'state 토큰 누락' }, 401);
      return;
    }

    let payload: StateClaims;
    try {
      payload = this.jwtService.verify<StateClaims>(stateToken, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      this.fail({ message: 'state 토큰 무효' }, 401);
      return;
    }

    if (payload.type !== GOOGLE_LINK_STATE_TYPE) {
      this.fail({ message: 'state 토큰 type 불일치' }, 401);
      return;
    }

    const result: GoogleLinkValidatePayload = {
      userId: payload.sub,
      profile: MockGoogleLinkStrategy.profile,
    };
    this.success(result);
  }
}
