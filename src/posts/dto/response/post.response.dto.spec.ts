import { PostResponseDto } from '@src/posts/dto/response/post.response.dto';
import { Post } from '@src/posts/entities/post.entity';

describe('PostResponseDto', () => {
  const now = new Date();

  const createPost = (overrides: Partial<Post> = {}): Post => {
    const post = new Post();
    post.id = 1;
    post.userId = 1;
    post.title = 'Test Title';
    post.content = 'Test Content';
    post.isPublished = false;
    post.createdAt = now;
    post.updatedAt = now;
    Object.assign(post, overrides);
    return post;
  };

  describe('of', () => {
    it('should map all Post entity fields to DTO', () => {
      const post = createPost();

      const dto = PostResponseDto.of(post);

      expect(dto.id).toBe(post.id);
      expect(dto.userId).toBe(post.userId);
      expect(dto.title).toBe(post.title);
      expect(dto.content).toBe(post.content);
      expect(dto.isPublished).toBe(post.isPublished);
      expect(dto.createdAt).toBe(post.createdAt);
      expect(dto.updatedAt).toBe(post.updatedAt);
    });

    it('should return an instance of PostResponseDto', () => {
      const post = createPost();

      const dto = PostResponseDto.of(post);

      expect(dto).toBeInstanceOf(PostResponseDto);
    });

    it('should correctly map isPublished: true', () => {
      const post = createPost({ isPublished: true });

      const dto = PostResponseDto.of(post);

      expect(dto.isPublished).toBe(true);
    });

    it('should correctly map userId', () => {
      const post = createPost({ userId: 42 });

      const dto = PostResponseDto.of(post);

      expect(dto.userId).toBe(42);
    });
  });
});
