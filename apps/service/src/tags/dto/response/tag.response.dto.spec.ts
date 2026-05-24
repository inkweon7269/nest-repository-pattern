import { TagResponseDto } from './tag.response.dto';
import { Tag } from '@app/shared';

describe('TagResponseDto', () => {
  const now = new Date();

  const createTag = (overrides: Partial<Tag> = {}): Tag => {
    const tag = new Tag();
    tag.id = 1;
    tag.userId = 1;
    tag.name = 'nestjs';
    tag.createdAt = now;
    tag.updatedAt = now;
    Object.assign(tag, overrides);
    return tag;
  };

  describe('of', () => {
    it('Tag 엔티티의 모든 필드를 DTO로 매핑한다', () => {
      const tag = createTag();

      const dto = TagResponseDto.of(tag);

      expect(dto.id).toBe(tag.id);
      expect(dto.userId).toBe(tag.userId);
      expect(dto.name).toBe(tag.name);
      expect(dto.createdAt).toBe(tag.createdAt);
      expect(dto.updatedAt).toBe(tag.updatedAt);
    });

    it('TagResponseDto 인스턴스를 반환한다', () => {
      const dto = TagResponseDto.of(createTag());

      expect(dto).toBeInstanceOf(TagResponseDto);
    });

    it('userId를 올바르게 매핑한다', () => {
      const dto = TagResponseDto.of(createTag({ userId: 42 }));

      expect(dto.userId).toBe(42);
    });
  });
});
