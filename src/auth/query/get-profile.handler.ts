import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { GetProfileQuery } from '@src/auth/query/get-profile.query';
import { IUserReadRepository } from '@src/auth/interface/user-read-repository.interface';
import { ProfileResponseDto } from '@src/auth/dto/response/profile.response.dto';
import { CacheService } from '@src/common/cache/cache.service';

const PROFILE_CACHE_TTL = 600; // 10분

@QueryHandler(GetProfileQuery)
export class GetProfileHandler implements IQueryHandler<GetProfileQuery> {
  constructor(
    private readonly userReadRepository: IUserReadRepository,
    private readonly cacheService: CacheService,
  ) {}

  async execute(query: GetProfileQuery): Promise<ProfileResponseDto> {
    const cacheKey = `profile:${query.userId}`;
    const cached = await this.cacheService.get<ProfileResponseDto>(cacheKey);
    if (cached) return cached;

    const user = await this.userReadRepository.findById(query.userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${query.userId} not found`);
    }

    const result = ProfileResponseDto.of(user);
    await this.cacheService.set(cacheKey, result, PROFILE_CACHE_TTL);
    return result;
  }
}
