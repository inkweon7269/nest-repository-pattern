import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { GoogleLoginHandler } from './google-login.handler';
import { GoogleLoginCommand } from './google-login.command';
import { IUserReadRepository } from '@service/auth/interface/user-read-repository.interface';
import { IUserWriteRepository } from '@service/auth/interface/user-write-repository.interface';
import { IOAuthAccountReadRepository } from '@service/auth/interface/oauth-account-read-repository.interface';
import { IOAuthAccountWriteRepository } from '@service/auth/interface/oauth-account-write-repository.interface';
import { AuthTokenIssuer } from '@service/auth/auth-token-issuer.service';
import { GoogleProfilePayload } from '@service/auth/strategy/google-profile.type';
import { OAuthAccount, User } from '@app/shared';

jest.mock('bcrypt');
// 단위 테스트는 실 DataSource를 부트스트랩하지 않으므로 `@Transactional()`을
// 트랜잭션 컨텍스트 초기화 없이 통과시키도록 no-op으로 치환한다. 트랜잭션 의미는
// 통합 테스트에서 검증한다.
jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

describe('GoogleLoginHandler', () => {
  let handler: GoogleLoginHandler;
  let userReadRepository: Mocked<IUserReadRepository>;
  let userWriteRepository: Mocked<IUserWriteRepository>;
  let oauthReadRepository: Mocked<IOAuthAccountReadRepository>;
  let oauthWriteRepository: Mocked<IOAuthAccountWriteRepository>;
  let tokenIssuer: Mocked<AuthTokenIssuer>;

  const validProfile: GoogleProfilePayload = {
    providerId: 'google-sub-123',
    email: 'newuser@example.com',
    emailVerified: true,
    displayName: '홍길동',
  };

  const mockUser = {
    id: 7,
    email: 'newuser@example.com',
    password: 'hashed-secret',
    name: '홍길동',
    hashedRefreshToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  beforeEach(async () => {
    jest.clearAllMocks();

    const { unit, unitRef } =
      await TestBed.solitary(GoogleLoginHandler).compile();

    handler = unit;
    userReadRepository = unitRef.get<IUserReadRepository>(
      IUserReadRepository as Type<IUserReadRepository>,
    );
    userWriteRepository = unitRef.get<IUserWriteRepository>(
      IUserWriteRepository as Type<IUserWriteRepository>,
    );
    oauthReadRepository = unitRef.get<IOAuthAccountReadRepository>(
      IOAuthAccountReadRepository as Type<IOAuthAccountReadRepository>,
    );
    oauthWriteRepository = unitRef.get<IOAuthAccountWriteRepository>(
      IOAuthAccountWriteRepository as Type<IOAuthAccountWriteRepository>,
    );
    tokenIssuer = unitRef.get(AuthTokenIssuer);

    tokenIssuer.issueTokens.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-random-secret');
  });

  it('emailVerified가 false면 UnauthorizedException을 발생시킨다', async () => {
    const command = new GoogleLoginCommand({
      ...validProfile,
      emailVerified: false,
    });

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(oauthReadRepository.findByProviderId).not.toHaveBeenCalled();
  });

  it('연결된 OAuthAccount가 있으면 해당 사용자로 토큰을 발급한다', async () => {
    oauthReadRepository.findByProviderId.mockResolvedValue({
      userId: 7,
      provider: 'google',
      providerId: 'google-sub-123',
    } as OAuthAccount);
    userReadRepository.findById.mockResolvedValue(mockUser);

    const result = await handler.execute(new GoogleLoginCommand(validProfile));

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(userReadRepository.findById).toHaveBeenCalledWith(7);
    expect(tokenIssuer.issueTokens).toHaveBeenCalledWith(mockUser);
    expect(userWriteRepository.create).not.toHaveBeenCalled();
    expect(oauthWriteRepository.create).not.toHaveBeenCalled();
  });

  it('OAuthAccount가 가리키는 User가 사라졌으면 NotFoundException을 발생시킨다', async () => {
    oauthReadRepository.findByProviderId.mockResolvedValue({
      userId: 999,
      provider: 'google',
      providerId: 'google-sub-123',
    } as OAuthAccount);
    userReadRepository.findById.mockResolvedValue(null);

    await expect(
      handler.execute(new GoogleLoginCommand(validProfile)),
    ).rejects.toThrow(NotFoundException);
    expect(tokenIssuer.issueTokens).not.toHaveBeenCalled();
  });

  it('OAuthAccount는 없지만 동일 이메일 User가 있으면 ConflictException을 발생시킨다', async () => {
    oauthReadRepository.findByProviderId.mockResolvedValue(null);
    userReadRepository.findByEmail.mockResolvedValue(mockUser);

    await expect(
      handler.execute(new GoogleLoginCommand(validProfile)),
    ).rejects.toThrow(ConflictException);
    expect(userWriteRepository.create).not.toHaveBeenCalled();
    expect(oauthWriteRepository.create).not.toHaveBeenCalled();
  });

  it('신규 가입 시 무작위 시크릿 비밀번호로 User와 OAuthAccount를 생성하고 토큰을 발급한다', async () => {
    oauthReadRepository.findByProviderId.mockResolvedValue(null);
    userReadRepository.findByEmail.mockResolvedValue(null);
    userWriteRepository.create.mockResolvedValue(mockUser);
    oauthWriteRepository.create.mockResolvedValue({} as OAuthAccount);

    const result = await handler.execute(new GoogleLoginCommand(validProfile));

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(bcrypt.hash).toHaveBeenCalledWith(expect.any(String), 10);
    const hashedArg = (bcrypt.hash as jest.Mock).mock.calls[0][0] as string;
    expect(hashedArg).toHaveLength(64); // 32 bytes hex
    expect(userWriteRepository.create).toHaveBeenCalledWith({
      email: 'newuser@example.com',
      password: 'hashed-random-secret',
      name: '홍길동',
    });
    expect(oauthWriteRepository.create).toHaveBeenCalledWith({
      userId: 7,
      provider: 'google',
      providerId: 'google-sub-123',
      providerEmail: 'newuser@example.com',
      emailVerified: true,
    });
    expect(tokenIssuer.issueTokens).toHaveBeenCalledWith(mockUser);
  });
});
