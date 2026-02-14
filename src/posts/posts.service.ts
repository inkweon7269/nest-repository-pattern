import { Injectable } from '@nestjs/common';
import { IPostReadRepository } from './post-read-repository.interface';
import { IPostWriteRepository } from './post-write-repository.interface';
import { Post } from './entities/post.entity';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';

@Injectable()
export class PostsService {
  constructor(
    private readonly postReadRepository: IPostReadRepository,
    private readonly postWriteRepository: IPostWriteRepository,
  ) {}

  async findById(id: number): Promise<Post | null> {
    return this.postReadRepository.findById(id);
  }

  async findAll(): Promise<Post[]> {
    return this.postReadRepository.findAll();
  }

  async create(dto: CreatePostRequestDto): Promise<Post> {
    return this.postWriteRepository.create(dto);
  }
}
