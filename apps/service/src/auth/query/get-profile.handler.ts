import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { GetProfileQuery } from './get-profile.query';
import { IUserReadRepository } from '../interface/user-read-repository.interface';
import { ProfileResponseDto } from '../dto/response/profile.response.dto';
import { CacheService } from '@app/shared';

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
