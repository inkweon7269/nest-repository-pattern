import { Column, Entity, OneToMany } from 'typeorm';
import type { Relation } from 'typeorm';
import { BaseTimeEntity } from './base.entity';
import { Post } from './post.entity';

@Entity('users')
export class User extends BaseTimeEntity {
  @Column({ length: 255, unique: true })
  email: string;

  @Column({ length: 255 })
  password: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  hashedRefreshToken: string | null;

  @OneToMany(() => Post, (post) => post.user)
  posts: Relation<Post[]>;
}
