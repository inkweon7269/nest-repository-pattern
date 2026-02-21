import { Post } from '@src/posts/entities/post.entity';

export abstract class IPostReadRepository {
  abstract findById(id: number): Promise<Post | null>;
  abstract findAllPaginated(
    page: number,
    limit: number,
  ): Promise<[Post[], number]>;
}
