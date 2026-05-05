import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { QueryFailedError } from 'typeorm';
import { LinkGoogleAccountCommand } from './link-google-account.command';
import { IOAuthAccountReadRepository } from '@service/auth/interface/oauth-account-read-repository.interface';
import {
  CreateOAuthAccountInput,
  IOAuthAccountWriteRepository,
} from '@service/auth/interface/oauth-account-write-repository.interface';
import type { GoogleProfilePayload } from '@service/auth/strategy/google-profile.type';

@CommandHandler(LinkGoogleAccountCommand)
export class LinkGoogleAccountHandler implements ICommandHandler<
  LinkGoogleAccountCommand,
  void
> {
  constructor(
    private readonly oauthReadRepository: IOAuthAccountReadRepository,
    private readonly oauthWriteRepository: IOAuthAccountWriteRepository,
  ) {}

  async execute(command: LinkGoogleAccountCommand): Promise<void> {
    const { userId, profile } = command;

    this.validateEmailVerified(profile);
    await this.validateProviderNotLinkedElsewhere(profile.providerId, userId);
    await this.validateUserHasNoGoogleLink(userId);
    await this.linkOAuthOrConflict({
      userId,
      provider: 'google',
      providerId: profile.providerId,
      providerEmail: profile.email,
      emailVerified: profile.emailVerified,
    });
  }

  private validateEmailVerified(profile: GoogleProfilePayload): void {
    if (!profile.emailVerified) {
      throw new UnauthorizedException('Google 미검증 이메일');
    }
  }

  private async validateProviderNotLinkedElsewhere(
    providerId: string,
    userId: number,
  ): Promise<void> {
    const oauth = await this.oauthReadRepository.findByProviderId({
      provider: 'google',
      providerId,
    });
    if (oauth && oauth.userId !== userId) {
      throw new ConflictException(
        'Google 계정이 다른 사용자에 연결되어 있습니다',
      );
    }
  }

  private async validateUserHasNoGoogleLink(userId: number): Promise<void> {
    const existing = await this.oauthReadRepository.findByUserAndProvider(
      userId,
      'google',
    );
    if (existing) {
      throw new ConflictException('이미 Google 계정이 연결되어 있습니다');
    }
  }

  private async linkOAuthOrConflict(
    input: CreateOAuthAccountInput,
  ): Promise<void> {
    try {
      await this.oauthWriteRepository.create(input);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === '23505'
      ) {
        throw new ConflictException('이미 Google 계정이 연결되어 있습니다');
      }
      throw error;
    }
  }
}
