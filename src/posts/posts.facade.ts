import { Injectable, NotFoundException } from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';
import { PostResponseDto } from './dto/response/post.response.dto';

@Injectable()
export class PostsFacade {
  constructor(private readonly postsService: PostsService) {}

  async getPostById(id: number): Promise<PostResponseDto> {
    const post = await this.postsService.findById(id);
    if (!post) {
      throw new NotFoundException(`Post with ID ${id} not found`);
    }
    return PostResponseDto.of(post);
  }

  async getAllPosts(): Promise<PostResponseDto[]> {
    const posts = await this.postsService.findAll();
    return posts.map(PostResponseDto.of);
  }

  async createPost(dto: CreatePostRequestDto): Promise<PostResponseDto> {
    const post = await this.postsService.create(dto);
    return PostResponseDto.of(post);
  }
}
