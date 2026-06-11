import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from './user.entity';
import { Tag } from './tag.entity';
import { BaseTimeEntity } from './base.entity';

@Entity('posts')
@Index('UQ_posts_user_id_title', ['userId', 'title'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class Post extends BaseTimeEntity {
  @Column()
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user!: Relation<User>;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ default: false })
  isPublished!: boolean;

  @ManyToMany(() => Tag, (tag) => tag.posts)
  @JoinTable({ name: 'post_tags', synchronize: false })
  tags!: Relation<Tag[]>;

  @DeleteDateColumn()
  deletedAt!: Date | null;
}
