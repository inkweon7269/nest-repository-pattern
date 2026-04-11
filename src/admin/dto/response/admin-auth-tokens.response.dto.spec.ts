import { AdminAuthTokensResponseDto } from '@src/admin/dto/response/admin-auth-tokens.response.dto';

describe('AdminAuthTokensResponseDto', () => {
  describe('of', () => {
    it('accessToken과 refreshToken을 DTO로 매핑한다', () => {
      const dto = AdminAuthTokensResponseDto.of({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      expect(dto.accessToken).toBe('access-token');
      expect(dto.refreshToken).toBe('refresh-token');
    });

    it('AdminAuthTokensResponseDto 인스턴스를 반환한다', () => {
      const dto = AdminAuthTokensResponseDto.of({
        accessToken: 'a',
        refreshToken: 'r',
      });

      expect(dto).toBeInstanceOf(AdminAuthTokensResponseDto);
    });
  });
});
