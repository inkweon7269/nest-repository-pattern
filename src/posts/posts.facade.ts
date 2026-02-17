import { Injectable } from '@nestjs/common';
import { PostsService } from '@src/posts/service/posts.service';
import { PostsValidationService } from '@src/posts/service/posts-validation.service';
import { CreatePostRequestDto } from '@src/posts/dto/request/create-post.request.dto';
import { UpdatePostRequestDto } from '@src/posts/dto/request/update-post.request.dto';
import { PostResponseDto } from '@src/posts/dto/response/post.response.dto';
import { PaginationRequestDto } from '@src/common/dto/request/pagination.request.dto';
import { PaginatedResponseDto } from '@src/common/dto/response/paginated.response.dto';

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

  async findAllPaginated(
    paginationDto: PaginationRequestDto,
  ): Promise<PaginatedResponseDto<PostResponseDto>> {
    const [posts, totalElements] = await this.postsService.findAllPaginated(
      paginationDto.skip,
      paginationDto.take,
    );
    const items = posts.map(PostResponseDto.of);
    return PaginatedResponseDto.of(
      items,
      totalElements,
      paginationDto.page,
      paginationDto.limit,
    );
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
