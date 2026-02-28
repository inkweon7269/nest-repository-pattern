import { RegisterResponseDto } from '@src/auth/dto/response/register.response.dto';

describe('RegisterResponseDto', () => {
  describe('of', () => {
    it('should map id to DTO', () => {
      const dto = RegisterResponseDto.of(42);

      expect(dto.id).toBe(42);
    });

    it('should return an instance of RegisterResponseDto', () => {
      const dto = RegisterResponseDto.of(1);

      expect(dto).toBeInstanceOf(RegisterResponseDto);
    });
  });
});
