import { Admin } from '@src/admin/entities/admin.entity';
import { AdminRole } from '@src/admin/enum/admin-role.enum';

export interface CreateAdminInput {
  email: string;
  password: string;
  name: string;
  role: AdminRole;
}

export interface UpdateAdminInput {
  hashedRefreshToken?: string | null;
}

export abstract class IAdminWriteRepository {
  abstract create(input: CreateAdminInput): Promise<Admin>;
  abstract update(id: number, input: UpdateAdminInput): Promise<number>;
}
