import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@src/common/base.repository';
import { IAdminReadRepository } from '@src/admin/interface/admin-read-repository.interface';
import {
  CreateAdminInput,
  IAdminWriteRepository,
  UpdateAdminInput,
} from '@src/admin/interface/admin-write-repository.interface';
import { Admin } from '@src/admin/entities/admin.entity';

@Injectable()
export class AdminRepository
  extends BaseRepository
  implements IAdminReadRepository, IAdminWriteRepository
{
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  private get adminRepository() {
    return this.getRepository(Admin);
  }

  async findById(id: number): Promise<Admin | null> {
    return this.adminRepository.findOneBy({ id });
  }

  async findByEmail(email: string): Promise<Admin | null> {
    return this.adminRepository.findOneBy({ email });
  }

  async create(input: CreateAdminInput): Promise<Admin> {
    const admin = this.adminRepository.create(input);
    return this.adminRepository.save(admin);
  }

  async update(id: number, input: UpdateAdminInput): Promise<number> {
    const result = await this.adminRepository.update(id, input);
    return result.affected ?? 0;
  }
}
