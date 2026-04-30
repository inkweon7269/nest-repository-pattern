import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { QueryFailedError } from 'typeorm';
import { LinkGoogleAccountCommand } from './link-google-account.command';
import { IOAuthAccountReadRepository } from '@service/auth/interface/oauth-account-read-repository.interface';
import { IOAuthAccountWriteRepository } from '@service/auth/interface/oauth-account-write-repository.interface';

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
    const { providerId, email, emailVerified } = profile;

    if (!emailVerified) {
      throw new UnauthorizedException('Google 미검증 이메일');
    }

    const oauth = await this.oauthReadRepository.findByProviderId({
      provider: 'google',
      providerId,
    });
    if (oauth && oauth.userId !== userId) {
      throw new ConflictException(
        'Google 계정이 다른 사용자에 연결되어 있습니다',
      );
    }

    const existing = await this.oauthReadRepository.findByUserAndProvider(
      userId,
      'google',
    );
    if (existing) {
      throw new ConflictException('이미 Google 계정이 연결되어 있습니다');
    }

    try {
      await this.oauthWriteRepository.create({
        userId,
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
        throw new ConflictException('이미 Google 계정이 연결되어 있습니다');
      }
      throw error;
    }
  }
}
