import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { NotFoundException } from '@nestjs/common';
import { GetTagByIdHandler } from './get-tag-by-id.handler';
import { GetTagByIdQuery } from './get-tag-by-id.query';
import { ITagReadRepository } from '@service/tags/interface/tag-read-repository.interface';
import { TagResponseDto } from '@service/tags/dto/response/tag.response.dto';
import { CacheService, Tag } from '@app/shared';

describe('GetTagByIdHandler', () => {
  let handler: GetTagByIdHandler;
  let tagReadRepository: Mocked<ITagReadRepository>;
  let cacheService: Mocked<CacheService>;

  const now = new Date();
  const mockTag: Tag = {
    id: 1,
    userId: 1,
    name: 'nestjs',
    createdAt: now,
    updatedAt: now,
  } as Tag;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(GetTagByIdHandler).compile();

    handler = unit;
    tagReadRepository = unitRef.get<ITagReadRepository>(
      ITagReadRepository as Type<ITagReadRepository>,
    );
    cacheService = unitRef.get(CacheService);
  });

  it('캐시 히트 시 저장소를 조회하지 않고 캐시된 값을 반환한다', async () => {
    const cached = TagResponseDto.of(mockTag);
    cacheService.get.mockResolvedValue(cached);

    const result = await handler.execute(new GetTagByIdQuery(1, 1));

    expect(result).toBe(cached);
    expect(tagReadRepository.findById).not.toHaveBeenCalled();
    expect(cacheService.set).not.toHaveBeenCalled();
  });

  it('캐시 미스 시 저장소를 조회해 TagResponseDto로 변환하고 캐시에 저장한다', async () => {
    cacheService.get.mockResolvedValue(null);
    tagReadRepository.findById.mockResolvedValue(mockTag);

    const result = await handler.execute(new GetTagByIdQuery(1, 1));

    expect(result).toBeInstanceOf(TagResponseDto);
    expect(result.id).toBe(1);
    expect(result.name).toBe('nestjs');
    expect(tagReadRepository.findById).toHaveBeenCalledWith(1);
    expect(cacheService.set).toHaveBeenCalledWith(
      'tag:1:1',
      expect.any(TagResponseDto),
      expect.any(Number),
    );
  });

  it('존재하지 않는 태그를 조회하면 NotFoundException을 발생시킨다', async () => {
    cacheService.get.mockResolvedValue(null);
    tagReadRepository.findById.mockResolvedValue(null);

    await expect(handler.execute(new GetTagByIdQuery(1, 999))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('다른 사용자의 태그를 조회하면 NotFoundException을 발생시킨다', async () => {
    cacheService.get.mockResolvedValue(null);
    tagReadRepository.findById.mockResolvedValue(mockTag);

    await expect(handler.execute(new GetTagByIdQuery(2, 1))).rejects.toThrow(
      NotFoundException,
    );
  });
});
