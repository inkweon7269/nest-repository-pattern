import { User } from '@src/auth/entities/user.entity';

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
}

export interface UpdateUserInput {
  hashedRefreshToken?: string | null;
}

export abstract class IUserWriteRepository {
  abstract create(input: CreateUserInput): Promise<User>;
  abstract update(id: number, input: UpdateUserInput): Promise<number>;
}
