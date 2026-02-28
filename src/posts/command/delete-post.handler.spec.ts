import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeletePostHandler } from '@src/posts/command/delete-post.handler';
import { DeletePostCommand } from '@src/posts/command/delete-post.command';
import { IPostReadRepository } from '@src/posts/interface/post-read-repository.interface';
import { IPostWriteRepository } from '@src/posts/interface/post-write-repository.interface';
import { Post } from '@src/posts/entities/post.entity';

describe('DeletePostHandler', () => {
  let handler: DeletePostHandler;
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
        DeletePostHandler,
        { provide: IPostReadRepository, useValue: mockReadRepository },
        { provide: IPostWriteRepository, useValue: mockWriteRepository },
      ],
    }).compile();

    handler = module.get(DeletePostHandler);
  });

  it('존재하는 본인의 게시글을 삭제하면 에러 없이 완료된다', async () => {
    mockReadRepository.findById.mockResolvedValue({
      id: 1,
      userId: 1,
    } as Post);
    mockWriteRepository.delete.mockResolvedValue(1);

    const command = new DeletePostCommand(1, 1);

    await expect(handler.execute(command)).resolves.toBeUndefined();
    expect(mockReadRepository.findById).toHaveBeenCalledWith(1);
    expect(mockWriteRepository.delete).toHaveBeenCalledWith(1);
  });

  it('존재하지 않는 게시글을 삭제하면 NotFoundException을 발생시킨다', async () => {
    mockReadRepository.findById.mockResolvedValue(null);

    const command = new DeletePostCommand(1, 999);

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    expect(mockWriteRepository.delete).not.toHaveBeenCalled();
  });

  it('삭제 시 affected가 0이면 NotFoundException을 발생시킨다', async () => {
    mockReadRepository.findById.mockResolvedValue({
      id: 1,
      userId: 1,
    } as Post);
    mockWriteRepository.delete.mockResolvedValue(0);

    const command = new DeletePostCommand(1, 1);

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
  });

  it('다른 사용자의 게시글을 삭제하면 ForbiddenException을 발생시킨다', async () => {
    mockReadRepository.findById.mockResolvedValue({
      id: 1,
      userId: 2,
    } as Post);

    const command = new DeletePostCommand(1, 1);

    await expect(handler.execute(command)).rejects.toThrow(ForbiddenException);
    expect(mockWriteRepository.delete).not.toHaveBeenCalled();
  });
});
