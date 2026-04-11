import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { FindAllPostsPaginatedQuery } from './find-all-posts-paginated.query';
import { IPostReadRepository } from '@service/posts/interface/post-read-repository.interface';
import { PostResponseDto } from '@service/posts/dto/response/post.response.dto';
import { PaginatedResponseDto } from '@app/shared';
import { CacheService } from '@app/shared';

const POSTS_LIST_CACHE_TTL = 180; // 3분

@QueryHandler(FindAllPostsPaginatedQuery)
export class FindAllPostsPaginatedHandler implements IQueryHandler<FindAllPostsPaginatedQuery> {
  constructor(
    private readonly postReadRepository: IPostReadRepository,
    private readonly cacheService: CacheService,
  ) {}

  async execute(
    query: FindAllPostsPaginatedQuery,
  ): Promise<PaginatedResponseDto<PostResponseDto>> {
    const { userId, isPublished } = query.filter;
    const cacheKey = `posts:${userId}:${query.page}:${query.limit}:${isPublished ?? 'all'}`;
    const cached =
      await this.cacheService.get<PaginatedResponseDto<PostResponseDto>>(
        cacheKey,
      );
    if (cached) return cached;

    const [posts, totalElements] =
      await this.postReadRepository.findAllPaginated(
        query.page,
        query.limit,
        query.filter,
      );

    const items = posts.map((post) => PostResponseDto.of(post));
    const result = PaginatedResponseDto.of(
      items,
      totalElements,
      query.page,
      query.limit,
    );

    await this.cacheService.set(cacheKey, result, POSTS_LIST_CACHE_TTL);
    return result;
  }
}
