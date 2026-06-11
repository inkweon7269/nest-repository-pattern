import { ApiProperty } from '@nestjs/swagger';

export class RegisterResponseDto {
  @ApiProperty({ description: '생성된 사용자 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '마케팅 수신 동의', example: true })
  marketingConsent!: boolean;

  static of(id: number, marketingConsent: boolean): RegisterResponseDto {
    const dto = new RegisterResponseDto();
    dto.id = id;
    dto.marketingConsent = marketingConsent;
    return dto;
  }
}
