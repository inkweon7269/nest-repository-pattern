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
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Idempotent } from '@app/shared';
import { JwtAuthGuard } from '@service/auth/guard/jwt-auth.guard';
import { CurrentUser } from '@service/auth/decorator/current-user.decorator';
import { AuthUser } from '@service/auth/decorator/auth-user.type';
import { CreatePostCommand } from './command/create-post.command';
import { UpdatePostCommand } from './command/update-post.command';
import { DeletePostCommand } from './command/delete-post.command';
import { GetPostByIdQuery } from './query/get-post-by-id.query';
import { FindAllPostsPaginatedQuery } from './query/find-all-posts-paginated.query';
import { CreatePostRequestDto } from './dto/request/create-post.request.dto';
import { UpdatePostRequestDto } from './dto/request/update-post.request.dto';
import { PostResponseDto } from './dto/response/post.response.dto';
import { CreatePostResponseDto } from './dto/response/create-post.response.dto';
import { PostsPaginationRequestDto } from './dto/request/find-posts.request.dto';
import { PaginatedResponseDto } from '@app/shared';

@ApiTags('Posts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '인증되지 않은 요청' })
@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: '게시글 페이지네이션 조회' })
  @ApiOkResponse({ type: PaginatedResponseDto })
  async findAllPaginated(
    @CurrentUser() user: AuthUser,
    @Query() dto: PostsPaginationRequestDto,
  ): Promise<PaginatedResponseDto<PostResponseDto>> {
    return this.queryBus.execute(
      new FindAllPostsPaginatedQuery(dto.page, dto.limit, {
        userId: user.id,
        isPublished: dto.isPublished,
        tagId: dto.tagId,
      }),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID로 게시글 조회' })
  @ApiOkResponse({ type: PostResponseDto })
  @ApiNotFoundResponse({ description: '게시글을 찾을 수 없음' })
  async getPostById(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PostResponseDto> {
    return this.queryBus.execute(new GetPostByIdQuery(user.id, id));
  }

  @Post()
  @Idempotent()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID v4 형식의 멱등성 키',
  })
  @ApiOperation({ summary: '게시글 생성' })
  @ApiCreatedResponse({ type: CreatePostResponseDto })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  @ApiConflictResponse({
    description: '중복된 제목 또는 동일 Idempotency-Key로 동시 요청 처리 중',
  })
  async createPost(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePostRequestDto,
  ): Promise<CreatePostResponseDto> {
    const id = await this.commandBus.execute<CreatePostCommand, number>(
      new CreatePostCommand(
        user.id,
        dto.title,
        dto.content,
        dto.isPublished,
        dto.tagIds,
      ),
    );
    return CreatePostResponseDto.of(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '게시글 수정 (전체 업데이트)' })
  @ApiNoContentResponse({ description: '수정 성공' })
  @ApiNotFoundResponse({ description: '게시글을 찾을 수 없음' })
  @ApiForbiddenResponse({ description: '본인의 게시글만 수정 가능' })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  async updatePost(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new UpdatePostCommand(
        user.id,
        id,
        dto.title,
        dto.content,
        dto.isPublished,
        dto.tagIds,
      ),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '게시글 삭제' })
  @ApiNoContentResponse({ description: '삭제 성공' })
  @ApiNotFoundResponse({ description: '게시글을 찾을 수 없음' })
  @ApiForbiddenResponse({ description: '본인의 게시글만 삭제 가능' })
  async deletePost(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.commandBus.execute(new DeletePostCommand(user.id, id));
  }
}
