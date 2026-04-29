import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { LinkGoogleAccountHandler } from './link-google-account.handler';
import { LinkGoogleAccountCommand } from './link-google-account.command';
import { IOAuthAccountReadRepository } from '@service/auth/interface/oauth-account-read-repository.interface';
import { IOAuthAccountWriteRepository } from '@service/auth/interface/oauth-account-write-repository.interface';
import { GoogleProfilePayload } from '@service/auth/strategy/google-profile.type';
import { OAuthAccount } from '@app/shared';

describe('LinkGoogleAccountHandler', () => {
  let handler: LinkGoogleAccountHandler;
  let oauthReadRepository: Mocked<IOAuthAccountReadRepository>;
  let oauthWriteRepository: Mocked<IOAuthAccountWriteRepository>;

  const userId = 7;
  const validProfile: GoogleProfilePayload = {
    providerId: 'google-sub-123',
    email: 'user@example.com',
    emailVerified: true,
    displayName: '홍길동',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const { unit, unitRef } = await TestBed.solitary(
      LinkGoogleAccountHandler,
    ).compile();

    handler = unit;
    oauthReadRepository = unitRef.get<IOAuthAccountReadRepository>(
      IOAuthAccountReadRepository as Type<IOAuthAccountReadRepository>,
    );
    oauthWriteRepository = unitRef.get<IOAuthAccountWriteRepository>(
      IOAuthAccountWriteRepository as Type<IOAuthAccountWriteRepository>,
    );
  });

  it('정상 연결 시 oauth_accounts에 레코드를 생성한다', async () => {
    oauthReadRepository.findByProviderId.mockResolvedValue(null);
    oauthReadRepository.findByUserAndProvider.mockResolvedValue(null);
    oauthWriteRepository.create.mockResolvedValue({} as OAuthAccount);

    await handler.execute(new LinkGoogleAccountCommand(userId, validProfile));

    expect(oauthWriteRepository.create).toHaveBeenCalledWith({
      userId: 7,
      provider: 'google',
      providerId: 'google-sub-123',
      providerEmail: 'user@example.com',
      emailVerified: true,
    });
  });

  it('emailVerified가 false면 UnauthorizedException을 발생시킨다', async () => {
    const command = new LinkGoogleAccountCommand(userId, {
      ...validProfile,
      emailVerified: false,
    });

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(oauthReadRepository.findByProviderId).not.toHaveBeenCalled();
    expect(oauthWriteRepository.create).not.toHaveBeenCalled();
  });

  it('동일 Google 계정이 다른 사용자에 연결되어 있으면 ConflictException을 발생시킨다', async () => {
    oauthReadRepository.findByProviderId.mockResolvedValue({
      userId: 999,
      provider: 'google',
      providerId: 'google-sub-123',
    } as OAuthAccount);

    await expect(
      handler.execute(new LinkGoogleAccountCommand(userId, validProfile)),
    ).rejects.toThrow(ConflictException);
    expect(oauthWriteRepository.create).not.toHaveBeenCalled();
  });

  it('현재 사용자가 이미 Google 계정과 연결되어 있으면 ConflictException을 발생시킨다', async () => {
    oauthReadRepository.findByProviderId.mockResolvedValue(null);
    oauthReadRepository.findByUserAndProvider.mockResolvedValue({
      userId: 7,
      provider: 'google',
      providerId: 'other-sub',
    } as OAuthAccount);

    await expect(
      handler.execute(new LinkGoogleAccountCommand(userId, validProfile)),
    ).rejects.toThrow(ConflictException);
    expect(oauthWriteRepository.create).not.toHaveBeenCalled();
  });

  it('동일 Google 계정이 본인에게 이미 연결된 경우(providerId 일치) ConflictException을 발생시킨다', async () => {
    oauthReadRepository.findByProviderId.mockResolvedValue({
      userId: 7,
      provider: 'google',
      providerId: 'google-sub-123',
    } as OAuthAccount);
    oauthReadRepository.findByUserAndProvider.mockResolvedValue({
      userId: 7,
      provider: 'google',
      providerId: 'google-sub-123',
    } as OAuthAccount);

    await expect(
      handler.execute(new LinkGoogleAccountCommand(userId, validProfile)),
    ).rejects.toThrow(ConflictException);
    expect(oauthWriteRepository.create).not.toHaveBeenCalled();
  });
});
