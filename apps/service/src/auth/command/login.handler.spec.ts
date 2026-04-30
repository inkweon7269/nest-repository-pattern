import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { LoginHandler } from './login.handler';
import { LoginCommand } from './login.command';
import { IUserReadRepository } from '@service/auth/interface/user-read-repository.interface';
import { AuthTokenIssuer } from '@service/auth/auth-token-issuer.service';
import { User } from '@app/shared';

jest.mock('bcrypt');

describe('LoginHandler', () => {
  let handler: LoginHandler;
  let userReadRepository: Mocked<IUserReadRepository>;
  let tokenIssuer: Mocked<AuthTokenIssuer>;

  const mockUser = {
    id: 1,
    email: 'user@example.com',
    password: 'hashed-password',
    name: '홍길동',
    hashedRefreshToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  beforeEach(async () => {
    jest.clearAllMocks();

    const { unit, unitRef } = await TestBed.solitary(LoginHandler).compile();

    handler = unit;
    userReadRepository = unitRef.get<IUserReadRepository>(
      IUserReadRepository as Type<IUserReadRepository>,
    );
    tokenIssuer = unitRef.get(AuthTokenIssuer);

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    tokenIssuer.issueTokens.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
  });

  it('유효한 이메일과 비밀번호면 AuthTokenIssuer로 위임하여 토큰 쌍을 반환한다', async () => {
    userReadRepository.findByEmail.mockResolvedValue(mockUser);

    const command = new LoginCommand('user@example.com', 'password123');
    const result = await handler.execute(command);

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(bcrypt.compare).toHaveBeenCalledWith(
      'password123',
      'hashed-password',
    );
    expect(tokenIssuer.issueTokens).toHaveBeenCalledWith(mockUser);
  });

  it('존재하지 않는 이메일이면 UnauthorizedException을 발생시킨다', async () => {
    userReadRepository.findByEmail.mockResolvedValue(null);

    const command = new LoginCommand('nobody@example.com', 'password123');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(tokenIssuer.issueTokens).not.toHaveBeenCalled();
  });

  it('비밀번호가 틀리면 UnauthorizedException을 발생시킨다', async () => {
    userReadRepository.findByEmail.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const command = new LoginCommand('user@example.com', 'wrongpassword');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(tokenIssuer.issueTokens).not.toHaveBeenCalled();
  });
});
