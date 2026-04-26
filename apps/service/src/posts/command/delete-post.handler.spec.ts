import { TestBed, type Mocked } from '@suites/unit';
import type { Type } from '@suites/types.common';
import { NotFoundException } from '@nestjs/common';
import { DeletePostHandler } from './delete-post.handler';
import { DeletePostCommand } from './delete-post.command';
import { IPostWriteRepository } from '@service/posts/interface/post-write-repository.interface';

describe('DeletePostHandler', () => {
  let handler: DeletePostHandler;
  let postWriteRepository: Mocked<IPostWriteRepository>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(DeletePostHandler).compile();

    handler = unit;
    postWriteRepository = unitRef.get<IPostWriteRepository>(
      IPostWriteRepository as Type<IPostWriteRepository>,
    );
  });

  it('존재하는 본인의 게시글을 삭제하면 에러 없이 완료된다', async () => {
    postWriteRepository.delete.mockResolvedValue(1);

    const command = new DeletePostCommand(1, 1);

    await expect(handler.execute(command)).resolves.toBeUndefined();
    expect(postWriteRepository.delete).toHaveBeenCalledWith(1, 1);
  });

  it('affected가 0이면 NotFoundException을 발생시킨다', async () => {
    postWriteRepository.delete.mockResolvedValue(0);

    const command = new DeletePostCommand(1, 999);

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });
});
