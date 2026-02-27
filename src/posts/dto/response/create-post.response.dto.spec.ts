import { CreatePostResponseDto } from '@src/posts/dto/response/create-post.response.dto';

describe('CreatePostResponseDto', () => {
  describe('of', () => {
    it('should map id to DTO', () => {
      const dto = CreatePostResponseDto.of(42);

      expect(dto.id).toBe(42);
    });

    it('should return an instance of CreatePostResponseDto', () => {
      const dto = CreatePostResponseDto.of(1);

      expect(dto).toBeInstanceOf(CreatePostResponseDto);
    });
  });
});
