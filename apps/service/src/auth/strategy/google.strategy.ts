import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, StrategyOptions } from 'passport-google-oauth20';
import {
  GoogleProfilePayload,
  toGoogleProfilePayload,
} from './google-profile.type';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
      // state: true는 express-session 기반 store가 필요. 본 프로젝트는 무세션
      // (Bearer 기반)이라 false로 두고 CSRF 방어는 짧은 수명 access token + Origin
      // 검증 등에 위임. (link 플로우는 별도 signed JWT state로 검증)
      state: false,
    } as StrategyOptions);
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): GoogleProfilePayload {
    return toGoogleProfilePayload(profile);
  }
}
