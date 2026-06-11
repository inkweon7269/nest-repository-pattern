import { AuthTokensResponseDto } from './auth-tokens.response.dto';

describe('AuthTokensResponseDto', () => {
  describe('of', () => {
    it('accessToken과 refreshToken을 DTO로 매핑한다', () => {
      const dto = AuthTokensResponseDto.of({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      expect(dto.accessToken).toBe('access-token');
      expect(dto.refreshToken).toBe('refresh-token');
    });

    it('AuthTokensResponseDto 인스턴스를 반환한다', () => {
      const dto = AuthTokensResponseDto.of({
        accessToken: 'a',
        refreshToken: 'r',
      });

      expect(dto).toBeInstanceOf(AuthTokensResponseDto);
    });
  });
});
