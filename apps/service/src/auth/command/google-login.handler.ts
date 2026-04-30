import { randomBytes } from 'crypto';
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { QueryFailedError } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import * as bcrypt from 'bcrypt';
import { GoogleLoginCommand } from './google-login.command';
import { IUserReadRepository } from '@service/auth/interface/user-read-repository.interface';
import { IUserWriteRepository } from '@service/auth/interface/user-write-repository.interface';
import { IOAuthAccountReadRepository } from '@service/auth/interface/oauth-account-read-repository.interface';
import { IOAuthAccountWriteRepository } from '@service/auth/interface/oauth-account-write-repository.interface';
import { AuthTokenIssuer } from '@service/auth/auth-token-issuer.service';
import { AuthTokens, User } from '@app/shared';

@CommandHandler(GoogleLoginCommand)
export class GoogleLoginHandler implements ICommandHandler<
  GoogleLoginCommand,
  AuthTokens
> {
  constructor(
    private readonly userReadRepository: IUserReadRepository,
    private readonly userWriteRepository: IUserWriteRepository,
    private readonly oauthReadRepository: IOAuthAccountReadRepository,
    private readonly oauthWriteRepository: IOAuthAccountWriteRepository,
    private readonly tokenIssuer: AuthTokenIssuer,
  ) {}

  @Transactional()
  async execute(command: GoogleLoginCommand): Promise<AuthTokens> {
    const { providerId, email, emailVerified, displayName } = command.profile;

    if (!emailVerified) {
      throw new UnauthorizedException('Google 미검증 이메일');
    }

    const oauth = await this.oauthReadRepository.findByProviderId({
      provider: 'google',
      providerId,
    });
    if (oauth) {
      const user = await this.userReadRepository.findById(oauth.userId);
      if (!user) {
        throw new NotFoundException('연결된 사용자를 찾을 수 없습니다');
      }
      return this.tokenIssuer.issueTokens(user);
    }

    const existing = await this.userReadRepository.findByEmail(email);
    if (existing) {
      throw new ConflictException(`이미 가입된 이메일입니다: '${email}'`);
    }

    const randomSecret = randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(randomSecret, 10);
    let newUser: User;
    try {
      newUser = await this.userWriteRepository.create({
        email,
        password: hashedPassword,
        name: displayName,
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === '23505'
      ) {
        throw new ConflictException(`이미 가입된 이메일입니다: '${email}'`);
      }
      throw error;
    }
    try {
      await this.oauthWriteRepository.create({
        userId: newUser.id,
        provider: 'google',
        providerId,
        providerEmail: email,
        emailVerified,
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === '23505'
      ) {
        throw new ConflictException('이미 연결된 Google 계정입니다');
      }
      throw error;
    }
    return this.tokenIssuer.issueTokens(newUser);
  }
}
