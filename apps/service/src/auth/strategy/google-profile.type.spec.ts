import { UnauthorizedException } from '@nestjs/common';
import { Profile } from 'passport-google-oauth20';
import { toGoogleProfilePayload } from './google-profile.type';

describe('toGoogleProfilePayload', () => {
  const baseProfile = {
    id: 'google-sub-123',
    displayName: '홍길동',
    emails: [{ value: 'user@example.com', verified: true }],
  } as unknown as Profile;

  it('Profile을 GoogleProfilePayload로 변환한다', () => {
    const result = toGoogleProfilePayload(baseProfile);

    expect(result).toEqual({
      providerId: 'google-sub-123',
      email: 'user@example.com',
      emailVerified: true,
      displayName: '홍길동',
    });
  });

  it('emailVerified가 false인 경우 false로 매핑한다', () => {
    const profile = {
      ...baseProfile,
      emails: [{ value: 'user@example.com', verified: false }],
    } as unknown as Profile;

    expect(toGoogleProfilePayload(profile).emailVerified).toBe(false);
  });

  it('emailVerified가 누락되면 false로 매핑한다', () => {
    const profile = {
      ...baseProfile,
      emails: [{ value: 'user@example.com' }],
    } as unknown as Profile;

    expect(toGoogleProfilePayload(profile).emailVerified).toBe(false);
  });

  it('emails가 비어 있으면 UnauthorizedException을 발생시킨다', () => {
    const profile = { ...baseProfile, emails: [] } as unknown as Profile;
    expect(() => toGoogleProfilePayload(profile)).toThrow(
      UnauthorizedException,
    );
  });

  it('emails가 undefined이면 UnauthorizedException을 발생시킨다', () => {
    const profile = {
      ...baseProfile,
      emails: undefined,
    } as unknown as Profile;
    expect(() => toGoogleProfilePayload(profile)).toThrow(
      UnauthorizedException,
    );
  });
});
