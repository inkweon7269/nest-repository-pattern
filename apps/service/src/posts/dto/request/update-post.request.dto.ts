import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdatePostRequestDto {
  @ApiProperty({ description: '게시글 제목', example: 'Updated Title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: '게시글 내용',
    example: 'Updated Content',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ description: '공개 여부' })
  @IsBoolean()
  isPublished: boolean;

  @ApiPropertyOptional({
    description: '연결할 태그 ID 목록 (제공 시 기존 태그를 이 목록으로 대체)',
    type: [Number],
    example: [1, 2],
  })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  tagIds?: number[];
}
