import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { NotFoundException } from '@nestjs/common';
import { DeleteTagHandler } from './delete-tag.handler';
import { DeleteTagCommand } from './delete-tag.command';
import { ITagWriteRepository } from '@service/tags/interface/tag-write-repository.interface';
import { CacheService } from '@app/shared';

describe('DeleteTagHandler', () => {
  let handler: DeleteTagHandler;
  let tagWriteRepository: Mocked<ITagWriteRepository>;
  let cacheService: Mocked<CacheService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(DeleteTagHandler).compile();

    handler = unit;
    tagWriteRepository = unitRef.get<ITagWriteRepository>(
      ITagWriteRepository as Type<ITagWriteRepository>,
    );
    cacheService = unitRef.get(CacheService);
  });

  it('존재하는 본인의 태그를 삭제하면 void를 반환하고 캐시를 무효화한다', async () => {
    tagWriteRepository.delete.mockResolvedValue(1);

    const command = new DeleteTagCommand(1, 5);
    const result = await handler.execute(command);

    expect(result).toBeUndefined();
    expect(tagWriteRepository.delete).toHaveBeenCalledWith(5, 1);
    expect(cacheService.del).toHaveBeenCalledWith('tag:1:5');
    expect(cacheService.delByPattern).toHaveBeenCalledWith('tags:1:*');
    expect(cacheService.delByPattern).toHaveBeenCalledWith('posts:1:*');
    expect(cacheService.delByPattern).toHaveBeenCalledWith('post:1:*');
  });

  it('affected가 0이면 NotFoundException을 발생시킨다', async () => {
    tagWriteRepository.delete.mockResolvedValue(0);

    const command = new DeleteTagCommand(1, 999);

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    expect(cacheService.del).not.toHaveBeenCalled();
  });
});
