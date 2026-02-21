import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DeletePostHandler } from '@src/posts/command/delete-post.handler';
import { DeletePostCommand } from '@src/posts/command/delete-post.command';
import { IPostWriteRepository } from '@src/posts/interface/post-write-repository.interface';

describe('DeletePostHandler', () => {
  let handler: DeletePostHandler;
  let mockWriteRepository: jest.Mocked<IPostWriteRepository>;

  beforeEach(async () => {
    mockWriteRepository = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeletePostHandler,
        { provide: IPostWriteRepository, useValue: mockWriteRepository },
      ],
    }).compile();

    handler = module.get(DeletePostHandler);
  });

  it('존재하는 게시글을 삭제하면 에러 없이 완료된다', async () => {
    mockWriteRepository.delete.mockResolvedValue(1);

    const command = new DeletePostCommand(1);

    await expect(handler.execute(command)).resolves.toBeUndefined();
  });

  it('존재하지 않는 게시글을 삭제하면 NotFoundException을 발생시킨다', async () => {
    mockWriteRepository.delete.mockResolvedValue(0);

    const command = new DeletePostCommand(999);

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });
});
