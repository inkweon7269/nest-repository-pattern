import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AdminRefreshTokenHandler } from './admin-refresh-token.handler';
import { AdminRefreshTokenCommand } from './admin-refresh-token.command';
import { IAdminReadRepository } from '@back-office/auth/interface/admin-read-repository.interface';
import { AdminTokenIssuer } from '@back-office/auth/admin-token-issuer.service';
import { Admin, AdminRole } from '@app/shared';

jest.mock('bcrypt');

describe('AdminRefreshTokenHandler', () => {
  let handler: AdminRefreshTokenHandler;
  let adminReadRepository: Mocked<IAdminReadRepository>;
  let jwtService: Mocked<JwtService>;
  let configService: Mocked<ConfigService>;
  let tokenIssuer: Mocked<AdminTokenIssuer>;

  const mockAdmin = {
    id: 1,
    email: 'admin@example.com',
    password: 'hashed-password',
    name: '관리자',
    role: AdminRole.MANAGER,
    hashedRefreshToken: 'stored-hashed-refresh-token',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Admin;

  beforeEach(async () => {
    jest.clearAllMocks();

    const { unit, unitRef } = await TestBed.solitary(
      AdminRefreshTokenHandler,
    ).compile();

    handler = unit;
    adminReadRepository = unitRef.get<IAdminReadRepository>(
      IAdminReadRepository as Type<IAdminReadRepository>,
    );
    jwtService = unitRef.get(JwtService);
    configService = unitRef.get(ConfigService);
    tokenIssuer = unitRef.get(AdminTokenIssuer);

    jwtService.verify.mockReturnValue({
      sub: 1,
      email: 'admin@example.com',
      role: AdminRole.MANAGER,
      type: 'refresh',
    });
    adminReadRepository.findById.mockResolvedValue(mockAdmin);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    tokenIssuer.issueTokens.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    configService.getOrThrow.mockReturnValue('test-admin-refresh-secret');
  });

  it('유효한 refresh token이면 AdminTokenIssuer로 위임하여 새 토큰 쌍을 반환한다', async () => {
    const command = new AdminRefreshTokenCommand('valid-refresh-token');
    const result = await handler.execute(command);

    expect(result).toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    expect(jwtService.verify).toHaveBeenCalledWith(
      'valid-refresh-token',
      expect.objectContaining({ secret: 'test-admin-refresh-secret' }),
    );
    expect(adminReadRepository.findById).toHaveBeenCalledWith(1);
    const expectedDigest = createHash('sha256')
      .update('valid-refresh-token')
      .digest('hex');
    expect(bcrypt.compare).toHaveBeenCalledWith(
      expectedDigest,
      'stored-hashed-refresh-token',
    );
    expect(tokenIssuer.issueTokens).toHaveBeenCalledWith(mockAdmin);
  });

  it('jwtService.verify 실패 시 UnauthorizedException을 발생시킨다', async () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });

    const command = new AdminRefreshTokenCommand('invalid-token');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(adminReadRepository.findById).not.toHaveBeenCalled();
    expect(tokenIssuer.issueTokens).not.toHaveBeenCalled();
  });

  it('type이 refresh가 아니면 UnauthorizedException을 발생시킨다', async () => {
    jwtService.verify.mockReturnValue({
      sub: 1,
      email: 'admin@example.com',
      role: AdminRole.MANAGER,
    });

    const command = new AdminRefreshTokenCommand(
      'access-token-used-as-refresh',
    );

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(adminReadRepository.findById).not.toHaveBeenCalled();
    expect(tokenIssuer.issueTokens).not.toHaveBeenCalled();
  });

  it('관리자가 존재하지 않으면 UnauthorizedException을 발생시킨다', async () => {
    adminReadRepository.findById.mockResolvedValue(null);

    const command = new AdminRefreshTokenCommand('valid-refresh-token');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(tokenIssuer.issueTokens).not.toHaveBeenCalled();
  });

  it('hashedRefreshToken이 null이면 UnauthorizedException을 발생시킨다', async () => {
    adminReadRepository.findById.mockResolvedValue({
      ...mockAdmin,
      hashedRefreshToken: null,
    } as Admin);

    const command = new AdminRefreshTokenCommand('valid-refresh-token');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(tokenIssuer.issueTokens).not.toHaveBeenCalled();
  });

  it('bcrypt.compare가 false면 UnauthorizedException을 발생시킨다', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const command = new AdminRefreshTokenCommand('old-refresh-token');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(tokenIssuer.issueTokens).not.toHaveBeenCalled();
  });
});
