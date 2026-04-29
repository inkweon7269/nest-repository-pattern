import { OAuthAccount } from '@app/shared';
import { OAuthProvider } from './oauth-account-read-repository.interface';

export interface CreateOAuthAccountInput {
  userId: number;
  provider: OAuthProvider;
  providerId: string;
  providerEmail: string;
  emailVerified: boolean;
}

export abstract class IOAuthAccountWriteRepository {
  abstract create(input: CreateOAuthAccountInput): Promise<OAuthAccount>;
  abstract delete(userId: number, provider: OAuthProvider): Promise<number>;
}
