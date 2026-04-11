import { AdminRole } from '@src/admin/enum/admin-role.enum';

export class AdminRegisterCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly name: string,
    public readonly role: AdminRole,
  ) {}
}
