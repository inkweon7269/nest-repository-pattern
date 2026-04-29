import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions } from 'passport-google-oauth20';
import type { Request } from 'express';
import type { GoogleProfilePayload } from '@service/auth/strategy/google-profile.type';

/**
 * Google OAuth 통합 테스트용 Mock Strategy.
 *
 * 실제 Google과 통신하지 않고 사전 주입된 profile로 success 처리한다.
 * - 시작 라우트(/v1/auth/google)에서는 가짜 redirect URL로 응답
 * - 콜백 라우트(/callback)에서는 MockGoogleStrategy.profile을 success로 이어붙임
 *
 * 각 테스트는 beforeEach에서 `MockGoogleStrategy.profile = {...}`로 케이스 주입.
 */
@Injectable()
export class MockGoogleStrategy extends PassportStrategy(Strategy, 'google') {
  static profile: GoogleProfilePayload | null = null;

  constructor() {
    super({
      clientID: 'mock-client-id',
      clientSecret: 'mock-client-secret',
      callbackURL: 'http://localhost/callback',
      state: false,
    } as StrategyOptions);
  }

  authenticate(req: Request): void {
    if (req.url?.includes('/callback')) {
      if (!MockGoogleStrategy.profile) {
        this.fail({ message: 'No profile injected' }, 401);
        return;
      }
      this.success(MockGoogleStrategy.profile);
      return;
    }
    this.redirect('https://accounts.google.com/o/oauth2/mock-redirect');
  }
}
