import { Provider } from '@nestjs/common';
import { IUserReadRepository } from '@src/auth/interface/user-read-repository.interface';
import { IUserWriteRepository } from '@src/auth/interface/user-write-repository.interface';
import { UserRepository } from '@src/auth/user.repository';

export const userRepositoryProviders: Provider[] = [
  UserRepository,
  { provide: IUserReadRepository, useExisting: UserRepository },
  { provide: IUserWriteRepository, useExisting: UserRepository },
];
