import { ApiProperty } from '@nestjs/swagger';

export class CreatePostResponseDto {
  @ApiProperty({ description: '생성된 게시글 ID', example: 1 })
  id: number;

  static of(id: number): CreatePostResponseDto {
    const dto = new CreatePostResponseDto();
    dto.id = id;
    return dto;
  }
}
