import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportStrategy } from '@nestjs/passport';
import {
  Profile,
  Strategy,
  StrategyOptionsWithRequest,
} from 'passport-google-oauth20';
import type { Request } from 'express';
import {
  GoogleProfilePayload,
  toGoogleProfilePayload,
} from './google-profile.type';

export interface GoogleLinkValidatePayload {
  userId: number;
  profile: GoogleProfilePayload;
}

export const GOOGLE_LINK_STATE_TYPE = 'google-link-state';

interface GoogleLinkStateClaims {
  sub: number;
  type: string;
  jti?: string;
}

@Injectable()
export class GoogleLinkStrategy extends PassportStrategy(
  Strategy,
  'google-link',
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    super({
      clientID: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('GOOGLE_LINK_CALLBACK_URL'),
      scope: ['email', 'profile'],
      state: false,
      passReqToCallback: true,
    } as StrategyOptionsWithRequest);
  }

  validate(
    req: Request,
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): GoogleLinkValidatePayload {
    const stateToken = req.query?.state;
    if (typeof stateToken !== 'string' || !stateToken) {
      throw new UnauthorizedException('state 토큰 누락');
    }

    let payload: GoogleLinkStateClaims;
    try {
      payload = this.jwtService.verify<GoogleLinkStateClaims>(stateToken, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('state 토큰이 유효하지 않거나 만료됨');
    }

    if (payload.type !== GOOGLE_LINK_STATE_TYPE) {
      throw new UnauthorizedException('state 토큰 type 불일치');
    }

    return {
      userId: payload.sub,
      profile: toGoogleProfilePayload(profile),
    };
  }
}
