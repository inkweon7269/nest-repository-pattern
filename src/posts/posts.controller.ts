import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PostsService } from './posts.service';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';
import { PostResponseDto } from './dto/response/post.response.dto';

@ApiTags('Posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @ApiOperation({ summary: '전체 게시글 조회' })
  async getAllPosts(): Promise<PostResponseDto[]> {
    return this.postsService.getAllPosts();
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID로 게시글 조회' })
  async getPostById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PostResponseDto> {
    const post = await this.postsService.viewPostById(id);
    if (!post) {
      throw new NotFoundException(`Post with ID ${id} not found`);
    }
    return post;
  }

  @Post()
  @ApiOperation({ summary: '게시글 생성' })
  async createPost(
    @Body() dto: CreatePostRequestDto,
  ): Promise<PostResponseDto> {
    return this.postsService.createPost(dto);
  }
}
