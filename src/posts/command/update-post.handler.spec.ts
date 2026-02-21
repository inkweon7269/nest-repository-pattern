import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UpdatePostHandler } from '@src/posts/command/update-post.handler';
import { UpdatePostCommand } from '@src/posts/command/update-post.command';
import { IPostWriteRepository } from '@src/posts/interface/post-write-repository.interface';

describe('UpdatePostHandler', () => {
  let handler: UpdatePostHandler;
  let mockWriteRepository: jest.Mocked<IPostWriteRepository>;

  beforeEach(async () => {
    mockWriteRepository = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdatePostHandler,
        { provide: IPostWriteRepository, useValue: mockWriteRepository },
      ],
    }).compile();

    handler = module.get(UpdatePostHandler);
  });

  it('존재하는 게시글을 수정하면 void를 반환한다', async () => {
    mockWriteRepository.update.mockResolvedValue(1);

    const command = new UpdatePostCommand(1, 'Updated Title', 'Content', false);
    const result = await handler.execute(command);

    expect(result).toBeUndefined();
  });

  it('존재하지 않는 게시글을 수정하면 NotFoundException을 발생시킨다', async () => {
    mockWriteRepository.update.mockResolvedValue(0);

    const command = new UpdatePostCommand(
      999,
      'Updated Title',
      'Content',
      false,
    );

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });
});
