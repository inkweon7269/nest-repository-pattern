import { CreatePostResponseDto } from './create-post.response.dto';

describe('CreatePostResponseDto', () => {
  describe('of', () => {
    it('id를 DTO로 매핑한다', () => {
      const dto = CreatePostResponseDto.of(42);

      expect(dto.id).toBe(42);
    });

    it('CreatePostResponseDto 인스턴스를 반환한다', () => {
      const dto = CreatePostResponseDto.of(1);

      expect(dto).toBeInstanceOf(CreatePostResponseDto);
    });
  });
});
