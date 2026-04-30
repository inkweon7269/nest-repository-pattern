import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { RefreshTokenHandler } from './refresh-token.handler';
import { RefreshTokenCommand } from './refresh-token.command';
import { IUserReadRepository } from '@service/auth/interface/user-read-repository.interface';
import { AuthTokenIssuer } from '@service/auth/auth-token-issuer.service';
import { User } from '@app/shared';

jest.mock('bcrypt');

describe('RefreshTokenHandler', () => {
  let handler: RefreshTokenHandler;
  let userReadRepository: Mocked<IUserReadRepository>;
  let jwtService: Mocked<JwtService>;
  let configService: Mocked<ConfigService>;
  let tokenIssuer: Mocked<AuthTokenIssuer>;

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
    jest.clearAllMocks();

    const { unit, unitRef } =
      await TestBed.solitary(RefreshTokenHandler).compile();

    handler = unit;
    userReadRepository = unitRef.get<IUserReadRepository>(
      IUserReadRepository as Type<IUserReadRepository>,
    );
    jwtService = unitRef.get(JwtService);
    configService = unitRef.get(ConfigService);
    tokenIssuer = unitRef.get(AuthTokenIssuer);

    jwtService.verify.mockReturnValue({
      sub: 1,
      email: 'user@example.com',
      type: 'refresh',
    });
    userReadRepository.findById.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    tokenIssuer.issueTokens.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    configService.get.mockReturnValue(undefined);
  });

  it('유효한 refresh token이면 AuthTokenIssuer로 위임하여 새 토큰 쌍을 반환한다', async () => {
    const command = new RefreshTokenCommand('valid-refresh-token');
    const result = await handler.execute(command);

    expect(result).toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    expect(jwtService.verify).toHaveBeenCalledWith(
      'valid-refresh-token',
      expect.objectContaining({ secret: undefined }),
    );
    expect(userReadRepository.findById).toHaveBeenCalledWith(1);
    const expectedDigest = createHash('sha256')
      .update('valid-refresh-token')
      .digest('hex');
    expect(bcrypt.compare).toHaveBeenCalledWith(
      expectedDigest,
      'stored-hashed-refresh-token',
    );
    expect(tokenIssuer.issueTokens).toHaveBeenCalledWith(mockUser);
  });

  it('jwtService.verify 실패 시 UnauthorizedException을 발생시킨다', async () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });

    const command = new RefreshTokenCommand('invalid-token');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(userReadRepository.findById).not.toHaveBeenCalled();
    expect(tokenIssuer.issueTokens).not.toHaveBeenCalled();
  });

  it('type이 refresh가 아니면 UnauthorizedException을 발생시킨다', async () => {
    jwtService.verify.mockReturnValue({
      sub: 1,
      email: 'user@example.com',
    });

    const command = new RefreshTokenCommand('access-token-used-as-refresh');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(userReadRepository.findById).not.toHaveBeenCalled();
    expect(tokenIssuer.issueTokens).not.toHaveBeenCalled();
  });

  it('사용자가 존재하지 않으면 UnauthorizedException을 발생시킨다', async () => {
    userReadRepository.findById.mockResolvedValue(null);

    const command = new RefreshTokenCommand('valid-refresh-token');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(tokenIssuer.issueTokens).not.toHaveBeenCalled();
  });

  it('hashedRefreshToken이 null이면 UnauthorizedException을 발생시킨다', async () => {
    userReadRepository.findById.mockResolvedValue({
      ...mockUser,
      hashedRefreshToken: null,
    } as User);

    const command = new RefreshTokenCommand('valid-refresh-token');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(tokenIssuer.issueTokens).not.toHaveBeenCalled();
  });

  it('bcrypt.compare가 false면 UnauthorizedException을 발생시킨다', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const command = new RefreshTokenCommand('old-refresh-token');

    await expect(handler.execute(command)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(tokenIssuer.issueTokens).not.toHaveBeenCalled();
  });
});
