import { randomBytes } from 'crypto';
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from 'typeorm-transactional';
import * as bcrypt from 'bcrypt';
import { GoogleLoginCommand } from './google-login.command';
import { IUserReadRepository } from '@service/auth/interface/user-read-repository.interface';
import { IUserWriteRepository } from '@service/auth/interface/user-write-repository.interface';
import { IOAuthAccountReadRepository } from '@service/auth/interface/oauth-account-read-repository.interface';
import {
  CreateOAuthAccountInput,
  IOAuthAccountWriteRepository,
} from '@service/auth/interface/oauth-account-write-repository.interface';
import { AuthTokenIssuer } from '@service/auth/auth-token-issuer.service';
import type { GoogleProfilePayload } from '@service/auth/strategy/google-profile.type';
import {
  AuthTokens,
  BCRYPT_SALT_ROUNDS,
  OAuthAccount,
  User,
  isUniqueViolation,
} from '@app/shared';

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

  async execute(command: GoogleLoginCommand): Promise<AuthTokens> {
    const { profile } = command;

    this.validateEmailVerified(profile);

    const oauth = await this.findExistingOAuth(profile.providerId);
    if (oauth) {
      return this.loginExistingOAuthUser(oauth.userId);
    }

    await this.validateEmailAvailable(profile.email);
    return this.signupAndIssueTokens(profile);
  }

  private validateEmailVerified(profile: GoogleProfilePayload): void {
    if (!profile.emailVerified) {
      throw new UnauthorizedException('Google 미검증 이메일');
    }
  }

  private findExistingOAuth(providerId: string): Promise<OAuthAccount | null> {
    return this.oauthReadRepository.findByProviderId({
      provider: 'google',
      providerId,
    });
  }

  private async loginExistingOAuthUser(userId: number): Promise<AuthTokens> {
    const user = await this.userReadRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('연결된 사용자를 찾을 수 없습니다');
    }
    return this.tokenIssuer.issueTokens(user);
  }

  private async validateEmailAvailable(email: string): Promise<void> {
    const existing = await this.userReadRepository.findByEmail(email);
    if (existing) {
      throw new ConflictException(`이미 가입된 이메일입니다: '${email}'`);
    }
  }

  @Transactional()
  private async signupAndIssueTokens(
    profile: GoogleProfilePayload,
  ): Promise<AuthTokens> {
    const newUser = await this.createUserOrConflict(profile);
    await this.linkOAuthOrConflict({
      userId: newUser.id,
      provider: 'google',
      providerId: profile.providerId,
      providerEmail: profile.email,
      emailVerified: profile.emailVerified,
    });
    return this.tokenIssuer.issueTokens(newUser);
  }

  private async createUserOrConflict(
    profile: GoogleProfilePayload,
  ): Promise<User> {
    const randomSecret = randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(randomSecret, BCRYPT_SALT_ROUNDS);
    try {
      return await this.userWriteRepository.create({
        email: profile.email,
        password: hashedPassword,
        name: profile.displayName,
        // OAuth 가입자는 동의 화면을 거치지 않으므로 기본 미동의
        marketingConsent: false,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `이미 가입된 이메일입니다: '${profile.email}'`,
        );
      }
      throw error;
    }
  }

  private async linkOAuthOrConflict(
    input: CreateOAuthAccountInput,
  ): Promise<void> {
    try {
      await this.oauthWriteRepository.create(input);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('이미 연결된 Google 계정입니다');
      }
      throw error;
    }
  }
}
