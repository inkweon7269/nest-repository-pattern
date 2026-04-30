import { Provider } from '@nestjs/common';
import { IOAuthAccountReadRepository } from './interface/oauth-account-read-repository.interface';
import { IOAuthAccountWriteRepository } from './interface/oauth-account-write-repository.interface';
import { OAuthAccountRepository } from './oauth-account.repository';

export const oauthAccountRepositoryProviders: Provider[] = [
  OAuthAccountRepository,
  { provide: IOAuthAccountReadRepository, useExisting: OAuthAccountRepository },
  {
    provide: IOAuthAccountWriteRepository,
    useExisting: OAuthAccountRepository,
  },
];
