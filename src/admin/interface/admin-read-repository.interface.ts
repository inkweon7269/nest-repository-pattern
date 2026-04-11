import { Admin } from '@src/admin/entities/admin.entity';

export abstract class IAdminReadRepository {
  abstract findById(id: number): Promise<Admin | null>;
  abstract findByEmail(email: string): Promise<Admin | null>;
}
