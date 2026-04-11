import { Post } from '@app/shared';

export type PostFilter = {
  userId?: number;
  isPublished?: boolean;
};

export abstract class IPostReadRepository {
  abstract findById(id: number): Promise<Post | null>;
  abstract findByUserIdAndTitle(
    userId: number,
    title: string,
  ): Promise<Post | null>;
  abstract findAllPaginated(
    page: number,
    limit: number,
    filter?: PostFilter,
  ): Promise<[Post[], number]>;
}
