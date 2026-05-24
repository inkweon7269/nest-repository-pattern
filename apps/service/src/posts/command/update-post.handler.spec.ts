import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UpdatePostHandler } from './update-post.handler';
import { UpdatePostCommand } from './update-post.command';
import { IPostWriteRepository } from '@service/posts/interface/post-write-repository.interface';
import { ITagReadRepository } from '@service/tags/interface/tag-read-repository.interface';
import { Tag } from '@app/shared';

describe('UpdatePostHandler', () => {
  let handler: UpdatePostHandler;
  let postWriteRepository: Mocked<IPostWriteRepository>;
  let tagReadRepository: Mocked<ITagReadRepository>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(UpdatePostHandler).compile();

    handler = unit;
    postWriteRepository = unitRef.get<IPostWriteRepository>(
      IPostWriteRepository as Type<IPostWriteRepository>,
    );
    tagReadRepository = unitRef.get<ITagReadRepository>(
      ITagReadRepository as Type<ITagReadRepository>,
    );
  });

  it('존재하는 본인의 게시글을 수정하면 void를 반환한다', async () => {
    postWriteRepository.update.mockResolvedValue(1);

    const command = new UpdatePostCommand(
      1,
      1,
      'Updated Title',
      'Content',
      false,
    );
    const result = await handler.execute(command);

    expect(result).toBeUndefined();
    expect(postWriteRepository.update).toHaveBeenCalledWith(1, 1, {
      title: 'Updated Title',
      content: 'Content',
      isPublished: false,
      tagIds: undefined,
    });
  });

  it('소유한 태그가 검증되면 tagIds와 함께 수정한다', async () => {
    tagReadRepository.findByIdsAndUserId.mockResolvedValue([
      { id: 1 } as Tag,
      { id: 2 } as Tag,
    ]);
    postWriteRepository.update.mockResolvedValue(1);

    const command = new UpdatePostCommand(
      1,
      1,
      'Updated Title',
      'Content',
      false,
      [1, 2],
    );
    await handler.execute(command);

    expect(tagReadRepository.findByIdsAndUserId).toHaveBeenCalledWith(
      [1, 2],
      1,
    );
    expect(postWriteRepository.update).toHaveBeenCalledWith(1, 1, {
      title: 'Updated Title',
      content: 'Content',
      isPublished: false,
      tagIds: [1, 2],
    });
  });

  it('요청한 태그 중 소유하지 않은 것이 있으면 BadRequestException을 발생시킨다', async () => {
    tagReadRepository.findByIdsAndUserId.mockResolvedValue([{ id: 1 } as Tag]);

    const command = new UpdatePostCommand(
      1,
      1,
      'Updated Title',
      'Content',
      false,
      [1, 2],
    );

    await expect(handler.execute(command)).rejects.toThrow(BadRequestException);
    expect(postWriteRepository.update).not.toHaveBeenCalled();
  });

  it('affected가 0이면 NotFoundException을 발생시킨다', async () => {
    postWriteRepository.update.mockResolvedValue(0);

    const command = new UpdatePostCommand(
      1,
      999,
      'Updated Title',
      'Content',
      false,
    );

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });
});
