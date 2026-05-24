import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CreateTagHandler } from './create-tag.handler';
import { CreateTagCommand } from './create-tag.command';
import { ITagReadRepository } from '@service/tags/interface/tag-read-repository.interface';
import { ITagWriteRepository } from '@service/tags/interface/tag-write-repository.interface';
import { CacheService, Tag } from '@app/shared';

describe('CreateTagHandler', () => {
  let handler: CreateTagHandler;
  let tagReadRepository: Mocked<ITagReadRepository>;
  let tagWriteRepository: Mocked<ITagWriteRepository>;
  let cacheService: Mocked<CacheService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(CreateTagHandler).compile();

    handler = unit;
    tagReadRepository = unitRef.get<ITagReadRepository>(
      ITagReadRepository as Type<ITagReadRepository>,
    );
    tagWriteRepository = unitRef.get<ITagWriteRepository>(
      ITagWriteRepository as Type<ITagWriteRepository>,
    );
    cacheService = unitRef.get(CacheService);
  });

  it('중복되지 않는 이름이면 태그를 생성하고 id를 반환한다', async () => {
    tagReadRepository.findByUserIdAndName.mockResolvedValue(null);
    tagWriteRepository.create.mockResolvedValue({ id: 1 } as Tag);

    const command = new CreateTagCommand(1, 'nestjs');
    const result = await handler.execute(command);

    expect(result).toBe(1);
    expect(tagReadRepository.findByUserIdAndName).toHaveBeenCalledWith(
      1,
      'nestjs',
    );
    expect(tagWriteRepository.create).toHaveBeenCalledWith({
      userId: 1,
      name: 'nestjs',
    });
    expect(cacheService.delByPattern).toHaveBeenCalledWith('tags:1:*');
  });

  it('동일한 이름이 이미 존재하면 ConflictException을 발생시키고 create를 호출하지 않는다', async () => {
    tagReadRepository.findByUserIdAndName.mockResolvedValue({ id: 1 } as Tag);

    const command = new CreateTagCommand(1, 'nestjs');

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
    expect(tagWriteRepository.create).not.toHaveBeenCalled();
  });

  it('create에서 23505 QueryFailedError가 발생하면 ConflictException으로 변환한다', async () => {
    tagReadRepository.findByUserIdAndName.mockResolvedValue(null);
    tagWriteRepository.create.mockRejectedValue(
      new QueryFailedError('insert', [], {
        code: '23505',
      } as unknown as Error),
    );

    const command = new CreateTagCommand(1, 'nestjs');

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
  });
});
