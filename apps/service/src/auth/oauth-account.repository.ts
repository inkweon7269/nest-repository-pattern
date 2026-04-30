import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository, OAuthAccount } from '@app/shared';
import {
  IOAuthAccountReadRepository,
  OAuthAccountFilter,
  OAuthProvider,
} from './interface/oauth-account-read-repository.interface';
import {
  CreateOAuthAccountInput,
  IOAuthAccountWriteRepository,
} from './interface/oauth-account-write-repository.interface';

@Injectable()
export class OAuthAccountRepository
  extends BaseRepository
  implements IOAuthAccountReadRepository, IOAuthAccountWriteRepository
{
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  private get oauthAccountRepository() {
    return this.getRepository(OAuthAccount);
  }

  async findByProviderId(
    filter: OAuthAccountFilter,
  ): Promise<OAuthAccount | null> {
    return this.oauthAccountRepository.findOneBy({
      provider: filter.provider,
      providerId: filter.providerId,
    });
  }

  async findByUserAndProvider(
    userId: number,
    provider: OAuthProvider,
  ): Promise<OAuthAccount | null> {
    return this.oauthAccountRepository.findOneBy({ userId, provider });
  }

  async create(input: CreateOAuthAccountInput): Promise<OAuthAccount> {
    const account = this.oauthAccountRepository.create(input);
    return this.oauthAccountRepository.save(account);
  }

  async delete(userId: number, provider: OAuthProvider): Promise<number> {
    const result = await this.oauthAccountRepository.delete({
      userId,
      provider,
    });
    return result.affected ?? 0;
  }
}
