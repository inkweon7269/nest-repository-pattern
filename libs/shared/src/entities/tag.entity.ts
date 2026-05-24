import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToMany,
  ManyToOne,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from './user.entity';
import { Post } from './post.entity';
import { BaseTimeEntity } from './base.entity';

@Entity('tags')
@Index('UQ_tags_user_id_name', ['userId', 'name'], { unique: true })
export class Tag extends BaseTimeEntity {
  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: Relation<User>;

  @Column({ length: 50 })
  name: string;

  @ManyToMany(() => Post, (post) => post.tags)
  posts: Relation<Post[]>;
}
