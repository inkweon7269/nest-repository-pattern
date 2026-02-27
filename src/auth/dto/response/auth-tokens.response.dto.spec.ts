import { AuthTokensResponseDto } from '@src/auth/dto/response/auth-tokens.response.dto';

describe('AuthTokensResponseDto', () => {
  describe('of', () => {
    it('should map accessToken and refreshToken to DTO', () => {
      const dto = AuthTokensResponseDto.of({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      expect(dto.accessToken).toBe('access-token');
      expect(dto.refreshToken).toBe('refresh-token');
    });

    it('should return an instance of AuthTokensResponseDto', () => {
      const dto = AuthTokensResponseDto.of({
        accessToken: 'a',
        refreshToken: 'r',
      });

      expect(dto).toBeInstanceOf(AuthTokensResponseDto);
    });
  });
});
