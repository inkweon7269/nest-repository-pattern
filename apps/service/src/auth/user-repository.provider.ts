import { Provider } from '@nestjs/common';
import { IUserReadRepository } from './interface/user-read-repository.interface';
import { IUserWriteRepository } from './interface/user-write-repository.interface';
import { UserRepository } from './user.repository';

export const userRepositoryProviders: Provider[] = [
  UserRepository,
  { provide: IUserReadRepository, useExisting: UserRepository },
  { provide: IUserWriteRepository, useExisting: UserRepository },
];
