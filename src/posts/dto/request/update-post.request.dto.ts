import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdatePostRequestDto {
  @ApiPropertyOptional({ description: '게시글 제목', example: 'Updated Title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description: '게시글 내용',
    example: 'Updated Content',
  })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({ description: '공개 여부' })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}
