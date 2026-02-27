import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { RefreshTokenHandler } from '@src/auth/command/refresh-token.handler';
import { RefreshTokenCommand } from '@src/auth/command/refresh-token.command';
import { IUserReadRepository } from '@src/auth/interface/user-read-repository.interface';
import { IUserWriteRepository } from '@src/auth/interface/user-write-repository.interface';
import { User } from '@src/auth/entities/user.entity';

jest.mock('bcrypt');

describe('RefreshTokenHandler', () => {
  let handler: RefreshTokenHandler;
  let mockReadRepository: jest.Mocked<IUserReadRepository>;
  let mockWriteRepository: jest.Mocked<IUserWriteRepository>;
  let mockJwtService: jest.Mocked<Pick<JwtService, 'sign' | 'verify'>>;
  let mockConfigService: jest.Mocked<Pick<ConfigService, 'get'>>;

  const mockUser = {
    id: 1,
    email: 'user@example.com',
    password: 'hashed-password',
    name: '홍길동',
    hashedRefreshToken: 'stored-hashed-refresh-token',
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
      verify: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenHandler,
        { provide: IUserReadRepository, useValue: mockReadRepository },
        { provide: IUserWriteRepository, useValue: mockWriteRepository },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    handler = module.get(RefreshTokenHandler);

    jest.clearAllMocks();

    mockJwtService.verify.mockReturnValue({
      sub: 1,
      email: 'user@example.com',
      type: 'refresh',
    });
    mockReadRepository.findById.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-refresh-token');
    mockJwtService.sign
      .mockReturnValueOnce('new-access-token')
      .mockReturnValueOnce('new-refresh-token');
    mockWriteRepository.update.mockResolvedValue(1);
    mockConfigService.get.mockReturnValue(undefined);
  });

  it('유효한 refresh token으로 새 토큰 쌍을 반환한다', async () => {
    const command = new RefreshTokenCommand('valid-refresh-token');
    const result = await handler.execute(command);

    expect(result).toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    expect(mockJwtService.verify).toHaveBeenCalledWith(
      'valid-refresh-token',
      expect.objectContaining({ secret: undefined }),
    );
    expect(mockReadRepository.findById).toHaveBeenCalledWith(1);
    const expectedDigest = createHash('sha256')
      .update('valid-refresh-token')
      .digest('hex');
    expect(bcrypt.compare).toHaveBeenCalledWith(
      expectedDigest,
      'stored-hashed-refresh-token',
    );
    expect(mockWriteRepository.update).toHaveBeenCalledWith(1, {
      hashedRefreshToken: 'new-hashed-refresh-token',
    });
  });

  it('jwtService.verify 실패 시 UnauthorizedException을 발생시킨다', async () => {
    mockJwtService.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });

    const command = new RefreshTokenCommand('invalid-token');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(mockReadRepository.findById).not.toHaveBeenCalled();
  });

  it('type이 refresh가 아니면 UnauthorizedException을 발생시킨다', async () => {
    mockJwtService.verify.mockReturnValue({
      sub: 1,
      email: 'user@example.com',
    });

    const command = new RefreshTokenCommand('access-token-used-as-refresh');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(mockReadRepository.findById).not.toHaveBeenCalled();
  });

  it('사용자가 존재하지 않으면 UnauthorizedException을 발생시킨다', async () => {
    mockReadRepository.findById.mockResolvedValue(null);

    const command = new RefreshTokenCommand('valid-refresh-token');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('hashedRefreshToken이 null이면 UnauthorizedException을 발생시킨다', async () => {
    mockReadRepository.findById.mockResolvedValue({
      ...mockUser,
      hashedRefreshToken: null,
    } as User);

    const command = new RefreshTokenCommand('valid-refresh-token');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('bcrypt.compare가 false면 UnauthorizedException을 발생시킨다', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const command = new RefreshTokenCommand('old-refresh-token');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(mockJwtService.sign).not.toHaveBeenCalled();
  });
});
