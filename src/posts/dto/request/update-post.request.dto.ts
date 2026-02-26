import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

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
}
