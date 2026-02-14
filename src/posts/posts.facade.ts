import { Injectable } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsValidationService } from './posts-validation.service';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';
import { UpdatePostRequestDto } from './dto/request/update-post.request.dto';
import { PostResponseDto } from './dto/response/post.response.dto';

@Injectable()
export class PostsFacade {
  constructor(
    private readonly postsService: PostsService,
    private readonly postsValidationService: PostsValidationService,
  ) {}

  async getPostById(id: number): Promise<PostResponseDto> {
    const post = await this.postsValidationService.validatePostExists(id);
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

  async updatePost(
    id: number,
    dto: UpdatePostRequestDto,
  ): Promise<PostResponseDto> {
    await this.postsValidationService.validatePostExists(id);
    const post = (await this.postsService.update(id, dto))!;
    return PostResponseDto.of(post);
  }

  async deletePost(id: number): Promise<void> {
    await this.postsValidationService.validatePostExists(id);
    await this.postsService.delete(id);
  }
}
