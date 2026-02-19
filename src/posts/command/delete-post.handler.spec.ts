import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DeletePostHandler } from '@src/posts/command/delete-post.handler';
import { DeletePostCommand } from '@src/posts/command/delete-post.command';
import { IPostReadRepository } from '@src/posts/interface/post-read-repository.interface';
import { IPostWriteRepository } from '@src/posts/interface/post-write-repository.interface';
import { Post } from '@src/posts/entities/post.entity';

describe('DeletePostHandler', () => {
  let handler: DeletePostHandler;
  let mockReadRepository: jest.Mocked<IPostReadRepository>;
  let mockWriteRepository: jest.Mocked<IPostWriteRepository>;

  const now = new Date();
  const mockPost: Post = {
    id: 1,
    title: 'Test Post',
    content: 'Test Content',
    isPublished: false,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(async () => {
    mockReadRepository = {
      findById: jest.fn(),
      findAllPaginated: jest.fn(),
    };

    mockWriteRepository = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeletePostHandler,
        { provide: IPostReadRepository, useValue: mockReadRepository },
        { provide: IPostWriteRepository, useValue: mockWriteRepository },
      ],
    }).compile();

    handler = module.get(DeletePostHandler);
  });

  it('존재하는 게시글을 삭제하면 에러 없이 완료된다', async () => {
    mockReadRepository.findById.mockResolvedValue(mockPost);
    mockWriteRepository.delete.mockResolvedValue(undefined);

    const command = new DeletePostCommand(1);

    await expect(handler.execute(command)).resolves.toBeUndefined();
  });

  it('존재하지 않는 게시글을 삭제하면 NotFoundException을 발생시킨다', async () => {
    mockReadRepository.findById.mockResolvedValue(null);

    const command = new DeletePostCommand(999);

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });
});
