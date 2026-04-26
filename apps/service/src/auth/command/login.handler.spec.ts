import { TestBed, type Mocked } from '@suites/unit';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { LoginHandler } from './login.handler';
import { LoginCommand } from './login.command';
import { IUserReadRepository } from '@service/auth/interface/user-read-repository.interface';
import { IUserWriteRepository } from '@service/auth/interface/user-write-repository.interface';
import { User } from '@app/shared';

jest.mock('bcrypt');

describe('LoginHandler', () => {
  let handler: LoginHandler;
  let userReadRepository: Mocked<IUserReadRepository>;
  let userWriteRepository: Mocked<IUserWriteRepository>;
  let jwtService: Mocked<JwtService>;
  let configService: Mocked<ConfigService>;

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
    userReadRepository = unitRef.get(IUserReadRepository);
    userWriteRepository = unitRef.get(IUserWriteRepository);
    jwtService = unitRef.get(JwtService);
    configService = unitRef.get(ConfigService);

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh-token');
    jwtService.sign
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');
    configService.get.mockImplementation((key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
      return undefined;
    });
  });

  it('유효한 이메일과 비밀번호로 토큰 쌍을 반환한다', async () => {
    userReadRepository.findByEmail.mockResolvedValue(mockUser);
    userWriteRepository.update.mockResolvedValue(1);

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
    expect(jwtService.sign).toHaveBeenCalledTimes(2);
    expect(jwtService.sign).toHaveBeenNthCalledWith(
      1,
      { sub: 1, email: 'user@example.com' },
      expect.objectContaining({ secret: 'test-access-secret' }),
    );
    expect(jwtService.sign).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sub: 1,
        email: 'user@example.com',
        type: 'refresh',
        jti: expect.any(String),
      }),
      expect.objectContaining({ secret: 'test-refresh-secret' }),
    );
    const expectedDigest = createHash('sha256')
      .update('refresh-token')
      .digest('hex');
    expect(bcrypt.hash).toHaveBeenCalledWith(expectedDigest, 10);
    expect(userWriteRepository.update).toHaveBeenCalledWith(1, {
      hashedRefreshToken: 'hashed-refresh-token',
    });
  });

  it('존재하지 않는 이메일이면 UnauthorizedException을 발생시킨다', async () => {
    userReadRepository.findByEmail.mockResolvedValue(null);

    const command = new LoginCommand('nobody@example.com', 'password123');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('비밀번호가 틀리면 UnauthorizedException을 발생시킨다', async () => {
    userReadRepository.findByEmail.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const command = new LoginCommand('user@example.com', 'wrongpassword');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(jwtService.sign).not.toHaveBeenCalled();
  });
});
