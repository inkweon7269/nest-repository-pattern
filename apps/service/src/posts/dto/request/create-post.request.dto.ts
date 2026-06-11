import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePostRequestDto {
  @ApiProperty({ description: '게시글 제목', example: 'First Post' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: '게시글 내용', example: 'Hello World' })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiPropertyOptional({ description: '공개 여부', default: false })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;

  @ApiPropertyOptional({
    description: '연결할 태그 ID 목록',
    type: [Number],
    example: [1, 2],
  })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  tagIds?: number[];
}
