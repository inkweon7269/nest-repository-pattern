import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { GetProfileQuery } from '@src/auth/query/get-profile.query';
import { IUserReadRepository } from '@src/auth/interface/user-read-repository.interface';
import { ProfileResponseDto } from '@src/auth/dto/response/profile.response.dto';

@QueryHandler(GetProfileQuery)
export class GetProfileHandler implements IQueryHandler<GetProfileQuery> {
  constructor(private readonly userReadRepository: IUserReadRepository) {}

  async execute(query: GetProfileQuery): Promise<ProfileResponseDto> {
    const user = await this.userReadRepository.findById(query.userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${query.userId} not found`);
    }

    return ProfileResponseDto.of(user);
  }
}
