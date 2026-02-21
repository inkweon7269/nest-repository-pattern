import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@src/common/base.repository';
import { IPostReadRepository } from '@src/posts/interface/post-read-repository.interface';
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

  async findAllPaginated(
    page: number,
    limit: number,
  ): Promise<[Post[], number]> {
    return this.postRepository.findAndCount({
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
