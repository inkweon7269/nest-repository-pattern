import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationRequestDto } from '@src/common/dto/request/pagination.request.dto';

export class PostsPaginationRequestDto extends PaginationRequestDto {
  @ApiPropertyOptional({ description: '공개 여부 필터', example: true })
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}
