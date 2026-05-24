import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { BadRequestException } from '@nestjs/common';
import { TagOwnershipValidator } from './tag-ownership.validator';
import { ITagReadRepository } from './interface/tag-read-repository.interface';
import { Tag } from '@app/shared';

describe('TagOwnershipValidator', () => {
  let validator: TagOwnershipValidator;
  let tagReadRepository: Mocked<ITagReadRepository>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      TagOwnershipValidator,
    ).compile();

    validator = unit;
    tagReadRepository = unitRef.get<ITagReadRepository>(
      ITagReadRepository as Type<ITagReadRepository>,
    );
  });

  it('tagIds가 undefined이면 조회 없이 통과한다', async () => {
    await expect(
      validator.validateOwnedByUser(1, undefined),
    ).resolves.toBeUndefined();
    expect(tagReadRepository.findByIdsAndUserId).not.toHaveBeenCalled();
  });

  it('tagIds가 빈 배열이면 조회 없이 통과한다', async () => {
    await expect(validator.validateOwnedByUser(1, [])).resolves.toBeUndefined();
    expect(tagReadRepository.findByIdsAndUserId).not.toHaveBeenCalled();
  });

  it('모든 태그가 사용자 소유면 통과하며 중복 id는 제거하여 조회한다', async () => {
    tagReadRepository.findByIdsAndUserId.mockResolvedValue([
      { id: 1 } as Tag,
      { id: 2 } as Tag,
    ]);

    await expect(
      validator.validateOwnedByUser(1, [1, 2, 1]),
    ).resolves.toBeUndefined();
    expect(tagReadRepository.findByIdsAndUserId).toHaveBeenCalledWith(
      [1, 2],
      1,
    );
  });

  it('소유하지 않거나 존재하지 않는 태그가 있으면 BadRequestException을 발생시킨다', async () => {
    tagReadRepository.findByIdsAndUserId.mockResolvedValue([{ id: 1 } as Tag]);

    await expect(validator.validateOwnedByUser(1, [1, 2])).rejects.toThrow(
      BadRequestException,
    );
  });
});
