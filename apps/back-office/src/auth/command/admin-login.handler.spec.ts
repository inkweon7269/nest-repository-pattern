import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AdminLoginHandler } from './admin-login.handler';
import { AdminLoginCommand } from './admin-login.command';
import { IAdminReadRepository } from '@back-office/auth/interface/admin-read-repository.interface';
import { AdminTokenIssuer } from '@back-office/auth/admin-token-issuer.service';
import { Admin, AdminRole } from '@app/shared';

jest.mock('bcrypt');

describe('AdminLoginHandler', () => {
  let handler: AdminLoginHandler;
  let adminReadRepository: Mocked<IAdminReadRepository>;
  let tokenIssuer: Mocked<AdminTokenIssuer>;

  const mockAdmin = {
    id: 1,
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
      await TestBed.solitary(AdminLoginHandler).compile();

    handler = unit;
    adminReadRepository = unitRef.get<IAdminReadRepository>(
      IAdminReadRepository as Type<IAdminReadRepository>,
    );
    tokenIssuer = unitRef.get(AdminTokenIssuer);

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    tokenIssuer.issueTokens.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
  });

  it('유효한 이메일과 비밀번호면 AdminTokenIssuer로 위임하여 토큰 쌍을 반환한다', async () => {
    adminReadRepository.findByEmail.mockResolvedValue(mockAdmin);

    const command = new AdminLoginCommand('admin@example.com', 'password123');
    const result = await handler.execute(command);

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(bcrypt.compare).toHaveBeenCalledWith(
      'password123',
      'hashed-password',
    );
    expect(tokenIssuer.issueTokens).toHaveBeenCalledWith(mockAdmin);
  });

  it('존재하지 않는 이메일이면 UnauthorizedException을 발생시킨다', async () => {
    adminReadRepository.findByEmail.mockResolvedValue(null);

    const command = new AdminLoginCommand('nobody@example.com', 'password123');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(tokenIssuer.issueTokens).not.toHaveBeenCalled();
  });

  it('비밀번호가 틀리면 UnauthorizedException을 발생시킨다', async () => {
    adminReadRepository.findByEmail.mockResolvedValue(mockAdmin);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const command = new AdminLoginCommand('admin@example.com', 'wrongpassword');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(tokenIssuer.issueTokens).not.toHaveBeenCalled();
  });
});
