import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { FindAllTagsPaginatedQuery } from './find-all-tags-paginated.query';
import { ITagReadRepository } from '@service/tags/interface/tag-read-repository.interface';
import { TagResponseDto } from '@service/tags/dto/response/tag.response.dto';
import { PaginatedResponseDto } from '@app/shared';
import { CacheService } from '@app/shared';

const TAGS_LIST_CACHE_TTL = 180; // 3분

@QueryHandler(FindAllTagsPaginatedQuery)
export class FindAllTagsPaginatedHandler implements IQueryHandler<FindAllTagsPaginatedQuery> {
  constructor(
    private readonly tagReadRepository: ITagReadRepository,
    private readonly cacheService: CacheService,
  ) {}

  async execute(
    query: FindAllTagsPaginatedQuery,
  ): Promise<PaginatedResponseDto<TagResponseDto>> {
    const { userId } = query.filter;
    const cacheKey = `tags:${userId}:${query.page}:${query.limit}`;
    const cached =
      await this.cacheService.get<PaginatedResponseDto<TagResponseDto>>(
        cacheKey,
      );
    if (cached) return cached;

    const [tags, totalElements] = await this.tagReadRepository.findAllPaginated(
      query.page,
      query.limit,
      query.filter,
    );

    const items = tags.map((tag) => TagResponseDto.of(tag));
    const result = PaginatedResponseDto.of(
      items,
      totalElements,
      query.page,
      query.limit,
    );

    await this.cacheService.set(cacheKey, result, TAGS_LIST_CACHE_TTL);
    return result;
  }
}
