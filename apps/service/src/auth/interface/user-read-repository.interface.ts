import { User } from '@app/shared';

export abstract class IUserReadRepository {
  abstract findById(id: number): Promise<User | null>;
  abstract findByEmail(email: string): Promise<User | null>;
}
