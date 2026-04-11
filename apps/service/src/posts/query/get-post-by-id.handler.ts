import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { GetPostByIdQuery } from './get-post-by-id.query';
import { IPostReadRepository } from '../interface/post-read-repository.interface';
import { PostResponseDto } from '../dto/response/post.response.dto';
import { CacheService } from '@app/shared';

const POST_CACHE_TTL = 300; // 5분

@QueryHandler(GetPostByIdQuery)
export class GetPostByIdHandler implements IQueryHandler<GetPostByIdQuery> {
  constructor(
    private readonly postReadRepository: IPostReadRepository,
    private readonly cacheService: CacheService,
  ) {}

  async execute(query: GetPostByIdQuery): Promise<PostResponseDto> {
    const cacheKey = `post:${query.userId}:${query.id}`;
    const cached = await this.cacheService.get<PostResponseDto>(cacheKey);
    if (cached) return cached;

    const post = await this.postReadRepository.findById(query.id);
    if (!post || post.userId !== query.userId) {
      throw new NotFoundException(`Post with ID ${query.id} not found`);
    }

    const result = PostResponseDto.of(post);
    await this.cacheService.set(cacheKey, result, POST_CACHE_TTL);
    return result;
  }
}
