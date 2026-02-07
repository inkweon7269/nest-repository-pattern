import { Injectable } from '@nestjs/common';
import { IPostRepository } from './post-repository.interface';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';
import { PostResponseDto } from './dto/response/post.response.dto';

@Injectable()
export class PostsService {
  constructor(private readonly postRepository: IPostRepository) {}

  async viewPostById(id: number): Promise<PostResponseDto | null> {
    const post = await this.postRepository.findById(id);
    return post ? PostResponseDto.of(post) : null;
  }

  async getAllPosts(): Promise<PostResponseDto[]> {
    const posts = await this.postRepository.findAll();
    return posts.map(PostResponseDto.of);
  }

  async createPost(dto: CreatePostRequestDto): Promise<PostResponseDto> {
    const post = await this.postRepository.create(dto);
    return PostResponseDto.of(post);
  }
}
