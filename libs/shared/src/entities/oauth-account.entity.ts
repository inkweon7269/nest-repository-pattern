import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from './user.entity';
import { BaseTimeEntity } from './base.entity';

@Entity('oauth_accounts')
@Index('UQ_oauth_provider_provider_id', ['provider', 'providerId'], {
  unique: true,
})
@Index('UQ_oauth_user_provider', ['userId', 'provider'], { unique: true })
export class OAuthAccount extends BaseTimeEntity {
  @Column()
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user!: Relation<User>;

  @Column({ length: 20 })
  provider!: string;

  @Column({ length: 255 })
  providerId!: string;

  @Column({ length: 255 })
  providerEmail!: string;

  @Column({ type: 'boolean', default: false })
  emailVerified!: boolean;
}
