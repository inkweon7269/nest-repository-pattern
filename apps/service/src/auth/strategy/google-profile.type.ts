import { UnauthorizedException } from '@nestjs/common';
import { Profile } from 'passport-google-oauth20';

export interface GoogleProfilePayload {
  providerId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
}

export function toGoogleProfilePayload(profile: Profile): GoogleProfilePayload {
  const email = profile.emails?.[0];
  if (!email?.value) {
    throw new UnauthorizedException('Google 이메일 누락');
  }

  return {
    providerId: profile.id,
    email: email.value,
    emailVerified: email.verified === true,
    displayName: profile.displayName,
  };
}
