import { Admin } from '@app/shared';

export abstract class IAdminReadRepository {
  abstract findById(id: number): Promise<Admin | null>;
  abstract findByEmail(email: string): Promise<Admin | null>;
}
