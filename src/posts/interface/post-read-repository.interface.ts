import { Post } from '../entities/post.entity';

export abstract class IPostReadRepository {
  abstract findById(id: number): Promise<Post | null>;
  abstract findAll(): Promise<Post[]>;
}
