import { PaginatedQuery } from '@src/common/query/paginated.query';
import { PostFilter } from '@src/posts/interface/post-read-repository.interface';

export class FindAllPostsPaginatedQuery extends PaginatedQuery {
  constructor(
    page: number,
    limit: number,
    public readonly filter: PostFilter = {},
  ) {
    super(page, limit);
  }
}
