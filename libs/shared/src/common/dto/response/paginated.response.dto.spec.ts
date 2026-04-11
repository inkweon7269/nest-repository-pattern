import { PaginatedResponseDto } from './paginated.response.dto';

describe('PaginatedResponseDto', () => {
  describe('of', () => {
    it('should calculate totalPages correctly', () => {
      const result = PaginatedResponseDto.of(['a', 'b', 'c'], 10, 1, 3);

      expect(result.meta.totalPages).toBe(4); // ceil(10/3) = 4
    });

    it('should mark first page as isFirst=true, isLast=false', () => {
      const result = PaginatedResponseDto.of(['a', 'b'], 5, 1, 2);

      expect(result.meta.isFirst).toBe(true);
      expect(result.meta.isLast).toBe(false);
    });

    it('should mark last page as isFirst=false, isLast=true', () => {
      const result = PaginatedResponseDto.of(['a'], 5, 3, 2);

      expect(result.meta.isFirst).toBe(false);
      expect(result.meta.isLast).toBe(true);
    });

    it('should mark single page as both isFirst and isLast', () => {
      const result = PaginatedResponseDto.of(['a'], 1, 1, 10);

      expect(result.meta.isFirst).toBe(true);
      expect(result.meta.isLast).toBe(true);
    });

    it('should handle empty result', () => {
      const result = PaginatedResponseDto.of([], 0, 1, 10);

      expect(result.items).toEqual([]);
      expect(result.meta.totalElements).toBe(0);
      expect(result.meta.totalPages).toBe(0);
      expect(result.meta.isFirst).toBe(true);
      expect(result.meta.isLast).toBe(true);
    });

    it('should set items and meta correctly', () => {
      const items = [{ id: 1 }, { id: 2 }];
      const result = PaginatedResponseDto.of(items, 7, 2, 3);

      expect(result.items).toBe(items);
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(3);
      expect(result.meta.totalElements).toBe(7);
      expect(result.meta.totalPages).toBe(3); // ceil(7/3) = 3
    });

    it('should handle exact page boundary', () => {
      const result = PaginatedResponseDto.of(['a', 'b'], 6, 3, 2);

      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.isLast).toBe(true);
    });
  });
});
