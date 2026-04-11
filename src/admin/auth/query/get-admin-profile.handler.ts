import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { GetAdminProfileQuery } from '@src/admin/auth/query/get-admin-profile.query';
import { IAdminReadRepository } from '@src/admin/interface/admin-read-repository.interface';
import { AdminProfileResponseDto } from '@src/admin/dto/response/admin-profile.response.dto';

@QueryHandler(GetAdminProfileQuery)
export class GetAdminProfileHandler implements IQueryHandler<GetAdminProfileQuery> {
  constructor(private readonly adminReadRepository: IAdminReadRepository) {}

  async execute(query: GetAdminProfileQuery): Promise<AdminProfileResponseDto> {
    const admin = await this.adminReadRepository.findById(query.adminId);
    if (!admin) {
      throw new NotFoundException(`Admin with ID ${query.adminId} not found`);
    }

    return AdminProfileResponseDto.of(admin);
  }
}
