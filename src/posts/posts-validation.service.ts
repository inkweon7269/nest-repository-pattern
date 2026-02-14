import { Injectable, NotFoundException } from '@nestjs/common';
import { IPostReadRepository } from './post-read-repository.interface';
import { Post } from './entities/post.entity';

@Injectable()
export class PostsValidationService {
  constructor(private readonly postReadRepository: IPostReadRepository) {}

  async validatePostExists(id: number): Promise<Post> {
    const post = await this.postReadRepository.findById(id);
    if (!post) {
      throw new NotFoundException(`Post with ID ${id} not found`);
    }
    return post;
  }
}
