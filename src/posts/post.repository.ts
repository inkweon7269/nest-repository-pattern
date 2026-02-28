import { Injectable } from '@nestjs/common';
import { DataSource, FindOptionsWhere } from 'typeorm';
import { BaseRepository } from '@src/common/base.repository';
import {
  IPostReadRepository,
  PostFilter,
} from '@src/posts/interface/post-read-repository.interface';
import {
  CreatePostInput,
  IPostWriteRepository,
  UpdatePostInput,
} from '@src/posts/interface/post-write-repository.interface';
import { Post } from '@src/posts/entities/post.entity';

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

  async update(id: number, input: UpdatePostInput): Promise<number> {
    const result = await this.postRepository.update(id, input);
    return result.affected ?? 0;
  }

  async delete(id: number): Promise<number> {
    const result = await this.postRepository.delete(id);
    return result.affected ?? 0;
  }
}
