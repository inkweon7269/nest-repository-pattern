import { TestBed } from '@suites/unit';
import { NotFoundException } from '@nestjs/common';
import { UpdatePostHandler } from './update-post.handler';
import { UpdatePostCommand } from './update-post.command';
import { IPostWriteRepository } from '@service/posts/interface/post-write-repository.interface';

describe('UpdatePostHandler', () => {
  let handler: UpdatePostHandler;
  let mockWriteRepository: jest.Mocked<IPostWriteRepository>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(UpdatePostHandler).compile();

    handler = unit;
    mockWriteRepository = unitRef.get(IPostWriteRepository);
  });

  it('존재하는 본인의 게시글을 수정하면 void를 반환한다', async () => {
    mockWriteRepository.update.mockResolvedValue(1);

    const command = new UpdatePostCommand(
      1,
      1,
      'Updated Title',
      'Content',
      false,
    );
    const result = await handler.execute(command);

    expect(result).toBeUndefined();
    expect(mockWriteRepository.update).toHaveBeenCalledWith(1, 1, {
      title: 'Updated Title',
      content: 'Content',
      isPublished: false,
    });
  });

  it('affected가 0이면 NotFoundException을 발생시킨다', async () => {
    mockWriteRepository.update.mockResolvedValue(0);

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
