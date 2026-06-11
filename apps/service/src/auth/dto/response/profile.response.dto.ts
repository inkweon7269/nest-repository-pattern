import { ApiProperty } from '@nestjs/swagger';
import { User } from '@app/shared';

export class ProfileResponseDto {
  @ApiProperty({ description: '사용자 ID', example: 1 })
  id!: number;

  @ApiProperty({ description: '이메일', example: 'user@example.com' })
  email!: string;

  @ApiProperty({ description: '이름', example: '홍길동' })
  name!: string;

  @ApiProperty({ description: '생성일시' })
  createdAt!: Date;

  @ApiProperty({ description: '수정일시' })
  updatedAt!: Date;

  @ApiProperty({ description: '마케팅 수신 동의', example: true })
  marketingConsent!: boolean;

  static of(user: User): ProfileResponseDto {
    const dto = new ProfileResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.name = user.name;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    dto.marketingConsent = user.marketingConsent;
    return dto;
  }
}
