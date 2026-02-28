import { Column, Entity, OneToMany } from 'typeorm';
import { BaseTimeEntity } from '@src/common/entities/base.entity';
import { Post } from '@src/posts/entities/post.entity';

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
  posts: Post[];
}
