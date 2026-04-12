import { ApiProperty } from '@nestjs/swagger';

export class RegisterResponseDto {
  @ApiProperty({ description: '생성된 사용자 ID', example: 1 })
  id: number;

  static of(id: number): RegisterResponseDto {
    const dto = new RegisterResponseDto();
    dto.id = id;
    return dto;
  }
}
