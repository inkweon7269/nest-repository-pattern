import { PaginatedQuery } from '@app/shared';
import { PostFilter } from '@service/posts/interface/post-read-repository.interface';

export class FindAllPostsPaginatedQuery extends PaginatedQuery {
  constructor(
    page: number,
    limit: number,
    public readonly filter: PostFilter = {},
  ) {
    super(page, limit);
  }
}
