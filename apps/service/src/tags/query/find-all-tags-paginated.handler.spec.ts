import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { FindAllTagsPaginatedHandler } from './find-all-tags-paginated.handler';
import { FindAllTagsPaginatedQuery } from './find-all-tags-paginated.query';
import { ITagReadRepository } from '@service/tags/interface/tag-read-repository.interface';
import { TagResponseDto } from '@service/tags/dto/response/tag.response.dto';
import { CacheService, PaginatedResponseDto, Tag } from '@app/shared';

describe('FindAllTagsPaginatedHandler', () => {
  let handler: FindAllTagsPaginatedHandler;
  let tagReadRepository: Mocked<ITagReadRepository>;
  let cacheService: Mocked<CacheService>;

  const now = new Date();
  const mockTags: Tag[] = [
    {
      id: 2,
      userId: 1,
      name: 'typescript',
      createdAt: now,
      updatedAt: now,
    } as Tag,
    {
      id: 1,
      userId: 1,
      name: 'nestjs',
      createdAt: now,
      updatedAt: now,
    } as Tag,
  ];

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      FindAllTagsPaginatedHandler,
    ).compile();

    handler = unit;
    tagReadRepository = unitRef.get<ITagReadRepository>(
      ITagReadRepository as Type<ITagReadRepository>,
    );
    cacheService = unitRef.get(CacheService);
  });

  it('캐시 히트 시 저장소를 조회하지 않고 캐시된 값을 반환한다', async () => {
    const cached = PaginatedResponseDto.of(
      mockTags.map((tag) => TagResponseDto.of(tag)),
      2,
      1,
      10,
    );
    cacheService.get.mockResolvedValue(cached);

    const result = await handler.execute(
      new FindAllTagsPaginatedQuery(1, 10, { userId: 1 }),
    );

    expect(result).toBe(cached);
    expect(tagReadRepository.findAllPaginated).not.toHaveBeenCalled();
    expect(cacheService.set).not.toHaveBeenCalled();
  });

  it('캐시 미스 시 태그 목록을 페이지네이션하여 PaginatedResponseDto로 반환하고 캐시에 저장한다', async () => {
    cacheService.get.mockResolvedValue(null);
    tagReadRepository.findAllPaginated.mockResolvedValue([mockTags, 5]);

    const query = new FindAllTagsPaginatedQuery(1, 2, { userId: 1 });
    const result = await handler.execute(query);

    expect(tagReadRepository.findAllPaginated).toHaveBeenCalledWith(1, 2, {
      userId: 1,
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toBeInstanceOf(TagResponseDto);
    expect(result.items[0].id).toBe(2);
    expect(result.items[1].id).toBe(1);
    expect(result.meta).toEqual({
      page: 1,
      limit: 2,
      totalElements: 5,
      totalPages: 3,
      isFirst: true,
      isLast: false,
    });
    expect(cacheService.set).toHaveBeenCalledWith(
      'tags:1:1:2',
      expect.any(PaginatedResponseDto),
      expect.any(Number),
    );
  });

  it('빈 목록이면 빈 items와 올바른 메타 정보를 반환한다', async () => {
    cacheService.get.mockResolvedValue(null);
    tagReadRepository.findAllPaginated.mockResolvedValue([[], 0]);

    const query = new FindAllTagsPaginatedQuery(1, 10, { userId: 1 });
    const result = await handler.execute(query);

    expect(result.items).toHaveLength(0);
    expect(result.meta.totalElements).toBe(0);
    expect(result.meta.totalPages).toBe(0);
    expect(result.meta.isFirst).toBe(true);
    expect(result.meta.isLast).toBe(true);
  });
});
