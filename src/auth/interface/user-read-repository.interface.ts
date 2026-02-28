import { User } from '@src/auth/entities/user.entity';

export abstract class IUserReadRepository {
  abstract findById(id: number): Promise<User | null>;
  abstract findByEmail(email: string): Promise<User | null>;
}
