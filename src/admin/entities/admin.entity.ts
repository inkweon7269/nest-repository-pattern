import { Column, Entity } from 'typeorm';
import { BaseTimeEntity } from '@src/common/entities/base.entity';
import { AdminRole } from '@src/admin/enum/admin-role.enum';

@Entity('admins')
export class Admin extends BaseTimeEntity {
  @Column({ length: 255, unique: true })
  email: string;

  @Column({ length: 255 })
  password: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20, default: AdminRole.MANAGER })
  role: AdminRole;

  @Column({ type: 'varchar', length: 255, nullable: true })
  hashedRefreshToken: string | null;
}
