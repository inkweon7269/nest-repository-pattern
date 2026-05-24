import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { UpdateTagHandler } from './update-tag.handler';
import { UpdateTagCommand } from './update-tag.command';
import { ITagWriteRepository } from '@service/tags/interface/tag-write-repository.interface';
import { CacheService } from '@app/shared';

describe('UpdateTagHandler', () => {
  let handler: UpdateTagHandler;
  let tagWriteRepository: Mocked<ITagWriteRepository>;
  let cacheService: Mocked<CacheService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(UpdateTagHandler).compile();

    handler = unit;
    tagWriteRepository = unitRef.get<ITagWriteRepository>(
      ITagWriteRepository as Type<ITagWriteRepository>,
    );
    cacheService = unitRef.get(CacheService);
  });

  it('존재하는 본인의 태그를 수정하면 void를 반환하고 캐시를 무효화한다', async () => {
    tagWriteRepository.update.mockResolvedValue(1);

    const command = new UpdateTagCommand(1, 5, 'typescript');
    const result = await handler.execute(command);

    expect(result).toBeUndefined();
    expect(tagWriteRepository.update).toHaveBeenCalledWith(5, 1, {
      name: 'typescript',
    });
    expect(cacheService.del).toHaveBeenCalledWith('tag:1:5');
    expect(cacheService.delByPattern).toHaveBeenCalledWith('tags:1:*');
    expect(cacheService.delByPattern).toHaveBeenCalledWith('posts:1:*');
    expect(cacheService.delByPattern).toHaveBeenCalledWith('post:1:*');
  });

  it('affected가 0이면 NotFoundException을 발생시킨다', async () => {
    tagWriteRepository.update.mockResolvedValue(0);

    const command = new UpdateTagCommand(1, 999, 'typescript');

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    expect(cacheService.del).not.toHaveBeenCalled();
  });

  it('update에서 23505 QueryFailedError가 발생하면 ConflictException으로 변환한다', async () => {
    tagWriteRepository.update.mockRejectedValue(
      new QueryFailedError('update', [], {
        code: '23505',
      } as unknown as Error),
    );

    const command = new UpdateTagCommand(1, 5, 'duplicate');

    await expect(handler.execute(command)).rejects.toThrow(ConflictException);
    expect(cacheService.del).not.toHaveBeenCalled();
  });
});
