import { AdminRole } from '@app/shared';

export class AdminRegisterCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly name: string,
    public readonly role: AdminRole,
  ) {}
}
