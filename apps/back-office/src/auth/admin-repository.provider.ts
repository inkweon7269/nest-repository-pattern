import { Provider } from '@nestjs/common';
import { IAdminReadRepository } from './interface/admin-read-repository.interface';
import { IAdminWriteRepository } from './interface/admin-write-repository.interface';
import { AdminRepository } from './admin.repository';

export const adminRepositoryProviders: Provider[] = [
  AdminRepository,
  { provide: IAdminReadRepository, useExisting: AdminRepository },
  { provide: IAdminWriteRepository, useExisting: AdminRepository },
];
