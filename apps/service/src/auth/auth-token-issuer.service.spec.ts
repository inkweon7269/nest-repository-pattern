import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AuthTokenIssuer } from './auth-token-issuer.service';
import { IUserWriteRepository } from '@service/auth/interface/user-write-repository.interface';
import { User } from '@app/shared';

jest.mock('bcrypt');

describe('AuthTokenIssuer', () => {
  let service: AuthTokenIssuer;
  let userWriteRepository: Mocked<IUserWriteRepository>;
  let jwtService: Mocked<JwtService>;
  let configService: Mocked<ConfigService>;

  const mockUser = {
    id: 42,
    email: 'user@example.com',
    password: 'hashed-password',
    name: '홍길동',
    hashedRefreshToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  beforeEach(async () => {
    jest.clearAllMocks();

    const { unit, unitRef } = await TestBed.solitary(AuthTokenIssuer).compile();

    service = unit;
    userWriteRepository = unitRef.get<IUserWriteRepository>(
      IUserWriteRepository as Type<IUserWriteRepository>,
    );
    jwtService = unitRef.get(JwtService);
    configService = unitRef.get(ConfigService);

    jwtService.sign
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh-token');
    userWriteRepository.update.mockResolvedValue(1);
    configService.get.mockImplementation(
      (key: string, defaultValue?: string) => {
        if (key === 'JWT_ACCESS_EXPIRATION') return defaultValue ?? '15m';
        if (key === 'JWT_REFRESH_EXPIRATION') return defaultValue ?? '7d';
        return defaultValue;
      },
    );
    configService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
      throw new Error(`Unexpected getOrThrow key: ${key}`);
    });
  });

  it('access/refresh 토큰을 발급하고 hashedRefreshToken을 저장한다', async () => {
    const result = await service.issueTokens(mockUser);

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(jwtService.sign).toHaveBeenCalledTimes(2);
    expect(jwtService.sign).toHaveBeenNthCalledWith(
      1,
      { sub: 42, email: 'user@example.com' },
      expect.objectContaining({
        secret: 'test-access-secret',
        expiresIn: '15m',
      }),
    );
    expect(jwtService.sign).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sub: 42,
        email: 'user@example.com',
        type: 'refresh',
        jti: expect.any(String),
      }),
      expect.objectContaining({
        secret: 'test-refresh-secret',
        expiresIn: '7d',
      }),
    );

    const expectedDigest = createHash('sha256')
      .update('refresh-token')
      .digest('hex');
    expect(bcrypt.hash).toHaveBeenCalledWith(expectedDigest, 10);
    expect(userWriteRepository.update).toHaveBeenCalledWith(42, {
      hashedRefreshToken: 'hashed-refresh-token',
    });
  });

  it('refresh 토큰의 jti는 호출마다 고유해야 한다', async () => {
    jwtService.sign.mockReset();
    jwtService.sign
      .mockReturnValueOnce('a1')
      .mockReturnValueOnce('r1')
      .mockReturnValueOnce('a2')
      .mockReturnValueOnce('r2');

    await service.issueTokens(mockUser);
    await service.issueTokens(mockUser);

    const firstCall = jwtService.sign.mock.calls[1][0] as { jti: string };
    const secondCall = jwtService.sign.mock.calls[3][0] as { jti: string };
    expect(firstCall.jti).not.toEqual(secondCall.jti);
  });
});
