import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { FindAllPostsPaginatedQuery } from '@src/posts/query/find-all-posts-paginated.query';
import { IPostReadRepository } from '@src/posts/interface/post-read-repository.interface';
import { PostResponseDto } from '@src/posts/dto/response/post.response.dto';
import { PaginatedResponseDto } from '@src/common/dto/response/paginated.response.dto';

@QueryHandler(FindAllPostsPaginatedQuery)
export class FindAllPostsPaginatedHandler implements IQueryHandler<FindAllPostsPaginatedQuery> {
  constructor(private readonly postReadRepository: IPostReadRepository) {}

  async execute(
    query: FindAllPostsPaginatedQuery,
  ): Promise<PaginatedResponseDto<PostResponseDto>> {
    const [posts, totalElements] =
      await this.postReadRepository.findAllPaginated(query.page, query.limit);

    const items = posts.map((post) => PostResponseDto.of(post));

    return PaginatedResponseDto.of(
      items,
      totalElements,
      query.page,
      query.limit,
    );
  }
}
