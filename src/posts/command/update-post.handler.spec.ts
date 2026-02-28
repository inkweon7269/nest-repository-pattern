import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdatePostHandler } from '@src/posts/command/update-post.handler';
import { UpdatePostCommand } from '@src/posts/command/update-post.command';
import { IPostReadRepository } from '@src/posts/interface/post-read-repository.interface';
import { IPostWriteRepository } from '@src/posts/interface/post-write-repository.interface';
import { Post } from '@src/posts/entities/post.entity';

describe('UpdatePostHandler', () => {
  let handler: UpdatePostHandler;
  let mockReadRepository: jest.Mocked<IPostReadRepository>;
  let mockWriteRepository: jest.Mocked<IPostWriteRepository>;

  beforeEach(async () => {
    mockReadRepository = {
      findById: jest.fn(),
      findByUserIdAndTitle: jest.fn(),
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

  it('존재하는 본인의 게시글을 수정하면 void를 반환한다', async () => {
    mockReadRepository.findById.mockResolvedValue({
      id: 1,
      userId: 1,
    } as Post);
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
    expect(mockReadRepository.findById).toHaveBeenCalledWith(1);
    expect(mockWriteRepository.update).toHaveBeenCalledWith(1, {
      title: 'Updated Title',
      content: 'Content',
      isPublished: false,
    });
  });

  it('존재하지 않는 게시글을 수정하면 NotFoundException을 발생시킨다', async () => {
    mockReadRepository.findById.mockResolvedValue(null);

    const command = new UpdatePostCommand(
      1,
      999,
      'Updated Title',
      'Content',
      false,
    );

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    expect(mockWriteRepository.update).not.toHaveBeenCalled();
  });

  it('다른 사용자의 게시글을 수정하면 ForbiddenException을 발생시킨다', async () => {
    mockReadRepository.findById.mockResolvedValue({
      id: 1,
      userId: 2,
    } as Post);

    const command = new UpdatePostCommand(
      1,
      1,
      'Updated Title',
      'Content',
      false,
    );

    await expect(handler.execute(command)).rejects.toThrow(ForbiddenException);
    expect(mockWriteRepository.update).not.toHaveBeenCalled();
  });
});
