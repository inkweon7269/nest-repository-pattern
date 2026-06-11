import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AdminTokenIssuer } from './admin-token-issuer.service';
import { IAdminWriteRepository } from '@back-office/auth/interface/admin-write-repository.interface';
import { Admin, AdminRole } from '@app/shared';

jest.mock('bcrypt');

describe('AdminTokenIssuer', () => {
  let service: AdminTokenIssuer;
  let adminWriteRepository: Mocked<IAdminWriteRepository>;
  let jwtService: Mocked<JwtService>;
  let configService: Mocked<ConfigService>;

  const mockAdmin = {
    id: 42,
    email: 'admin@example.com',
    password: 'hashed-password',
    name: '관리자',
    role: AdminRole.MANAGER,
    hashedRefreshToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Admin;

  beforeEach(async () => {
    jest.clearAllMocks();

    const { unit, unitRef } =
      await TestBed.solitary(AdminTokenIssuer).compile();

    service = unit;
    adminWriteRepository = unitRef.get<IAdminWriteRepository>(
      IAdminWriteRepository as Type<IAdminWriteRepository>,
    );
    jwtService = unitRef.get(JwtService);
    configService = unitRef.get(ConfigService);

    jwtService.sign
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh-token');
    adminWriteRepository.update.mockResolvedValue(1);
    (configService.get as jest.Mock).mockImplementation(
      (key: string, defaultValue?: string) => {
        if (key === 'JWT_ADMIN_ACCESS_EXPIRATION') return defaultValue ?? '15m';
        if (key === 'JWT_ADMIN_REFRESH_EXPIRATION') return defaultValue ?? '7d';
        return defaultValue;
      },
    );
    configService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'JWT_ADMIN_ACCESS_SECRET') return 'test-admin-access-secret';
      if (key === 'JWT_ADMIN_REFRESH_SECRET')
        return 'test-admin-refresh-secret';
      throw new Error(`Unexpected getOrThrow key: ${key}`);
    });
  });

  it('access/refresh 토큰을 발급하고 payload에 role을 포함하며 hashedRefreshToken을 저장한다', async () => {
    const result = await service.issueTokens(mockAdmin);

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(jwtService.sign).toHaveBeenCalledTimes(2);
    expect(jwtService.sign).toHaveBeenNthCalledWith(
      1,
      { sub: 42, email: 'admin@example.com', role: AdminRole.MANAGER },
      expect.objectContaining({
        secret: 'test-admin-access-secret',
        expiresIn: '15m',
      }),
    );
    expect(jwtService.sign).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sub: 42,
        email: 'admin@example.com',
        role: AdminRole.MANAGER,
        type: 'refresh',
        jti: expect.any(String),
      }),
      expect.objectContaining({
        secret: 'test-admin-refresh-secret',
        expiresIn: '7d',
      }),
    );

    const expectedDigest = createHash('sha256')
      .update('refresh-token')
      .digest('hex');
    expect(bcrypt.hash).toHaveBeenCalledWith(expectedDigest, 10);
    expect(adminWriteRepository.update).toHaveBeenCalledWith(42, {
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

    await service.issueTokens(mockAdmin);
    await service.issueTokens(mockAdmin);

    const firstCall = jwtService.sign.mock.calls[1][0] as { jti: string };
    const secondCall = jwtService.sign.mock.calls[3][0] as { jti: string };
    expect(firstCall.jti).not.toEqual(secondCall.jti);
  });
});
