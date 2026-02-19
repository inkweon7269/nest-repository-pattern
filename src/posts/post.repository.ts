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
    skip: number,
    take: number,
  ): Promise<[Post[], number]> {
    return this.postRepository.findAndCount({
      skip,
      take,
      order: { id: 'DESC' },
    });
  }

  async create(input: CreatePostInput): Promise<Post> {
    const post = this.postRepository.create(input);
    return this.postRepository.save(post);
  }

  async update(id: number, input: UpdatePostInput): Promise<void> {
    await this.postRepository.update(id, input);
  }

  async delete(id: number): Promise<void> {
    await this.postRepository.delete(id);
  }
}
