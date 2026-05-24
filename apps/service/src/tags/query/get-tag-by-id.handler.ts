import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { GetTagByIdQuery } from './get-tag-by-id.query';
import { ITagReadRepository } from '@service/tags/interface/tag-read-repository.interface';
import { TagResponseDto } from '@service/tags/dto/response/tag.response.dto';
import { CacheService } from '@app/shared';

const TAG_CACHE_TTL = 300; // 5분

@QueryHandler(GetTagByIdQuery)
export class GetTagByIdHandler implements IQueryHandler<GetTagByIdQuery> {
  constructor(
    private readonly tagReadRepository: ITagReadRepository,
    private readonly cacheService: CacheService,
  ) {}

  async execute(query: GetTagByIdQuery): Promise<TagResponseDto> {
    const cacheKey = `tag:${query.userId}:${query.id}`;
    const cached = await this.cacheService.get<TagResponseDto>(cacheKey);
    if (cached) return cached;

    const tag = await this.tagReadRepository.findById(query.id);
    if (!tag || tag.userId !== query.userId) {
      throw new NotFoundException(`Tag with ID ${query.id} not found`);
    }

    const result = TagResponseDto.of(tag);
    await this.cacheService.set(cacheKey, result, TAG_CACHE_TTL);
    return result;
  }
}
