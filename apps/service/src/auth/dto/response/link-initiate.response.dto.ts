import { ApiProperty } from '@nestjs/swagger';

export class LinkInitiateResponseDto {
  @ApiProperty({
    description:
      'Google 동의 화면 URL. 프론트는 이 URL로 window.location.href를 이동시킨다.',
    example:
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=...&state=...',
  })
  authorizationUrl: string;

  static of(authorizationUrl: string): LinkInitiateResponseDto {
    const dto = new LinkInitiateResponseDto();
    dto.authorizationUrl = authorizationUrl;
    return dto;
  }
}
