import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '../common/base.repository';
import { IPostRepository } from './post-repository.interface';
import { Post } from './entities/post.entity';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';
import { UpdatePostRequestDto } from './dto/request/update-post.request.dto';

@Injectable()
export class PostRepository extends BaseRepository implements IPostRepository {
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  private get postRepository() {
    return this.getRepository(Post);
  }

  async findById(id: number): Promise<Post | null> {
    return this.postRepository.findOneBy({ id });
  }

  async findAll(): Promise<Post[]> {
    return this.postRepository.find();
  }

  async create(dto: CreatePostRequestDto): Promise<Post> {
    const post = this.postRepository.create(dto);
    return this.postRepository.save(post);
  }

  async update(id: number, dto: UpdatePostRequestDto): Promise<Post | null> {
    await this.postRepository.update(id, dto);
    return this.findById(id);
  }

  async delete(id: number): Promise<void> {
    await this.postRepository.delete(id);
  }
}
