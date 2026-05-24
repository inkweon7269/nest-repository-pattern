import { PaginatedQuery } from '@app/shared';
import { TagFilter } from '@service/tags/interface/tag-read-repository.interface';

export class FindAllTagsPaginatedQuery extends PaginatedQuery {
  constructor(
    page: number,
    limit: number,
    public readonly filter: TagFilter = {},
  ) {
    super(page, limit);
  }
}
