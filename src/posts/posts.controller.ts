import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PostsFacade } from './posts.facade';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';
import { UpdatePostRequestDto } from './dto/request/update-post.request.dto';
import { PostResponseDto } from './dto/response/post.response.dto';
import { PaginationRequestDto } from '../common/dto/request/pagination.request.dto';
import { PaginatedResponseDto } from '../common/dto/response/paginated.response.dto';

@ApiTags('Posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsFacade: PostsFacade) {}

  @Get()
  @ApiOperation({ summary: '게시글 페이지네이션 조회' })
  async findAllPaginated(
    @Query() paginationDto: PaginationRequestDto,
  ): Promise<PaginatedResponseDto<PostResponseDto>> {
    return this.postsFacade.findAllPaginated(paginationDto);
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

  @Patch(':id')
  @ApiOperation({ summary: '게시글 수정' })
  async updatePost(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostRequestDto,
  ): Promise<PostResponseDto> {
    return this.postsFacade.updatePost(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '게시글 삭제' })
  async deletePost(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.postsFacade.deletePost(id);
  }
}
