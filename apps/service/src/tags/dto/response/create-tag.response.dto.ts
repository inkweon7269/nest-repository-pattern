import { ApiProperty } from '@nestjs/swagger';

export class CreateTagResponseDto {
  @ApiProperty({ description: '생성된 태그 ID', example: 1 })
  id: number;

  static of(id: number): CreateTagResponseDto {
    const dto = new CreateTagResponseDto();
    dto.id = id;
    return dto;
  }
}
