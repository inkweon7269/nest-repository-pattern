import { ApiProperty } from '@nestjs/swagger';
import { AuthTokens } from '@app/shared';

export class AuthTokensResponseDto {
  @ApiProperty({ description: '액세스 토큰' })
  accessToken!: string;

  @ApiProperty({ description: '리프레시 토큰' })
  refreshToken!: string;

  static of(tokens: AuthTokens): AuthTokensResponseDto {
    const dto = new AuthTokensResponseDto();
    dto.accessToken = tokens.accessToken;
    dto.refreshToken = tokens.refreshToken;
    return dto;
  }
}
