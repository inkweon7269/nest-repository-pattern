import { Tag } from '@app/shared';

export type TagFilter = { userId?: number };

export abstract class ITagReadRepository {
  abstract findById(id: number): Promise<Tag | null>;
  abstract findByUserIdAndName(
    userId: number,
    name: string,
  ): Promise<Tag | null>;
  abstract findByIdsAndUserId(ids: number[], userId: number): Promise<Tag[]>;
  abstract findAllPaginated(
    page: number,
    limit: number,
    filter?: TagFilter,
  ): Promise<[Tag[], number]>;
}
