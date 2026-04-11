import { Provider } from '@nestjs/common';
import { IAdminReadRepository } from '@src/admin/interface/admin-read-repository.interface';
import { IAdminWriteRepository } from '@src/admin/interface/admin-write-repository.interface';
import { AdminRepository } from '@src/admin/admin.repository';

export const adminRepositoryProviders: Provider[] = [
  AdminRepository,
  { provide: IAdminReadRepository, useExisting: AdminRepository },
  { provide: IAdminWriteRepository, useExisting: AdminRepository },
];
