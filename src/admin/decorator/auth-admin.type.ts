import { AdminRole } from '@src/admin/enum/admin-role.enum';

export class AuthAdmin {
  id: number;
  email: string;
  role: AdminRole;
}
