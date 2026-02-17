import { Injectable } from '@nestjs/common';
import { IPostReadRepository } from '@src/posts/interface/post-read-repository.interface';
import { IPostWriteRepository } from '@src/posts/interface/post-write-repository.interface';
import { Post } from '@src/posts/entities/post.entity';
import { CreatePostRequestDto } from '@src/posts/dto/request/create-post.request.dto';
import { UpdatePostRequestDto } from '@src/posts/dto/request/update-post.request.dto';

@Injectable()
export class PostsService {
  constructor(
    private readonly postReadRepository: IPostReadRepository,
    private readonly postWriteRepository: IPostWriteRepository,
  ) {}

  async findById(id: number): Promise<Post | null> {
    return this.postReadRepository.findById(id);
  }

  async findAllPaginated(
    skip: number,
    take: number,
  ): Promise<[Post[], number]> {
    return this.postReadRepository.findAllPaginated(skip, take);
  }

  async create(dto: CreatePostRequestDto): Promise<Post> {
    return this.postWriteRepository.create(dto);
  }

  async update(id: number, dto: UpdatePostRequestDto): Promise<Post | null> {
    return this.postWriteRepository.update(id, dto);
  }

  async delete(id: number): Promise<void> {
    return this.postWriteRepository.delete(id);
  }
}
