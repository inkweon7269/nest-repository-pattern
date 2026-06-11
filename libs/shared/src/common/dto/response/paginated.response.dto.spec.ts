import { PaginatedResponseDto } from './paginated.response.dto';

describe('PaginatedResponseDto', () => {
  describe('of', () => {
    it('totalPages를 올바르게 계산한다', () => {
      const result = PaginatedResponseDto.of(['a', 'b', 'c'], 10, 1, 3);

      expect(result.meta.totalPages).toBe(4); // ceil(10/3) = 4
    });

    it('첫 페이지를 isFirst=true, isLast=false로 표시한다', () => {
      const result = PaginatedResponseDto.of(['a', 'b'], 5, 1, 2);

      expect(result.meta.isFirst).toBe(true);
      expect(result.meta.isLast).toBe(false);
    });

    it('마지막 페이지를 isFirst=false, isLast=true로 표시한다', () => {
      const result = PaginatedResponseDto.of(['a'], 5, 3, 2);

      expect(result.meta.isFirst).toBe(false);
      expect(result.meta.isLast).toBe(true);
    });

    it('단일 페이지를 isFirst와 isLast 모두 true로 표시한다', () => {
      const result = PaginatedResponseDto.of(['a'], 1, 1, 10);

      expect(result.meta.isFirst).toBe(true);
      expect(result.meta.isLast).toBe(true);
    });

    it('빈 결과를 처리한다', () => {
      const result = PaginatedResponseDto.of([], 0, 1, 10);

      expect(result.items).toEqual([]);
      expect(result.meta.totalElements).toBe(0);
      expect(result.meta.totalPages).toBe(0);
      expect(result.meta.isFirst).toBe(true);
      expect(result.meta.isLast).toBe(true);
    });

    it('items와 meta를 올바르게 설정한다', () => {
      const items = [{ id: 1 }, { id: 2 }];
      const result = PaginatedResponseDto.of(items, 7, 2, 3);

      expect(result.items).toBe(items);
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(3);
      expect(result.meta.totalElements).toBe(7);
      expect(result.meta.totalPages).toBe(3); // ceil(7/3) = 3
    });

    it('페이지 경계가 정확히 나누어떨어지는 경우를 처리한다', () => {
      const result = PaginatedResponseDto.of(['a', 'b'], 6, 3, 2);

      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.isLast).toBe(true);
    });
  });
});
