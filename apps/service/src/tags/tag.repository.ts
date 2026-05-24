import { Injectable } from '@nestjs/common';
import { DataSource, FindOptionsWhere, In } from 'typeorm';
import { BaseRepository, Tag } from '@app/shared';
import {
  ITagReadRepository,
  TagFilter,
} from './interface/tag-read-repository.interface';
import {
  CreateTagInput,
  ITagWriteRepository,
  UpdateTagInput,
} from './interface/tag-write-repository.interface';

@Injectable()
export class TagRepository
  extends BaseRepository
  implements ITagReadRepository, ITagWriteRepository
{
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  private get tagRepository() {
    return this.getRepository(Tag);
  }

  async findById(id: number): Promise<Tag | null> {
    return this.tagRepository.findOneBy({ id });
  }

  async findByUserIdAndName(userId: number, name: string): Promise<Tag | null> {
    return this.tagRepository.findOneBy({ userId, name });
  }

  async findByIdsAndUserId(ids: number[], userId: number): Promise<Tag[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.tagRepository.findBy({ id: In(ids), userId });
  }

  async findAllPaginated(
    page: number,
    limit: number,
    filter: TagFilter = {},
  ): Promise<[Tag[], number]> {
    const where: FindOptionsWhere<Tag> = {};

    if (filter.userId !== undefined) {
      where.userId = filter.userId;
    }

    return this.tagRepository.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { id: 'DESC' },
    });
  }

  async create(input: CreateTagInput): Promise<Tag> {
    const tag = this.tagRepository.create(input);
    return this.tagRepository.save(tag);
  }

  async update(
    id: number,
    userId: number,
    input: UpdateTagInput,
  ): Promise<number> {
    const result = await this.tagRepository.update({ id, userId }, input);
    return result.affected ?? 0;
  }

  async delete(id: number, userId: number): Promise<number> {
    const result = await this.tagRepository.delete({ id, userId });
    return result.affected ?? 0;
  }
}
