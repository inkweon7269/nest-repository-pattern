import { ApiProperty } from '@nestjs/swagger';

export class AdminRegisterResponseDto {
  @ApiProperty({ description: '생성된 관리자 ID', example: 1 })
  id: number;

  static of(id: number): AdminRegisterResponseDto {
    const dto = new AdminRegisterResponseDto();
    dto.id = id;
    return dto;
  }
}
