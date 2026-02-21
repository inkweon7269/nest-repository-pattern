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
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreatePostCommand } from '@src/posts/command/create-post.command';
import { UpdatePostCommand } from '@src/posts/command/update-post.command';
import { DeletePostCommand } from '@src/posts/command/delete-post.command';
import { GetPostByIdQuery } from '@src/posts/query/get-post-by-id.query';
import { FindAllPostsPaginatedQuery } from '@src/posts/query/find-all-posts-paginated.query';
import { CreatePostRequestDto } from '@src/posts/dto/request/create-post.request.dto';
import { UpdatePostRequestDto } from '@src/posts/dto/request/update-post.request.dto';
import { PostResponseDto } from '@src/posts/dto/response/post.response.dto';
import { CreatePostResponseDto } from '@src/posts/dto/response/create-post.response.dto';
import { PaginationRequestDto } from '@src/common/dto/request/pagination.request.dto';
import { PaginatedResponseDto } from '@src/common/dto/response/paginated.response.dto';

@ApiTags('Posts')
@Controller('posts')
export class PostsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: '게시글 페이지네이션 조회' })
  async findAllPaginated(
    @Query() paginationDto: PaginationRequestDto,
  ): Promise<PaginatedResponseDto<PostResponseDto>> {
    return this.queryBus.execute(
      new FindAllPostsPaginatedQuery(paginationDto.page, paginationDto.limit),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID로 게시글 조회' })
  async getPostById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PostResponseDto> {
    return this.queryBus.execute(new GetPostByIdQuery(id));
  }

  @Post()
  @ApiOperation({ summary: '게시글 생성' })
  async createPost(
    @Body() dto: CreatePostRequestDto,
  ): Promise<CreatePostResponseDto> {
    const id = await this.commandBus.execute<CreatePostCommand, number>(
      new CreatePostCommand(dto.title, dto.content, dto.isPublished),
    );
    return CreatePostResponseDto.of(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '게시글 수정' })
  async updatePost(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new UpdatePostCommand(id, dto.title, dto.content, dto.isPublished),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '게시글 삭제' })
  async deletePost(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.commandBus.execute(new DeletePostCommand(id));
  }
}
