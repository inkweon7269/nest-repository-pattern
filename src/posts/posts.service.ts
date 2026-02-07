import { Injectable } from '@nestjs/common';
import { IPostRepository } from './post-repository.interface';
import { Post } from './entities/post.entity';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';

@Injectable()
export class PostsService {
  constructor(private readonly postRepository: IPostRepository) {}

  async findById(id: number): Promise<Post | null> {
    return this.postRepository.findById(id);
  }

  async findAll(): Promise<Post[]> {
    return this.postRepository.findAll();
  }

  async create(dto: CreatePostRequestDto): Promise<Post> {
    return this.postRepository.create(dto);
  }
}
