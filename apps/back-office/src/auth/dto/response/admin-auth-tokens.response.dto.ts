import { ApiProperty } from '@nestjs/swagger';
import { AuthTokens } from '@app/shared';

export class AdminAuthTokensResponseDto {
  @ApiProperty({ description: '액세스 토큰' })
  accessToken!: string;

  @ApiProperty({ description: '리프레시 토큰' })
  refreshToken!: string;

  static of(tokens: AuthTokens): AdminAuthTokensResponseDto {
    const dto = new AdminAuthTokensResponseDto();
    dto.accessToken = tokens.accessToken;
    dto.refreshToken = tokens.refreshToken;
    return dto;
  }
}
