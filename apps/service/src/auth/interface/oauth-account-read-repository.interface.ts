import { OAuthAccount } from '@app/shared';

export type OAuthProvider = 'google';

export interface OAuthAccountFilter {
  provider: OAuthProvider;
  providerId: string;
}

export abstract class IOAuthAccountReadRepository {
  abstract findByProviderId(
    filter: OAuthAccountFilter,
  ): Promise<OAuthAccount | null>;
  abstract findByUserAndProvider(
    userId: number,
    provider: OAuthProvider,
  ): Promise<OAuthAccount | null>;
}
