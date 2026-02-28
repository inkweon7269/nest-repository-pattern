import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@src/common/base.repository';
import { IUserReadRepository } from '@src/auth/interface/user-read-repository.interface';
import {
  CreateUserInput,
  IUserWriteRepository,
  UpdateUserInput,
} from '@src/auth/interface/user-write-repository.interface';
import { User } from '@src/auth/entities/user.entity';

@Injectable()
export class UserRepository
  extends BaseRepository
  implements IUserReadRepository, IUserWriteRepository
{
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  private get userRepository() {
    return this.getRepository(User);
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepository.findOneBy({ id });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOneBy({ email });
  }

  async create(input: CreateUserInput): Promise<User> {
    const user = this.userRepository.create(input);
    return this.userRepository.save(user);
  }

  async update(id: number, input: UpdateUserInput): Promise<number> {
    const result = await this.userRepository.update(id, input);
    return result.affected ?? 0;
  }
}
