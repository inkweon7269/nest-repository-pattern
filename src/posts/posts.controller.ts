import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PostsFacade } from './posts.facade';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';
import { PostResponseDto } from './dto/response/post.response.dto';

@ApiTags('Posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsFacade: PostsFacade) {}

  @Get()
  @ApiOperation({ summary: '전체 게시글 조회' })
  async getAllPosts(): Promise<PostResponseDto[]> {
    return this.postsFacade.getAllPosts();
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID로 게시글 조회' })
  async getPostById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PostResponseDto> {
    return this.postsFacade.getPostById(id);
  }

  @Post()
  @ApiOperation({ summary: '게시글 생성' })
  async createPost(
    @Body() dto: CreatePostRequestDto,
  ): Promise<PostResponseDto> {
    return this.postsFacade.createPost(dto);
  }
}
