import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UnlinkGoogleAccountCommand } from './unlink-google-account.command';
import { IOAuthAccountWriteRepository } from '@service/auth/interface/oauth-account-write-repository.interface';

@CommandHandler(UnlinkGoogleAccountCommand)
export class UnlinkGoogleAccountHandler implements ICommandHandler<
  UnlinkGoogleAccountCommand,
  void
> {
  constructor(
    private readonly oauthWriteRepository: IOAuthAccountWriteRepository,
  ) {}

  async execute(command: UnlinkGoogleAccountCommand): Promise<void> {
    const affected = await this.oauthWriteRepository.delete(
      command.userId,
      'google',
    );
    if (affected === 0) {
      throw new NotFoundException('연결된 Google 계정이 없습니다');
    }
  }
}
