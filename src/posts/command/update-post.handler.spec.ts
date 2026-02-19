import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UpdatePostHandler } from '@src/posts/command/update-post.handler';
import { UpdatePostCommand } from '@src/posts/command/update-post.command';
import { IPostReadRepository } from '@src/posts/interface/post-read-repository.interface';
import { IPostWriteRepository } from '@src/posts/interface/post-write-repository.interface';
import { Post } from '@src/posts/entities/post.entity';

describe('UpdatePostHandler', () => {
  let handler: UpdatePostHandler;
  let mockReadRepository: jest.Mocked<IPostReadRepository>;
  let mockWriteRepository: jest.Mocked<IPostWriteRepository>;

  const now = new Date();
  const mockPost: Post = {
    id: 1,
    title: 'Original Title',
    content: 'Original Content',
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
        UpdatePostHandler,
        { provide: IPostReadRepository, useValue: mockReadRepository },
        { provide: IPostWriteRepository, useValue: mockWriteRepository },
      ],
    }).compile();

    handler = module.get(UpdatePostHandler);
  });

  it('존재하는 게시글을 수정하면 void를 반환한다', async () => {
    mockReadRepository.findById.mockResolvedValue(mockPost);
    mockWriteRepository.update.mockResolvedValue(undefined);

    const command = new UpdatePostCommand(1, 'Updated Title');
    const result = await handler.execute(command);

    expect(result).toBeUndefined();
  });

  it('존재하지 않는 게시글을 수정하면 NotFoundException을 발생시킨다', async () => {
    mockReadRepository.findById.mockResolvedValue(null);

    const command = new UpdatePostCommand(999, 'Updated Title');

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });
});
