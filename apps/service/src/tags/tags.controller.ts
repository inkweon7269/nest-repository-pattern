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
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Idempotent } from '@app/shared';
import { PaginatedResponseDto } from '@app/shared';
import { JwtAuthGuard } from '@service/auth/guard/jwt-auth.guard';
import { CurrentUser } from '@service/auth/decorator/current-user.decorator';
import { AuthUser } from '@service/auth/decorator/auth-user.type';
import { CreateTagCommand } from './command/create-tag.command';
import { UpdateTagCommand } from './command/update-tag.command';
import { DeleteTagCommand } from './command/delete-tag.command';
import { GetTagByIdQuery } from './query/get-tag-by-id.query';
import { FindAllTagsPaginatedQuery } from './query/find-all-tags-paginated.query';
import { CreateTagRequestDto } from './dto/request/create-tag.request.dto';
import { UpdateTagRequestDto } from './dto/request/update-tag.request.dto';
import { TagsPaginationRequestDto } from './dto/request/find-tags.request.dto';
import { TagResponseDto } from './dto/response/tag.response.dto';
import { CreateTagResponseDto } from './dto/response/create-tag.response.dto';

@ApiTags('Tags')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '인증되지 않은 요청' })
@UseGuards(JwtAuthGuard)
@Controller('tags')
export class TagsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: '태그 페이지네이션 조회' })
  @ApiOkResponse({ type: PaginatedResponseDto })
  async findAllPaginated(
    @CurrentUser() user: AuthUser,
    @Query() dto: TagsPaginationRequestDto,
  ): Promise<PaginatedResponseDto<TagResponseDto>> {
    return this.queryBus.execute(
      new FindAllTagsPaginatedQuery(dto.page, dto.limit, {
        userId: user.id,
      }),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID로 태그 조회' })
  @ApiOkResponse({ type: TagResponseDto })
  @ApiNotFoundResponse({ description: '태그를 찾을 수 없음' })
  async getTagById(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TagResponseDto> {
    return this.queryBus.execute(new GetTagByIdQuery(user.id, id));
  }

  @Post()
  @Idempotent()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID v4 형식의 멱등성 키',
  })
  @ApiOperation({ summary: '태그 생성' })
  @ApiCreatedResponse({ type: CreateTagResponseDto })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  @ApiConflictResponse({
    description:
      '중복된 태그 이름 또는 동일 Idempotency-Key로 동시 요청 처리 중',
  })
  async createTag(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTagRequestDto,
  ): Promise<CreateTagResponseDto> {
    const id = await this.commandBus.execute<CreateTagCommand, number>(
      new CreateTagCommand(user.id, dto.name),
    );
    return CreateTagResponseDto.of(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '태그 수정' })
  @ApiNoContentResponse({ description: '수정 성공' })
  @ApiNotFoundResponse({ description: '태그를 찾을 수 없음' })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  async updateTag(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTagRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(new UpdateTagCommand(user.id, id, dto.name));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '태그 삭제' })
  @ApiNoContentResponse({ description: '삭제 성공' })
  @ApiNotFoundResponse({ description: '태그를 찾을 수 없음' })
  async deleteTag(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteTagCommand(user.id, id));
  }
}
