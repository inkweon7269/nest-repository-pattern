import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import { PaginationRequestDto } from '@app/shared';

export class PostsPaginationRequestDto extends PaginationRequestDto {
  @ApiPropertyOptional({ description: '공개 여부 필터', example: true })
  @Transform(({ value }: { value: string }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;

  @ApiPropertyOptional({ description: '태그 ID 필터', example: 1 })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  tagId?: number;
}
