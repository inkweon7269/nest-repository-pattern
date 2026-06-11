import { RegisterResponseDto } from './register.response.dto';

describe('RegisterResponseDto', () => {
  describe('of', () => {
    it('id를 DTO로 매핑한다', () => {
      const dto = RegisterResponseDto.of(42, true);

      expect(dto.id).toBe(42);
    });

    it('RegisterResponseDto 인스턴스를 반환한다', () => {
      const dto = RegisterResponseDto.of(1, true);

      expect(dto).toBeInstanceOf(RegisterResponseDto);
    });

    it('marketingConsent가 true면 true로 매핑한다', () => {
      const dto = RegisterResponseDto.of(1, true);

      expect(dto.marketingConsent).toBe(true);
    });

    it('marketingConsent가 false면 false로 매핑한다', () => {
      const dto = RegisterResponseDto.of(1, false);

      expect(dto.marketingConsent).toBe(false);
    });
  });
});
