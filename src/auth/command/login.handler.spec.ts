import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { LoginHandler } from '@src/auth/command/login.handler';
import { LoginCommand } from '@src/auth/command/login.command';
import { IUserReadRepository } from '@src/auth/interface/user-read-repository.interface';
import { IUserWriteRepository } from '@src/auth/interface/user-write-repository.interface';
import { User } from '@src/auth/entities/user.entity';

jest.mock('bcrypt');

describe('LoginHandler', () => {
  let handler: LoginHandler;
  let mockReadRepository: jest.Mocked<IUserReadRepository>;
  let mockWriteRepository: jest.Mocked<IUserWriteRepository>;
  let mockJwtService: jest.Mocked<Pick<JwtService, 'sign'>>;
  let mockConfigService: jest.Mocked<Pick<ConfigService, 'get'>>;

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
    mockReadRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
    };

    mockWriteRepository = {
      create: jest.fn(),
      update: jest.fn(),
    };

    mockJwtService = {
      sign: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginHandler,
        { provide: IUserReadRepository, useValue: mockReadRepository },
        { provide: IUserWriteRepository, useValue: mockWriteRepository },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    handler = module.get(LoginHandler);

    jest.clearAllMocks();

    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh-token');
    mockJwtService.sign
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
      return undefined;
    });
  });

  it('유효한 이메일과 비밀번호로 토큰 쌍을 반환한다', async () => {
    mockReadRepository.findByEmail.mockResolvedValue(mockUser);
    mockWriteRepository.update.mockResolvedValue(1);

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
    expect(mockJwtService.sign).toHaveBeenCalledTimes(2);
    expect(mockJwtService.sign).toHaveBeenNthCalledWith(
      1,
      { sub: 1, email: 'user@example.com' },
      expect.objectContaining({ secret: 'test-access-secret' }),
    );
    expect(mockJwtService.sign).toHaveBeenNthCalledWith(
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
    expect(mockWriteRepository.update).toHaveBeenCalledWith(1, {
      hashedRefreshToken: 'hashed-refresh-token',
    });
  });

  it('존재하지 않는 이메일이면 UnauthorizedException을 발생시킨다', async () => {
    mockReadRepository.findByEmail.mockResolvedValue(null);

    const command = new LoginCommand('nobody@example.com', 'password123');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('비밀번호가 틀리면 UnauthorizedException을 발생시킨다', async () => {
    mockReadRepository.findByEmail.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const command = new LoginCommand('user@example.com', 'wrongpassword');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(mockJwtService.sign).not.toHaveBeenCalled();
  });
});
