import { Post } from '@src/posts/entities/post.entity';

export type PostFilter = {
  isPublished?: boolean;
};

export abstract class IPostReadRepository {
  abstract findById(id: number): Promise<Post | null>;
  abstract findByTitle(title: string): Promise<Post | null>;
  abstract findAllPaginated(
    page: number,
    limit: number,
    filter?: PostFilter,
  ): Promise<[Post[], number]>;
}
