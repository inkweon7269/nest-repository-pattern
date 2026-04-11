import { AdminRegisterResponseDto } from '@src/admin/dto/response/admin-register.response.dto';

describe('AdminRegisterResponseDto', () => {
  describe('of', () => {
    it('id를 DTO로 매핑한다', () => {
      const dto = AdminRegisterResponseDto.of(42);

      expect(dto.id).toBe(42);
    });

    it('AdminRegisterResponseDto 인스턴스를 반환한다', () => {
      const dto = AdminRegisterResponseDto.of(1);

      expect(dto).toBeInstanceOf(AdminRegisterResponseDto);
    });
  });
});
