import { CreateTagResponseDto } from './create-tag.response.dto';

describe('CreateTagResponseDto', () => {
  describe('of', () => {
    it('id를 DTO로 매핑한다', () => {
      const dto = CreateTagResponseDto.of(42);

      expect(dto.id).toBe(42);
    });

    it('CreateTagResponseDto 인스턴스를 반환한다', () => {
      const dto = CreateTagResponseDto.of(1);

      expect(dto).toBeInstanceOf(CreateTagResponseDto);
    });
  });
});
