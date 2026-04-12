import { Injectable } from '@nestjs/common';
import { DataSource, FindOptionsWhere, IsNull } from 'typeorm';
import { BaseRepository } from '@app/shared';
import {
  IPostReadRepository,
  PostFilter,
} from './interface/post-read-repository.interface';
import {
  CreatePostInput,
  IPostWriteRepository,
  UpdatePostInput,
} from './interface/post-write-repository.interface';
import { Post } from '@app/shared';

@Injectable()
export class PostRepository
  extends BaseRepository
  implements IPostReadRepository, IPostWriteRepository
{
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  private get postRepository() {
    return this.getRepository(Post);
  }

  async findById(id: number): Promise<Post | null> {
    return this.postRepository.findOneBy({ id });
  }

  async findByUserIdAndTitle(
    userId: number,
    title: string,
  ): Promise<Post | null> {
    return this.postRepository.findOneBy({ userId, title });
  }

  async findAllPaginated(
    page: number,
    limit: number,
    filter: PostFilter = {},
  ): Promise<[Post[], number]> {
    const where: FindOptionsWhere<Post> = {};

    if (filter.userId !== undefined) {
      where.userId = filter.userId;
    }

    if (filter.isPublished !== undefined) {
      where.isPublished = filter.isPublished;
    }

    return this.postRepository.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { id: 'DESC' },
    });
  }

  async create(input: CreatePostInput): Promise<Post> {
    const post = this.postRepository.create(input);
    return this.postRepository.save(post);
  }

  async update(
    id: number,
    userId: number,
    input: UpdatePostInput,
  ): Promise<number> {
    const result = await this.postRepository.update(
      { id, userId, deletedAt: IsNull() },
      input,
    );
    return result.affected ?? 0;
  }

  async delete(id: number, userId: number): Promise<number> {
    const result = await this.postRepository.softDelete({
      id,
      userId,
      deletedAt: IsNull(),
    });
    return result.affected ?? 0;
  }
}
